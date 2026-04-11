#!/usr/bin/env python3
"""
KernelPulse Desktop — entry point.

Run with:  python3 app.py
Or:        ./run.sh
"""

import signal
import sys
import os

# Ensure sibling modules are importable when launched from any directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Notify', '0.7')

from gi.repository import Gtk, Notify

from tray import TrayIcon
from poller import Poller


def main():
    # Let Ctrl-C in a terminal kill the app cleanly
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    Notify.init("KernelPulse")

    tray   = TrayIcon()
    poller = Poller(callback=tray.on_data)
    poller.start_polling()

    try:
        Gtk.main()
    finally:
        poller.stop()
        tray.cleanup()
        Notify.uninit()


if __name__ == "__main__":
    main()
