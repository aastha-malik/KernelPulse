# Changelog

All notable changes to KernelPulse are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [1.0.0] — 2024 — KernelPulse Initial Release

### Added
- **Python 3 backend** (`backend/index.py`): complete rewrite using
  `ThreadingMixIn` + `HTTPServer` for concurrent request handling
- **AI anomaly detection** (`backend/ai_module.py`): Z-score detection
  on rolling 60-point time-series window with SQLite persistence
- **Isolation Forest** support (optional, via scikit-learn) as a
  multivariate anomaly second-pass
- **Learning phase**: system learns baseline over first 20 data points
  before anomaly detection activates
- **Three new API endpoints**: `/api/info`, `/api/alerts`, `/api/anomaly`
- **AI alert frontend** (`frontend/src/js/ai_alerts.js`): `aiAlertService`,
  `kp-ai-status-bar` directive, `kp-anomaly-badge` directive,
  `$httpProvider` interceptor
- **Toast notification system**: auto-dismissing WARNING toasts (8s),
  manual-dismiss ANOMALY toasts with pulsing red animation
- **Alert history panel**: last 20 alerts visible in dropdown
- **Glassmorphism dark theme**: complete CSS redesign with custom
  properties (`--kp-primary`, `--kp-accent`, `--kp-surface`)
- **Circular animated SVG gauges** for CPU, RAM, and Disk
- **HTML5 Canvas sparkline** for CPU load with Bezier curve smoothing
- **X-Powered-By: KernelPulse/1.0** response header on all API responses
- **CORS headers** on all responses for cross-origin frontend development
- **`/api/info` endpoint** returning name, version, author, ai_enabled status
- **Two-speed polling**: fast metrics (CPU/RAM) every 1.5s, slow
  metrics (Disk/System Info) every 10s
- **`$destroy` cleanup**: all `$interval` timers properly cancelled to
  prevent memory leaks
- **Smart disk parser**: finds root partition `/` specifically instead
  of taking the first partition entry

### Changed
- Default backend switched from **Node.js** (`index.js`) to **Python 3**
  (`index.py`)
- Default port changed from **80** (required sudo) to **8080** (no sudo)
- Shell script JSON output standardized to **lowercase snake_case keys**
  (`os_distribution`, `hostname`, `cpu_load`) for clean JS data binding
- Legacy Bootstrap progress bars replaced with **circular animated gauges**
- Single-interval polling replaced with **two-speed strategy**
- AngularJS module renamed from `linuxDash` to `kernelPulse`
- Bundle renamed from `linuxDash.min.js` to `kernelPulse.min.js`
- Project restructured into `backend/`, `frontend/`, `ml/` directories

### Fixed
- Memory leak: `$interval` handles now cancelled on Angular `$destroy` event
- Disk parser now correctly targets root partition `/` instead of first entry
- WebSocket responses now use `JSON.stringify()` — fixes all panels stuck loading
- `cron_history` and `scheduled_crons`: replaced gawk-only `gensub()` with portable `gsub()`
- Added missing shell modules: `disk_space`, `issue`
- Fixed `bandwidth` module data format mismatch in dashboard

### Inherited from linux-dash v2.0.0 (unchanged core logic)
- `linux_json_api.sh` — shell script data collection engine (25+ system functions)
- AngularJS application structure, routing, and `server.get()` service
- `gulpfile.js` — build pipeline
- `index.js` — Node.js backend (retained as optional alternative)
- `index.php` — PHP backend (retained as optional alternative)
