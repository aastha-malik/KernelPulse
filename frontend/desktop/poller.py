"""Background polling thread — fetches AI anomaly status every 5 seconds.

Priority:
  1. GET /api/anomaly      → Python backend with AI layer (full data)
  2. GET /server/?module=cpu_avg_load → Node backend (derive NORMAL status)
  3. Neither reachable     → None (tray goes gray / OFFLINE)
"""

import threading
import requests
from gi.repository import GLib

BASE_URL     = "http://localhost:8080"
ANOMALY_URL  = f"{BASE_URL}/api/anomaly"
FALLBACK_URL = f"{BASE_URL}/server/?module=cpu_avg_load"
POLL_INTERVAL = 5  # seconds


class Poller(threading.Thread):
    def __init__(self, callback):
        super().__init__(daemon=True, name="kp-poller")
        self._callback   = callback
        self._stop_event = threading.Event()

    def start_polling(self):
        self._fetch()          # immediate first poll
        self.start()

    def run(self):
        while not self._stop_event.wait(POLL_INTERVAL):
            self._fetch()

    def _fetch(self):
        data = self._try_anomaly_api()
        if data is None:
            data = self._try_fallback()
        GLib.idle_add(self._callback, data)

    def _try_anomaly_api(self):
        """Try the Python backend's /api/anomaly endpoint."""
        try:
            resp = requests.get(ANOMALY_URL, timeout=3)
            if resp.status_code == 200:
                raw = resp.json()
                return self._normalise(raw)
        except Exception:
            pass
        return None

    @staticmethod
    def _normalise(raw: dict) -> dict:
        """Convert /api/anomaly response to the flat format tray.on_data expects.

        /api/anomaly returns:
          { "status": {"cpu": "NORMAL", "ram": "WARNING", ...}, "advice": [...], ... }

        tray.on_data expects:
          { "status": "WARNING", "metric": "ram", "score": 0.0, "alerts": [...] }
        """
        metric_status = raw.get("status", {})

        # Derive worst overall status across all metrics
        if isinstance(metric_status, dict):
            values = list(metric_status.values())
            if "ANOMALY" in values:
                overall = "ANOMALY"
                # pick first anomalous metric name for the menu
                metric = next((k for k, v in metric_status.items() if v == "ANOMALY"), "")
            elif "WARNING" in values:
                overall = "WARNING"
                metric = next((k for k, v in metric_status.items() if v == "WARNING"), "")
            elif values:
                overall = "NORMAL"
                metric = ""
            else:
                overall = "LEARNING"
                metric = ""
        else:
            # Already a plain string (shouldn't happen, but handle gracefully)
            overall = str(metric_status).upper() or "NORMAL"
            metric = ""

        alerts = raw.get("advice", raw.get("alerts", []))
        return {
            "status": overall,
            "metric": metric,
            "score":  0.0,
            "alerts": alerts if isinstance(alerts, list) else [],
        }

    def _try_fallback(self):
        """Node backend is up but has no AI layer — report NORMAL."""
        try:
            resp = requests.get(FALLBACK_URL, timeout=3)
            if resp.status_code == 200:
                return {
                    "status": "NORMAL",
                    "metric": "",
                    "score":  0.0,
                    "alerts": [],
                }
        except Exception:
            pass
        return None   # truly offline

    def stop(self):
        self._stop_event.set()
