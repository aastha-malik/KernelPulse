"""
KernelPulse — ml_model.py  (v2 — genuinely useful)
====================================================

Three models that actually help a server admin:

1. LeakDetector
   ─────────────
   Detects monotonically-increasing patterns that z-score misses.
   A slow RAM leak might never cross the z-score threshold because
   the absolute level is "normal" — but it keeps growing every sample.
   Checks: are >80% of recent readings higher than the previous one?

2. ExhaustionPredictor
   ─────────────────────
   "Your RAM will be full in ~2 hours 14 minutes."
   Uses linear regression over the full available history to project
   when a capacity metric (RAM %, disk %) will hit a critical level.
   Unlike the old 6-second forecast, this is applied ONLY to metrics
   that are capacity-bounded and change slowly — where a straight-line
   extrapolation is actually meaningful.

3. SustainedAnomalyTracker
   ──────────────────────────
   A 1-second CPU spike and a 4-minute CPU anomaly are NOT the same.
   This tracks how long each metric has been in its current state.
   Sustained anomalies get escalated advice ("Investigate NOW") while
   transient spikes get softer advice ("Monitor closely").

What was REMOVED vs. v1:
   ✗ 6-second linear forecast on volatile metrics (CPU, network) — useless
   ✗ R² confidence score — misleading on short noisy windows
   ✗ EWMA exposed as a display value — only used internally for detection

What was KEPT:
   ✓ EWMA for smoothing before z-score (it's good, just internal)
   ✓ describe() for the "About the ML Model" panel
"""

import time

# ── Optional scikit-learn (only used in ExhaustionPredictor) ─────────────────
try:
    from sklearn.linear_model import LinearRegression as _SKLearnLR
    import numpy as _np
    _SKLEARN = True
except ImportError:
    _SKLEARN = False

# ── Constants ─────────────────────────────────────────────────────────────────
DEFAULT_EWMA_ALPHA      = 0.3
LEAK_WINDOW             = 30    # samples checked for monotonic growth
LEAK_THRESHOLD_PCT      = 0.80  # >80% of samples must be increases
LEAK_MIN_GROWTH         = 0.05  # minimum growth per sample (filters flat noise)
EXHAUSTION_CRITICAL_PCT = 95.0  # what "full" means (%)
EXHAUSTION_MIN_SAMPLES  = 30    # minimum history to make a forecast
SUSTAINED_THRESHOLD_SEC = 30    # how long before a state is "sustained" not a spike


# ─────────────────────────────────────────────────────────────────────────────
# Shared utility: pure-Python OLS linear regression
# ─────────────────────────────────────────────────────────────────────────────
def _linreg(x: list, y: list) -> tuple:
    """Return (slope, intercept) via Ordinary Least Squares."""
    n = len(x)
    if n < 2:
        return 0.0, float(y[-1]) if y else 0.0
    sx = sum(x); sy = sum(y)
    sxy = sum(xi * yi for xi, yi in zip(x, y))
    sxx = sum(xi * xi for xi in x)
    d = n * sxx - sx * sx
    if d == 0:
        return 0.0, sy / n
    slope = (n * sxy - sx * sy) / d
    return slope, (sy - slope * sx) / n


# ─────────────────────────────────────────────────────────────────────────────
# 1. LeakDetector
# ─────────────────────────────────────────────────────────────────────────────
class LeakDetector:
    """
    Detects slow, steady growth patterns — the kind a memory leak produces.

    Z-score misses this because:
      - The absolute level may never exceed 2.5σ from the historical mean
      - The value drifts up slowly, so the mean and the value move together

    This detector asks a different question:
      "Is this metric consistently going up, sample after sample?"

    Training data: the most recent `window` samples from the SQLite history.
    No state is stored — call check() each poll cycle.
    """

    def check(self, values: list, window: int = LEAK_WINDOW) -> dict | None:
        """
        Analyse recent history for a monotonic growth pattern.

        Parameters
        ----------
        values  : ordered list of metric values (oldest → newest)
        window  : how many recent samples to examine

        Returns
        -------
        dict with keys:
          is_leaking          : bool
          consecutive_pct     : % of recent sample-pairs that were increases
          growth_per_sample   : average increase per sample
          growth_per_minute   : projected increase per minute (at 2s polling)
          samples_checked     : actual window size used
        Returns None if not enough data.
        """
        if len(values) < max(10, window // 2):
            return None

        recent = values[-window:]
        n = len(recent)
        pairs = n - 1

        increases   = sum(1 for i in range(1, n) if recent[i] > recent[i - 1])
        inc_pct     = increases / pairs if pairs > 0 else 0.0
        growth_ps   = (recent[-1] - recent[0]) / n   # avg per sample

        # growth_per_minute: at 2s polling, 30 samples/min
        growth_pm   = growth_ps * 30

        is_leaking = (inc_pct >= LEAK_THRESHOLD_PCT) and (growth_ps >= LEAK_MIN_GROWTH)

        return {
            "is_leaking":        is_leaking,
            "consecutive_pct":   round(inc_pct * 100, 1),
            "growth_per_sample": round(growth_ps, 4),
            "growth_per_minute": round(growth_pm, 3),
            "samples_checked":   n,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 2. ExhaustionPredictor
# ─────────────────────────────────────────────────────────────────────────────
class ExhaustionPredictor:
    """
    Predicts how long until a capacity-bounded metric reaches a critical level.

    ONLY applied to metrics that are:
      - Bounded (have a hard 0–100% ceiling): RAM usage %, disk usage %
      - Meaningful over longer timescales (not noisy per-second CPU)

    Why linear regression works here (unlike for CPU):
      - RAM and disk usage change slowly and continuously
      - A leak or steady fill has a clear, consistent slope over 5–30 minutes
      - Short-horizon linear extrapolation is a reasonable approximation

    Training data: the full available history (up to 200 samples = ~6.6min).
    If you need longer horizons (hours), store slow_metrics in SQLite separately.
    """

    def predict(
        self,
        values: list,
        sample_interval_sec: float = 2.0,
        critical_pct: float = EXHAUSTION_CRITICAL_PCT,
        min_samples: int = EXHAUSTION_MIN_SAMPLES,
    ) -> dict | None:
        """
        Fit a trend on recent values and project time to the critical threshold.

        Returns
        -------
        dict with keys:
          minutes_to_exhaustion : float  (None if not trending upward)
          hours_label           : str    e.g. "2h 14m" or "47min"
          slope_per_sample      : float  (rate of change per poll cycle)
          current_pct           : float
          critical_pct          : float

        Returns None if metric is stable or trending down.
        """
        if len(values) < min_samples:
            return None

        x = list(range(len(values)))
        y = values

        if _SKLEARN:
            X = _np.array(x).reshape(-1, 1)
            model = _SKLearnLR().fit(X, _np.array(y))
            slope     = float(model.coef_[0])
            intercept = float(model.intercept_)
        else:
            slope, intercept = _linreg(x, y)

        # Only forecast if meaningfully growing (>0.02% per sample)
        if slope <= 0.02:
            return None

        # Solve for samples_needed: critical = slope*(n + k) + intercept
        n = len(values)
        current_est = slope * (n - 1) + intercept
        if current_est >= critical_pct:
            return {"minutes_to_exhaustion": 0, "hours_label": "CRITICAL NOW",
                    "slope_per_sample": round(slope, 5), "current_pct": round(values[-1], 1),
                    "critical_pct": critical_pct}

        samples_needed = (critical_pct - current_est) / slope
        minutes = (samples_needed * sample_interval_sec) / 60.0

        if minutes > 60 * 24 * 7:   # More than a week → not actionable
            return None

        hours   = int(minutes // 60)
        mins    = int(minutes % 60)
        if hours > 0:
            label = f"{hours}h {mins}m"
        else:
            label = f"{int(minutes)}min"

        return {
            "minutes_to_exhaustion": round(minutes, 1),
            "hours_label":           label,
            "slope_per_sample":      round(slope, 5),
            "current_pct":           round(values[-1], 1),
            "critical_pct":          critical_pct,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. SustainedAnomalyTracker
# ─────────────────────────────────────────────────────────────────────────────
class SustainedAnomalyTracker:
    """
    Tracks how long each metric has been in a given state.

    A 1-sample CPU spike and a 5-minute CPU anomaly are completely
    different situations requiring completely different responses.
    This gives the advice engine that context.

    State machine per metric:
      NORMAL / LEARNING  ←→  WARNING  ←→  ANOMALY

    On every status change, the entry timestamp resets.
    No persistence to DB — in-memory only (restarts on server restart).
    """

    def __init__(self):
        # { metric_name: (status: str, entered_at: float) }
        self._state: dict[str, tuple] = {}

    def update(self, metric_name: str, status: str):
        """Call once per poll cycle after anomaly detection."""
        prev = self._state.get(metric_name)
        if prev is None or prev[0] != status:
            self._state[metric_name] = (status, time.time())

    def duration_sec(self, metric_name: str) -> int:
        entry = self._state.get(metric_name)
        if entry is None:
            return 0
        return max(0, int(time.time() - entry[1]))

    def format_duration(self, metric_name: str) -> str:
        s = self.duration_sec(metric_name)
        if s < 60:
            return f"{s}s"
        return f"{s // 60}m {s % 60}s"

    def is_sustained(self, metric_name: str,
                     threshold: int = SUSTAINED_THRESHOLD_SEC) -> bool:
        return self.duration_sec(metric_name) >= threshold

    def get_all(self) -> dict:
        return {
            m: {
                "status":           v[0],
                "duration_seconds": self.duration_sec(m),
                "duration_label":   self.format_duration(m),
                "is_sustained":     self.is_sustained(m),
            }
            for m, v in self._state.items()
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. EWMA (kept — used internally for z-score smoothing, not displayed)
# ─────────────────────────────────────────────────────────────────────────────
class EWMAState:
    """Exponential Weighted Moving Average — one per metric, internal use only."""

    def __init__(self, alpha: float = DEFAULT_EWMA_ALPHA):
        self.alpha = alpha
        self._state: dict[str, float] = {}

    def update(self, metric_name: str, value: float) -> float:
        if metric_name not in self._state:
            self._state[metric_name] = value
        else:
            a = self.alpha
            self._state[metric_name] = a * value + (1 - a) * self._state[metric_name]
        return self._state[metric_name]

    def get(self, metric_name: str, default: float = 0.0) -> float:
        return self._state.get(metric_name, default)

    def get_all(self) -> dict:
        return {k: round(v, 2) for k, v in self._state.items()}


# ─────────────────────────────────────────────────────────────────────────────
# Public facade — what ai_module.py imports
# ─────────────────────────────────────────────────────────────────────────────
class MetricPredictor:
    """
    Facade that wires together all models.
    ai_module.py calls this; it doesn't need to know the internals.
    """

    def __init__(self, ewma_alpha: float = DEFAULT_EWMA_ALPHA):
        self.ewma          = EWMAState(alpha=ewma_alpha)
        self.leak          = LeakDetector()
        self.exhaustion    = ExhaustionPredictor()
        self.anomaly_timer = SustainedAnomalyTracker()

    def update_ewma(self, metric: str, value: float) -> float:
        return self.ewma.update(metric, value)

    def get_ewma(self, metric: str, default: float = 0.0) -> float:
        return self.ewma.get(metric, default)

    def check_leak(self, _metric: str, history: list) -> dict | None:
        return self.leak.check(history)

    def predict_exhaustion(self, _metric: str, history: list) -> dict | None:
        """Only call for RAM% and disk% — not CPU or network."""
        return self.exhaustion.predict(history)

    def track_state(self, metric: str, status: str):
        self.anomaly_timer.update(metric, status)

    def state_duration(self, metric: str) -> str:
        return self.anomaly_timer.format_duration(metric)

    def is_sustained(self, metric: str) -> bool:
        return self.anomaly_timer.is_sustained(metric)

    def get_all_durations(self) -> dict:
        return self.anomaly_timer.get_all()

    def describe(self) -> dict:
        return {
            "models": {
                "leak_detector":      "Monotonic growth detector (>80% samples increasing)",
                "exhaustion_predictor": "Linear regression on capacity metrics (RAM%, disk%)",
                "anomaly_timer":      "State duration tracker (spike vs. sustained)",
                "ewma":               "Exponential smoothing for z-score baseline (internal)",
            },
            "training_data": (
                "Live server telemetry — rolling SQLite window, last 200 samples "
                "per metric (~6.6 minutes at 2s polling). No pre-trained weights. "
                "Leak and exhaustion models fit on-demand each poll cycle."
            ),
            "ewma_alpha":          self.ewma.alpha,
            "leak_window_samples": LEAK_WINDOW,
            "exhaustion_critical": EXHAUSTION_CRITICAL_PCT,
            "sustained_threshold": f"{SUSTAINED_THRESHOLD_SEC}s",
        }
