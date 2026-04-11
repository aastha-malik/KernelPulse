#!/usr/bin/env bash
# KernelPulse Desktop — start backend (if needed) then launch the desktop app
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$REPO_ROOT/backend/index.py"
PORT=8080

# ── 1. Start backend if not already listening ──────────────────────────────
if ! curl -s --max-time 1 "http://localhost:$PORT/api/anomaly" > /dev/null 2>&1; then
    echo "==> Starting KernelPulse backend on port $PORT..."
    nohup python3 "$BACKEND" --port $PORT > /tmp/kernelpulse_backend.log 2>&1 &
    echo "    Backend PID: $!"
    sleep 2
else
    echo "==> Backend already running on port $PORT"
fi

# ── 2. Launch desktop app ──────────────────────────────────────────────────
echo "==> Launching KernelPulse Desktop..."
cd "$(dirname "$0")"
exec python3 app.py
