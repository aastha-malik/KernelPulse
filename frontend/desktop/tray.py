"""System tray icon using AppIndicator3 + Cairo-drawn colored circle."""

import os
import math
import tempfile
import gi

gi.require_version('Gtk', '3.0')

try:
    gi.require_version('AyatanaAppIndicator3', '0.1')
    from gi.repository import Gtk, GLib, AyatanaAppIndicator3 as AppIndicator3
except ValueError:
    gi.require_version('AppIndicator3', '0.1')
    from gi.repository import Gtk, GLib, AppIndicator3
import cairo

from notifier import Notifier
from dashboard import DashboardWindow

# ── Icon constants ──────────────────────────────────────────────────────────
ICON_DIR   = tempfile.mkdtemp(prefix="kernelpulse_icons_")
ICON_SIZE  = 22

STATUS_COLORS = {
    "NORMAL":       (0.18, 0.80, 0.30, 1.0),
    "LEARNING":     (0.18, 0.80, 0.30, 1.0),
    "WARNING":      (1.00, 0.75, 0.00, 1.0),
    "ANOMALY":      (0.95, 0.15, 0.15, 1.0),
    "ANOMALY_DIM":  (0.45, 0.05, 0.05, 1.0),
    "OFFLINE":      (0.50, 0.50, 0.50, 1.0),
}


def _draw_icon(name: str, rgba, glow: bool = False) -> str:
    """Draw a colored circle to a PNG file and return its base name (no ext)."""
    r, g, b, a = rgba
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, ICON_SIZE, ICON_SIZE)
    ctx = cairo.Context(s)
    cx = cy = ICON_SIZE / 2
    radius = ICON_SIZE / 2 - 2

    # Clear to transparent
    ctx.set_operator(cairo.OPERATOR_CLEAR)
    ctx.paint()
    ctx.set_operator(cairo.OPERATOR_OVER)

    if glow:
        for i in range(4, 0, -1):
            grad = cairo.RadialGradient(cx, cy, radius * 0.4, cx, cy, radius + i * 2.5)
            grad.add_color_stop_rgba(0, r, g, b, 0.35)
            grad.add_color_stop_rgba(1, r, g, b, 0.0)
            ctx.arc(cx, cy, radius + i * 2.5, 0, 2 * math.pi)
            ctx.set_source(grad)
            ctx.fill()

    # Main circle with radial gradient (slight highlight)
    grad = cairo.RadialGradient(
        cx - radius * 0.35, cy - radius * 0.35, 1,
        cx, cy, radius,
    )
    grad.add_color_stop_rgba(0, min(r + 0.35, 1.0), min(g + 0.35, 1.0), min(b + 0.35, 1.0), a)
    grad.add_color_stop_rgba(1, r * 0.55, g * 0.55, b * 0.55, a)
    ctx.arc(cx, cy, radius, 0, 2 * math.pi)
    ctx.set_source(grad)
    ctx.fill()

    path = os.path.join(ICON_DIR, f"{name}.png")
    s.write_to_png(path)
    return name  # AppIndicator3 uses the name, not the full path


def _init_icons():
    _draw_icon("kp-normal",      STATUS_COLORS["NORMAL"])
    _draw_icon("kp-warning",     STATUS_COLORS["WARNING"])
    _draw_icon("kp-anomaly",     STATUS_COLORS["ANOMALY"],     glow=True)
    _draw_icon("kp-anomaly-dim", STATUS_COLORS["ANOMALY_DIM"], glow=False)
    _draw_icon("kp-offline",     STATUS_COLORS["OFFLINE"])


STATUS_ICON = {
    "NORMAL":   "kp-normal",
    "LEARNING": "kp-normal",
    "WARNING":  "kp-warning",
    "ANOMALY":  "kp-anomaly",
    "OFFLINE":  "kp-offline",
}


# ── TrayIcon ─────────────────────────────────────────────────────────────────

class TrayIcon:
    def __init__(self):
        _init_icons()

        self._status   = "OFFLINE"
        self._metric   = ""
        self._score    = 0.0
        self._reason   = ""

        self._pulse_on    = True
        self._pulse_timer = None

        self._notifier  = Notifier()
        self._dashboard = None

        # AppIndicator
        self._indicator = AppIndicator3.Indicator.new_with_path(
            "kernelpulse",
            "kp-offline",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS,
            ICON_DIR,
        )
        self._indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self._indicator.set_menu(self._build_menu())

    # ── Menu ─────────────────────────────────────────────────────────────

    def _build_menu(self):
        menu = Gtk.Menu()

        def _ro(label):
            item = Gtk.MenuItem(label=label)
            item.set_sensitive(False)
            menu.append(item)
            return item

        self._mi_status = _ro("Status: …")
        self._mi_metric = _ro("")
        self._mi_score  = _ro("")
        self._mi_reason = _ro("")

        menu.append(Gtk.SeparatorMenuItem())

        open_item = Gtk.MenuItem(label="Open Dashboard")
        open_item.connect("activate", self._open_dashboard)
        menu.append(open_item)

        quit_item = Gtk.MenuItem(label="Quit")
        quit_item.connect("activate", lambda _: self._quit())
        menu.append(quit_item)

        menu.show_all()
        return menu

    def _refresh_menu(self):
        self._mi_status.set_label(f"Status: {self._status}")

        if self._metric:
            self._mi_metric.set_label(f"Metric:  {self._metric}")
            self._mi_metric.show()
        else:
            self._mi_metric.hide()

        if self._score:
            self._mi_score.set_label(f"Score:   {self._score:.3f}")
            self._mi_score.show()
        else:
            self._mi_score.hide()

        if self._reason:
            txt = self._reason[:70] + ("…" if len(self._reason) > 70 else "")
            self._mi_reason.set_label(txt)
            self._mi_reason.show()
        else:
            self._mi_reason.hide()

    # ── Icon / pulse ─────────────────────────────────────────────────────

    def _set_icon(self, name: str):
        self._indicator.set_icon_full(name, name)

    def _start_pulse(self):
        if self._pulse_timer is None:
            self._pulse_timer = GLib.timeout_add(550, self._pulse_tick)

    def _stop_pulse(self):
        if self._pulse_timer is not None:
            GLib.source_remove(self._pulse_timer)
            self._pulse_timer = None

    def _pulse_tick(self):
        self._pulse_on = not self._pulse_on
        self._set_icon("kp-anomaly" if self._pulse_on else "kp-anomaly-dim")
        return GLib.SOURCE_CONTINUE

    # ── Data callback (safe — runs on GTK main thread via GLib.idle_add) ─

    def on_data(self, data):
        prev = self._status

        if data is None:
            self._status = "OFFLINE"
            self._metric = ""
            self._score  = 0.0
            self._reason = "Backend offline — retrying…"
        else:
            self._status = str(data.get("status", "NORMAL")).upper()
            self._metric = data.get("metric", data.get("module", ""))
            self._score  = float(data.get("score", data.get("ai_score", 0)) or 0)
            alerts = data.get("alerts", data.get("ai_alerts", []))
            if isinstance(alerts, list):
                self._reason = alerts[0] if alerts else ""
            else:
                self._reason = str(alerts)

        # Icon
        if self._status == "ANOMALY":
            self._start_pulse()
        else:
            self._stop_pulse()
            self._set_icon(STATUS_ICON.get(self._status, "kp-offline"))

        # Menu
        self._refresh_menu()

        # Notification on change
        if self._status != prev:
            self._notifier.notify(self._status, self._metric, self._reason)

        return GLib.SOURCE_REMOVE  # one-shot idle callback

    # ── Actions ──────────────────────────────────────────────────────────

    def _open_dashboard(self, *_):
        if self._dashboard is None:
            self._dashboard = DashboardWindow()
        self._dashboard.show_or_raise()

    def _quit(self):
        self._stop_pulse()
        Gtk.main_quit()

    def cleanup(self):
        self._stop_pulse()
        import shutil
        shutil.rmtree(ICON_DIR, ignore_errors=True)
