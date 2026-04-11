"""Desktop notification sender using libnotify."""

import gi
gi.require_version('Notify', '0.7')
from gi.repository import Notify


class Notifier:
    def __init__(self):
        self._last_status = None

    def notify(self, status, metric, reason):
        if status == self._last_status:
            return
        self._last_status = status

        if status == 'WARNING':
            n = Notify.Notification.new(
                "KernelPulse — Warning",
                f"{metric or 'System'}: {reason or 'Anomaly score elevated'}",
                "dialog-warning",
            )
            n.set_urgency(Notify.Urgency.NORMAL)
            n.show()

        elif status == 'ANOMALY':
            n = Notify.Notification.new(
                "KernelPulse — ANOMALY DETECTED",
                f"{metric or 'System'}: {reason or 'Critical anomaly detected'}",
                "dialog-error",
            )
            n.set_urgency(Notify.Urgency.CRITICAL)
            n.set_timeout(Notify.EXPIRES_NEVER)
            n.show()
