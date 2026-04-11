# KernelPulse Desktop

Native Ubuntu/GNOME desktop application for KernelPulse — a colored tray icon that monitors AI anomaly status in real time.

## What it does

| Part | Description |
|------|-------------|
| **Tray icon** | Colored circle in GNOME top bar — Green / Yellow / Red (pulsing) / Gray |
| **Tray menu** | Shows current status, metric, anomaly score, and reason |
| **Dashboard window** | Full GTK window embedding `http://localhost:8080` via WebKitGTK |
| **Notifications** | Ubuntu toast notifications on WARNING / ANOMALY status changes |

## Setup

### 1. Install dependencies

```bash
cd desktop/
chmod +x install.sh
./install.sh
```

This installs:
- `python3-gi`, `python3-gi-cairo` — GTK/GObject Python bindings
- `gir1.2-appindicator3-0.1` — GNOME tray API
- `gir1.2-webkit2-4.0` — embedded browser
- `gir1.2-notify-0.7` — desktop notifications
- `python3-cairo` — Cairo icon drawing
- `requests` — HTTP polling

### 2. Run

```bash
chmod +x run.sh
./run.sh
```

`run.sh` will start the KernelPulse backend automatically if it isn't already running, then launch the desktop app. Only the tray icon appears — no terminal window is needed after launch.

### 3. Open the dashboard

Click the tray icon → **Open Dashboard**

Or click the tray icon to see the current AI status inline.

## Add to app launcher (optional)

Create `~/.local/share/applications/kernelpulse.desktop`:

```ini
[Desktop Entry]
Name=KernelPulse
Comment=System anomaly monitor
Exec=/path/to/KernelPulse-main/desktop/run.sh
Icon=utilities-system-monitor
Terminal=false
Type=Application
Categories=System;Monitor;
StartupNotify=false
```

Then run `update-desktop-database ~/.local/share/applications/`.

## Tray icon colors

| Color | Meaning |
|-------|---------|
| Green | Normal / Learning |
| Yellow | Warning — elevated anomaly score |
| Red (pulsing) | Anomaly detected |
| Gray | Backend offline |
