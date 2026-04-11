"""
KernelPulse — ai_module.py  (v2)
==================================
Uses the three genuinely useful models from ml_model.py:

  1. LeakDetector          — catches slow RAM growth z-score misses
  2. ExhaustionPredictor   — "RAM full in 2h 14m"
  3. SustainedAnomalyTracker — "CPU anomaly for 4m 30s" vs. 1-sample spike

The advice engine now produces context-aware, actionable recommendations
that factor in DURATION, LEAK patterns, and TIME-TO-EXHAUSTION — not just
whether a metric crossed a threshold.
"""

import time
import sqlite3
import statistics

from ml_model import MetricPredictor

# ── Tuning ────────────────────────────────────────────────────────────────────
HISTORY_SIZE         = 200    # SQLite rolling window per metric
LEARNING_MIN_SAMPLES = 20     # samples before anomaly detection
Z_THRESHOLD          = 2.5    # z-score → ANOMALY
Z_WARN_RATIO         = 0.75   # fraction → WARNING
SMOOTHING_WINDOW     = 5      # moving-average window for z-score input

# Metrics that are capacity-bounded → eligible for exhaustion prediction
CAPACITY_METRICS = {"ram", "disk_read"}


class SystemAnomalyDetector:

    def __init__(
        self,
        db_path:          str   = 'metrics.db',
        history_size:     int   = HISTORY_SIZE,
        z_threshold:      float = Z_THRESHOLD,
        smoothing_window: int   = SMOOTHING_WINDOW,
        ewma_alpha:       float = 0.3,
    ):
        self.db_path          = db_path
        self.history_size     = history_size
        self.z_threshold      = z_threshold
        self.smoothing_window = smoothing_window

        # Per-metric state
        self.active_anomalies: dict[str, str]  = {}
        self.exhaustion_info:  dict[str, dict] = {}   # ram / disk exhaustion forecasts
        self.leak_info:        dict[str, dict] = {}   # detected leak data
        self.advice_cache:     list[str]       = []

        # ML models
        self.predictor = MetricPredictor(ewma_alpha=ewma_alpha)

        self._init_db()

    # ── DB bootstrap ─────────────────────────────────────────────────────────
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        try:
            c = conn.cursor()
            c.execute('''CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL, metric_name TEXT, value REAL
            )''')
            c.execute('''CREATE TABLE IF NOT EXISTS advice_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL, advice TEXT
            )''')
            conn.commit()
        finally:
            conn.close()

    # ── Public: ingest a data point ───────────────────────────────────────────
    def update(self, metric_name: str, value) -> str:
        """
        Pipeline per poll cycle:
          1. Persist sample to SQLite rolling window
          2. Update EWMA (internal smoothing)
          3. Z-score anomaly detection
          4. Track state duration (sustained vs. spike)
          5. Leak detection (for all metrics)
          6. Exhaustion prediction (for capacity metrics: RAM, disk)
          7. Refresh advice cache
        """
        try:
            value = float(value)
        except (ValueError, TypeError):
            return self.active_anomalies.get(metric_name, "NORMAL")

        # ── 1. Persist ───────────────────────────────────────────────────────
        ts = time.time()
        conn = sqlite3.connect(self.db_path)
        try:
            c = conn.cursor()
            c.execute('INSERT INTO metrics (timestamp, metric_name, value) VALUES (?,?,?)',
                      (ts, metric_name, value))
            c.execute('''DELETE FROM metrics WHERE metric_name=? AND id NOT IN (
                SELECT id FROM metrics WHERE metric_name=? ORDER BY timestamp DESC LIMIT ?
            )''', (metric_name, metric_name, self.history_size))
            conn.commit()
            c.execute('SELECT value FROM metrics WHERE metric_name=? ORDER BY timestamp ASC',
                      (metric_name,))
            history = [r[0] for r in c.fetchall()]
        finally:
            conn.close()

        n = len(history)

        # ── 2. EWMA (internal) ────────────────────────────────────────────────
        self.predictor.update_ewma(metric_name, value)

        # ── 3. Learning gate ──────────────────────────────────────────────────
        if n < LEARNING_MIN_SAMPLES:
            status = "LEARNING"
            self.active_anomalies[metric_name] = status
            self.predictor.track_state(metric_name, status)
            return status

        # ── 4. Z-score anomaly detection ──────────────────────────────────────
        win      = max(3, self.smoothing_window)
        smoothed = statistics.mean(history[-win:])
        mean     = statistics.mean(history)
        stdev    = statistics.stdev(history) if n > 1 else 0.0

        if stdev > 0:
            z = abs(smoothed - mean) / stdev
            status = ("ANOMALY" if z > self.z_threshold
                      else "WARNING" if z > self.z_threshold * Z_WARN_RATIO
                      else "NORMAL")
        elif smoothed > mean * 1.5:
            status = "WARNING"
        else:
            status = "NORMAL"

        self.active_anomalies[metric_name] = status

        # ── 5. State duration tracking ────────────────────────────────────────
        self.predictor.track_state(metric_name, status)

        # ── 6. Leak detection (every metric) ─────────────────────────────────
        leak = self.predictor.check_leak(metric_name, history)
        if leak:
            self.leak_info[metric_name] = leak

        # ── 7. Exhaustion prediction (capacity metrics only) ──────────────────
        if metric_name in CAPACITY_METRICS:
            exh = self.predictor.predict_exhaustion(metric_name, history)
            if exh:
                self.exhaustion_info[metric_name] = exh
            else:
                self.exhaustion_info.pop(metric_name, None)

        # ── 8. Refresh advice ─────────────────────────────────────────────────
        self._generate_advice()

        return status

    # ── Advice engine ─────────────────────────────────────────────────────────
    def _generate_advice(self):
        """
        Produces actionable, contextual advice using:
          - Current anomaly status
          - Duration (sustained vs. transient)
          - Leak detection results
          - Exhaustion forecasts
          - Cross-metric correlations
        """
        advice  = []
        status  = self.active_anomalies
        ewma    = self.predictor.ewma.get_all()

        cpu_val  = ewma.get("cpu",        0)
        ram_val  = ewma.get("ram",        0)
        net_rx   = ewma.get("net_rx",     0)
        temp_val = ewma.get("temp",       0)
        load_val = ewma.get("load_avg",   0)
        disk_w   = ewma.get("disk_write", 0)

        # ── CPU ───────────────────────────────────────────────────────────────
        cpu_status = status.get("cpu")
        if cpu_status == "ANOMALY":
            if self.predictor.is_sustained("cpu"):
                dur = self.predictor.state_duration("cpu")
                advice.append(
                    f"🔴 CPU anomaly sustained for {dur} — this is not a transient spike. "
                    f"Run `top` or `htop` immediately to find the offending process."
                )
            else:
                advice.append("🟡 CPU spike detected (brief). Monitor closely — may be transient.")
        elif cpu_status == "WARNING":
            advice.append("🟡 CPU load elevated. Consider deferring heavy tasks or restarting greedy services.")

        # ── RAM ───────────────────────────────────────────────────────────────
        ram_status = status.get("ram")

        # Exhaustion forecast (most actionable RAM signal)
        ram_exh = self.exhaustion_info.get("ram")
        if ram_exh:
            if ram_exh["minutes_to_exhaustion"] < 30:
                advice.append(
                    f"🚨 RAM will hit {ram_exh['critical_pct']:.0f}% in ~{ram_exh['hours_label']} — "
                    f"restart the largest memory consumer NOW before the server swaps or crashes."
                )
            elif ram_exh["minutes_to_exhaustion"] < 120:
                advice.append(
                    f"⏱️ RAM trending toward full in ~{ram_exh['hours_label']}. "
                    f"Identify the cause: run `smem -r | head -10` or `ps aux --sort=-%mem | head`."
                )
            else:
                advice.append(
                    f"📊 RAM capacity forecast: full in ~{ram_exh['hours_label']} at current rate. "
                    f"No immediate action needed, but worth investigating the growth."
                )

        # Leak detection
        ram_leak = self.leak_info.get("ram")
        if ram_leak and ram_leak.get("is_leaking"):
            gpm = ram_leak["growth_per_minute"]
            advice.append(
                f"💧 RAM has been growing for {ram_leak['consecutive_pct']:.0f}% of recent samples "
                f"(+{gpm:.2f}%/min) — classic memory leak pattern. "
                f"Run: `smem -r | head`"
            )
        elif ram_status == "ANOMALY" and not ram_exh:
            if self.predictor.is_sustained("ram"):
                dur = self.predictor.state_duration("ram")
                advice.append(
                    f"🔴 RAM anomaly sustained for {dur}. "
                    f"Check for a runaway process: `ps aux --sort=-%mem | head -5`"
                )
            else:
                advice.append("🟡 Brief RAM spike — may be a burst allocation. Watch for recurrence.")
        elif ram_status == "WARNING":
            advice.append("🟡 RAM usage elevated. Check for processes not releasing memory.")

        # ── Disk ──────────────────────────────────────────────────────────────
        disk_exh = self.exhaustion_info.get("disk_read")
        if disk_exh:
            if disk_exh["minutes_to_exhaustion"] < 60:
                advice.append(
                    f"🚨 Disk filling fast — full in ~{disk_exh['hours_label']}. "
                    f"Run `du -sh /* | sort -rh | head` to find what's consuming space."
                )
            else:
                advice.append(
                    f"⏱️ Disk trending toward full in ~{disk_exh['hours_label']}. "
                    f"Consider log rotation or cleanup."
                )

        disk_leak = self.leak_info.get("disk_write")
        if disk_leak and disk_leak.get("is_leaking"):
            advice.append(
                f"💧 Disk writes growing steadily (+{disk_leak['growth_per_minute']:.2f}/min). "
                f"Possible log flooding — check `iotop` or `journalctl -n 50`."
            )
        elif status.get("disk_write") == "ANOMALY":
            if self.predictor.is_sustained("disk_write"):
                dur = self.predictor.state_duration("disk_write")
                advice.append(
                    f"🔴 Disk write anomaly for {dur}. Check `iotop` for the culprit process."
                )

        # ── Network ───────────────────────────────────────────────────────────
        if status.get("net_rx") == "ANOMALY":
            if self.predictor.is_sustained("net_rx"):
                dur = self.predictor.state_duration("net_rx")
                advice.append(
                    f"🔴 Inbound traffic spike sustained for {dur}. "
                    f"Possible DDoS or bulk transfer — check `iftop` or firewall logs."
                )
            else:
                advice.append("🟡 Brief inbound traffic spike — could be a burst download.")

        if status.get("net_tx") == "ANOMALY":
            advice.append(
                "🔴 Outbound traffic anomaly — verify no unexpected large uploads "
                "or potential data exfiltration (`iftop -n`)."
            )

        # ── Temperature ───────────────────────────────────────────────────────
        temp_leak = self.leak_info.get("temp")
        if temp_val > 85:
            advice.append(
                "🔴 CPU temperature critical (>85°C)! Reduce workload immediately "
                "and check thermal paste and fan RPM."
            )
        elif temp_val > 75:
            if temp_leak and temp_leak.get("is_leaking"):
                dur = self.predictor.state_duration("temp")
                advice.append(
                    f"🟡 CPU temperature rising steadily for {dur} "
                    f"(+{temp_leak['growth_per_minute']:.1f}°C/min). "
                    f"Check fan speeds — thermal event may be developing."
                )
            else:
                advice.append("🟡 CPU running warm (>75°C). Check case airflow and fan speeds.")

        # ── Load average ──────────────────────────────────────────────────────
        if load_val > 8:
            advice.append(
                "🔴 System load critically high. Kill non-essential jobs: "
                "`kill -STOP $(pgrep <process>)` to pause without losing state."
            )
        elif load_val > 4:
            advice.append("🟡 Load average elevated. Queue background jobs or scale out.")

        # ── Cross-metric combinations (the most useful part) ─────────────────
        if net_rx > 100 and cpu_val > 70:
            advice.append(
                "⚡ High inbound traffic + high CPU simultaneously — "
                "your server is compute-bound on network processing. "
                "Consider a reverse proxy or load balancer."
            )

        if disk_w > 50 and ram_val > 85:
            advice.append(
                "⚡ High disk writes + near-full RAM — kernel may be swapping heavily. "
                "Check: `vmstat 1 5` and tune `vm.swappiness`."
            )

        rising = [m for m in ["cpu", "ram", "temp", "net_rx"]
                  if status.get(m) in ("WARNING", "ANOMALY")
                  and self.predictor.is_sustained(m)]
        if len(rising) >= 3:
            advice.append(
                f"⚠️ {len(rising)} metrics ({', '.join(rising).upper()}) are simultaneously "
                f"elevated and sustained — likely a single root cause. "
                f"Check recent deployments or scheduled jobs."
            )

        # ── All clear ─────────────────────────────────────────────────────────
        if not advice:
            all_s = list(status.values())
            if all_s and all(s in ("NORMAL", "LEARNING") for s in all_s):
                advice.append("✅ All systems nominal — no issues detected.")
            else:
                advice.append("🟢 Metrics within acceptable ranges. Continuing to monitor.")

        self.advice_cache = advice

        # Persist significant alerts
        urgent = [a for a in advice if any(t in a for t in ("🔴", "🚨", "💧", "⏱️", "⚡", "⚠️"))]
        if urgent:
            try:
                conn = sqlite3.connect(self.db_path)
                try:
                    c = conn.cursor()
                    for msg in urgent:
                        c.execute('INSERT INTO advice_log (timestamp, advice) VALUES (?,?)',
                                  (time.time(), msg))
                    c.execute('''DELETE FROM advice_log WHERE id NOT IN
                        (SELECT id FROM advice_log ORDER BY timestamp DESC LIMIT 100)''')
                    conn.commit()
                finally:
                    conn.close()
            except Exception:
                pass

    # ── Public getters ────────────────────────────────────────────────────────
    def get_all_status(self) -> dict:
        return self.active_anomalies

    def get_advice(self) -> list:
        return self.advice_cache

    def get_full_insights(self) -> dict:
        history = []
        try:
            conn = sqlite3.connect(self.db_path)
            try:
                c = conn.cursor()
                c.execute('SELECT timestamp, advice FROM advice_log ORDER BY timestamp DESC LIMIT 10')
                history = [{"ts": r[0], "msg": r[1]} for r in c.fetchall()]
            finally:
                conn.close()
        except Exception:
            pass

        return {
            "status":       self.active_anomalies,
            "advice":       self.advice_cache,
            "history":      history,
            "exhaustion":   self.exhaustion_info,   # { ram: {hours_label, ...}, ... }
            "leaks":        {k: v for k, v in self.leak_info.items() if v.get("is_leaking")},
            "durations":    self.predictor.get_all_durations(),
            "ewma":         self.predictor.ewma.get_all(),
            "model_info":   self.predictor.describe(),
        }
