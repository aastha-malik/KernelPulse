# KernelPulse Architecture

## Overview

KernelPulse extends linux-dash with a Python 3 backend and an AI
intelligence layer that learns server baseline behavior and detects
anomalies in real time. The frontend is an AngularJS SPA with a
glassmorphic dark UI and a non-invasive AI alert overlay.

---

## System Diagram

```
Browser -> index.py (ThreadedHTTPServer)
              |
              +-> linux_json_api.sh  (subprocess, reads /proc /sys)
              |         |
              |         +-> JSON metrics output
              |
              +-> ai_module.py  (Z-score + SQLite + optional Isolation Forest)
              |         |
              |         +-> { ai_status, ai_score, ai_flags, ai_alerts }
              |
              +-> Merged JSON response to browser

Browser AngularJS SPA:
  $httpProvider interceptor -> aiAlertService
                                    +-> kp-ai-status-bar (navbar badge)
                                    +-> kp-anomaly-badge (per-panel)
                                    +-> Toast notifications
```

---

## Directory Structure

```
KernelPulse-main/
├── backend/
│   ├── index.py          # Python 3 backend (primary, ThreadedHTTPServer)
│   ├── index.js          # Node.js backend (alternative)
│   ├── index.go          # Go backend (alternative)
│   ├── index.php         # PHP backend (alternative)
│   ├── linux_json_api.sh # Shell data collection (25+ system functions)
│   ├── ai_module.py      # Z-score anomaly detection (planned/in-dev)
│   ├── bin/linux-dash    # CLI entry point
│   └── config/ping_hosts # Ping targets config
├── frontend/
│   ├── app/              # Compiled/served assets
│   │   ├── index.html    # Main HTML (served by backend)
│   │   ├── kernelPulse.min.js   # Bundled AngularJS app
│   │   ├── kernelPulse.min.css  # Bundled CSS
│   │   ├── js/dashboard.js      # Dashboard controller
│   │   └── views/dashboard.html # System status view
│   └── src/              # Source files (compiled by gulp)
│       ├── js/
│       │   ├── core/     # AngularJS app, routes, server service
│       │   └── plugins/  # Per-metric directives
│       └── css/          # Source stylesheets
├── ml/                   # ML model placeholder
├── docs/                 # Documentation
├── gulpfile.js           # Build pipeline (Gulp 4)
├── package.json
├── ecosystem.config.js   # PM2 config
└── .env.example          # Environment configuration template
```

---

## Key Design Decisions

### Why Python over Node.js as default?
Python's standard library `http.server` + `socketserver.ThreadingMixIn`
gives true multi-threaded request handling with zero extra dependencies.
For a monitoring tool that should work on any Linux box, zero-dependency
installation is a feature.

### Why Z-score for anomaly detection?
Z-score is interpretable (the score IS the standard deviations from
baseline), requires no training data upfront, works on a rolling window,
and has O(1) update complexity. Isolation Forest is offered as an optional
enhancement for multivariate pattern detection.

### Why SQLite for time-series storage?
SQLite is part of Python's standard library. No external database
service needed. The ring buffer in memory handles real-time detection;
SQLite provides persistence across server restarts so the learned
baseline isn't lost.

### Why a $httpProvider interceptor instead of modifying dashboard.js?
The interceptor pattern lets the AI alert system attach to the existing
data flow without touching a single line of the original dashboard.js.
This minimizes merge conflicts and keeps the AI layer genuinely modular.

### Why upgrade Gulp 3 to Gulp 4?
Gulp 3 crashes entirely on Node.js v12+ due to `primordials` error.
Gulp 4 uses updated internals compatible with modern Node versions.

---

## AI Module State Machine

```
         Startup
            |
            v
      [LEARNING]  <-- fewer than 20 data points per metric
            |
            |  20+ samples collected
            v
       [NORMAL]   <-- Z-score < 2.0 on all metrics
            |
            |  any metric Z-score >= 2.0
            v
      [WARNING]   <-- 2.0 <= Z-score < 3.0
            |
            |  any metric Z-score >= 3.0
            v
      [ANOMALY]       Z-score >= 3.0 (or Isolation Forest outlier)
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/server/?module=<name>` | GET | Shell metric data (+ AI result when enabled) |
| `/api/info` | GET | KernelPulse version, author, ai_enabled |
| `/api/alerts` | GET | Last 50 alert objects with timestamps |
| `/api/anomaly` | GET | Latest AI status snapshot |
| `/websocket` | GET | WebSocket support check |

### Shell Module Names
`cpu_utilization`, `cpu_info`, `current_ram`, `memory_info`, `disk_space`,
`disk_partitions`, `bandwidth`, `general_info`, `ip_addresses`,
`io_stats`, `load_avg`, `cpu_temp`, `scheduled_crons`, `cron_history`,
`docker_processes`, `logged_in_users`, `user_accounts`, `ram_intensive_processes`,
`cpu_intensive_processes`, `network_connections`, `arp_cache`, `ping`,
`common_applications`, `pm2_stats`, `redis`, `memcached`, `swap`

### AI Response Fields (appended to /server/ responses when ai_module active)
```json
{
  "ai_status":   "NORMAL | WARNING | ANOMALY | LEARNING | DISABLED",
  "ai_score":    1.73,
  "ai_flags": {
    "cpu_load":     { "zscore": 1.73, "status": "NORMAL", "moving_avg": 22.4 },
    "ram_used_pct": { "zscore": 0.21, "status": "NORMAL", "moving_avg": 58.1 }
  },
  "ai_alerts":   ["WARNING on cpu_load: current=45.2, baseline~=22.4+-13.1, Z=1.73"],
  "ai_baseline": {
    "cpu_load": { "mean": 22.4, "stddev": 13.1 }
  }
}
```

---

## Starting the Server

```bash
# Python (recommended, no sudo needed)
python3 backend/index.py --port 8080

# Node.js (WebSocket support)
node backend/index.js --port 8080

# Go (compile first)
cd backend && go run index.go --listen 0.0.0.0:8080

# PM2 (process manager)
npx pm2 start ecosystem.config.js
```

Then open http://localhost:8080
