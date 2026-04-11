# ─────────────────────────────────────────────────────────────────────────────
# KernelPulse — Multi-stage Dockerfile
#
# Stage 1 (frontend-builder): Builds the React 19 / Vite app.
#   Only frontend/web/react-src/ is compiled — legacy Angular source
#   (frontend/src/) is excluded via .dockerignore, so the final image
#   contains only the React SPA.
#
# Stage 2 (runtime): Python 3.11 slim + Linux system tools + ML modules.
#   Serves the built React SPA as static files and exposes:
#     GET  /server/?module=<name>  →  linux_json_api.sh metrics
#     GET  /api/info | /api/alerts | /api/anomaly
#     POST /api/ingest             →  ML anomaly ingestion
#
#   Host system metrics are accessed by mounting /proc and /sys read-only
#   and sharing the host PID namespace (see docker-compose.yml).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Frontend Builder (React only) ───────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy only what Vite needs — Angular source stays out via .dockerignore
COPY vite.config.js ./
COPY frontend/web/react-src/ ./frontend/web/react-src/

# Produces a clean /build/frontend/web/app/ with only React build artifacts
RUN npm run build

# ── Stage 2 : Python Runtime ──────────────────────────────────────────────────
FROM python:3.11-slim

LABEL org.opencontainers.image.title="KernelPulse" \
      org.opencontainers.image.description="AI-powered Linux system monitoring dashboard" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# CLI tools required by linux_json_api.sh:
#   procps     → ps, free, w, top
#   net-tools  → arp, ifconfig, netstat
#   util-linux → lscpu, whereis, lsblk
#   iproute2   → ip, ss
#   sysstat    → iostat (disk I/O stats)
#   dnsutils   → dig (external IP lookup)
#   hostname   → hostname command
#   lsb-release→ lsb_release -ds (OS name)
#   iputils-ping→ ping
#   login      → lastlog
#   cron       → crontab -l
#   lm-sensors → sensors (CPU temp — graceful no-op if absent)
#   bash, gawk, grep, sed, coreutils → script internals
RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        procps \
        net-tools \
        util-linux \
        iproute2 \
        sysstat \
        coreutils \
        gawk \
        grep \
        sed \
        dnsutils \
        hostname \
        lsb-release \
        iputils-ping \
        login \
        cron \
        lm-sensors \
    && rm -rf /var/lib/apt/lists/*

# scikit-learn powers ExhaustionPredictor in ml/ml_model.py.
# ml_model.py falls back to pure-Python OLS if scikit-learn is absent,
# so this is optional but recommended.
RUN pip install --no-cache-dir scikit-learn

# Persistent directory for SQLite (metrics.db + advice_log).
# Mount a named volume here so data survives container restarts.
RUN mkdir -p /data

# Copy backend server and shell metrics script
COPY backend/ ./backend/

# Copy ML / AI modules (ai_module.py + ml_model.py)
COPY ml/ ./ml/

# Copy the pre-built React SPA from Stage 1.
# index.py computes:  appStaticPath = parent(backend/) / frontend/web/app
COPY --from=frontend-builder /build/frontend/web/app/ ./frontend/web/app/

# Shell script must be executable inside the container
RUN chmod +x backend/linux_json_api.sh

# ── Runtime configuration ─────────────────────────────────────────────────────
EXPOSE 8080

# METRICS_DB_PATH: override to point SQLite at the /data volume (see index.py).
# PORT / HOST: listened on by the Python HTTP server.
ENV PORT=8080 \
    HOST=0.0.0.0 \
    METRICS_DB_PATH=/data/metrics.db \
    AI_LEARNING_SAMPLES=20 \
    AI_ZSCORE_WARNING=2.0 \
    AI_ZSCORE_ANOMALY=3.0 \
    AI_WINDOW_SIZE=60

# Healthcheck via the /api/info endpoint (always 200 when server is alive)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python3 -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/info')" \
    || exit 1

CMD ["python3", "backend/index.py", "--port", "8080"]
