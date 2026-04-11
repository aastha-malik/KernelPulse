#!/usr/bin/env bash
# KernelPulse Desktop — install all dependencies
set -e

echo "==> Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    gir1.2-ayatanaappindicator3-0.1 \
    gir1.2-webkit2-4.1 \
    gir1.2-notify-0.7 \
    libcairo2-dev \
    python3-cairo \
    python3-pip

echo "==> Installing Python packages..."
pip3 install --user requests

echo ""
echo "✓ All dependencies installed."
echo "  Run:  ./run.sh"
