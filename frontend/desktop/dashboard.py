"""GTK window that embeds the KernelPulse web dashboard via WebKitGTK."""

import gi
gi.require_version('Gtk', '3.0')

gi.require_version('WebKit2', '4.1')

from gi.repository import Gtk, WebKit2

DASHBOARD_URL = "http://localhost:8080"


class DashboardWindow(Gtk.Window):
    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        self.set_default_size(1280, 820)
        self.connect("delete-event", self._on_close)

        # Header bar
        header = Gtk.HeaderBar()
        header.set_show_close_button(True)
        header.props.title = "KernelPulse"
        header.props.subtitle = "System Monitor"

        refresh_btn = Gtk.Button.new_from_icon_name(
            "view-refresh-symbolic", Gtk.IconSize.BUTTON
        )
        refresh_btn.set_tooltip_text("Reload dashboard")
        refresh_btn.connect("clicked", self._on_refresh)
        header.pack_end(refresh_btn)

        self.set_titlebar(header)

        # WebKit view
        settings = WebKit2.Settings()
        settings.set_enable_javascript(True)
        settings.set_enable_developer_extras(False)

        self._webview = WebKit2.WebView()
        self._webview.set_settings(settings)
        self._webview.load_uri(DASHBOARD_URL)

        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scroll.add(self._webview)

        self.add(scroll)

    def _on_close(self, *_):
        self.hide()
        return True  # prevent destroy — keep tray alive

    def _on_refresh(self, *_):
        self._webview.reload()

    def show_or_raise(self):
        self.show_all()
        self.present()
