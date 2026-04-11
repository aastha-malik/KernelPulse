# Contributions

KernelPulse is a modernized fork of
[linux-dash](https://github.com/afaqurk/linux-dash) (MIT License, Afaq Tariq).

This file documents what was built, changed, or designed by **pickaboo10**
versus what was inherited from the original project.

---

## Original Work by pickaboo10

### `backend/index.py` — Python 3 Backend (complete rewrite)
- `ThreadedHTTPServer` using `ThreadingMixIn` for concurrent requests
- CORS headers (`Access-Control-Allow-Origin: *`) on all responses
- MIME-type handling for JS, CSS, HTML, JSON, PNG, SVG, ICO
- Directory traversal protection (`os.path.normpath` validation)
- `X-Powered-By: KernelPulse/1.0` header on all responses
- Route handlers for `/api/info`, `/api/alerts`, `/api/anomaly`
- Graceful fallback if `ai_module.py` is not present

### `backend/ai_module.py` — AI Anomaly Detection (new file, 100% original)
- `MetricBuffer`: thread-safe ring buffer (`deque(maxlen=60)`) per metric
- SQLite persistence: metrics stored in `kernelpulse_metrics.db`, survives restarts
- `_mean()`, `_stddev()`, `_zscore()`, `_moving_average()`: pure Python statistics
- `AnomalyDetector.analyze()`: returns `LEARNING / NORMAL / WARNING / ANOMALY`
- Z-score thresholds: WARNING at 2.0σ, ANOMALY at 3.0σ
- Isolation Forest integration (optional, `USE_ISOLATION_FOREST = True`)
- Automatic retraining every 50 calls
- Module-level singleton + `analyze()` public API for clean import

### `frontend/src/js/ai_alerts.js` — Frontend Alert System (new file, 100% original)
- `aiAlertService`: Angular service with `status`, `score`, `toasts`, `history`
- `$interval` polling of `/api/alerts` every 5 seconds
- `ingestModuleResponse()`: processes AI data from any module response
- `$httpProvider` interceptor: zero-touch integration (no changes to `dashboard.js`)
- `kp-ai-status-bar` directive: navbar badge with history dropdown panel
- `kp-anomaly-badge` directive: per-panel inline metric badges
- Toast auto-dismiss (8s for WARNING, manual for ANOMALY)
- `$rootScope.$broadcast('kp:statusChanged')` for cross-directive reactivity

### `frontend/src/css/` — UI/UX Redesign
- Glassmorphism dark theme replacing legacy Bootstrap
- CSS custom properties: `--kp-primary` (#2dd4bf), `--kp-accent`, `--kp-surface`
- Circular SVG gauge components
- Pulsing red animation (`@keyframes kp-pulse`) for ANOMALY state
- Toast slide-in animation (`@keyframes kp-slide-in`)
- Color-coded metric badges (green/yellow/red)

### `frontend/app/js/dashboard.js` — Dashboard Controller
- HTML5 Canvas sparkline with Bezier curve smoothing for CPU
- Two-speed polling strategy (1.5s fast / 10s slow)
- Smart disk parser targeting root partition `/` specifically
- Proper `$destroy` cleanup preventing `$interval` memory leaks
- Circular animated SVG gauges for CPU, RAM, Disk

### `backend/linux_json_api.sh` — Bug Fixes & API Standardization
- Fixed `cron_history` and `scheduled_crons`: replaced gawk-only `gensub()` with portable `gsub()`
- Added missing `disk_space` function (alias to `disk_partitions`)
- Added missing `issue` function for OS identification
- All JSON output keys standardized to lowercase snake_case

### Project Structure
- Restructured from flat layout into `backend/`, `frontend/`, `ml/` directories
- WebSocket JSON responses fixed (`JSON.stringify` instead of string concatenation)
- Upgraded build system from Gulp 3 to Gulp 4 (Node 22 compatibility)
- Added CORS middleware to Node.js backend

---

## Inherited from linux-dash v2.0.0

| File | Original Author | What was kept |
|------|----------------|---------------|
| `backend/linux_json_api.sh` | Afaq Tariq | Shell data collection logic (25+ functions) |
| `frontend/src/js/` (core) | Afaq Tariq | AngularJS app structure, routing, `server.get()` |
| `gulpfile.js` | Afaq Tariq | Build pipeline (upgraded to Gulp 4) |
| `backend/index.js` | Afaq Tariq | Node.js backend (kept as alternative) |
| `backend/index.php` | Afaq Tariq | PHP backend (kept as alternative) |

All inherited code is used under the original MIT License.
Full license text is in `LICENSE`.
