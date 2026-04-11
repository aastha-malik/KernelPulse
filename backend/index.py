#!/usr/bin/env python
"""
KernelPulse Backend
====================
Author  : pickaboo10
Version : 1.0.0
License : MIT

Python 3 backend for KernelPulse. Original rewrite of the linux-dash
Node.js server. Adds: ThreadedHTTPServer, CORS, AI anomaly detection
layer, /api/info + /api/alerts + /api/anomaly endpoints, and
X-Powered-By: KernelPulse response headers.

Based on linux-dash v2.0.0 by Afaq Tariq (MIT License).
"""

from __future__ import print_function
import os
import sys
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import subprocess
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs
import argparse
import mimetypes


parser = argparse.ArgumentParser(description='Simple Threaded HTTP server to run linux-dash.')
parser.add_argument('--port', metavar='PORT', type=int, nargs='?',
                    default=int(os.environ.get('PORT', 8080)),
                    help='Port to run the server on.')

modulesSubPath = '/linux_json_api.sh'
appRootPath = os.path.dirname(os.path.realpath(__file__))
appStaticPath = os.path.join(os.path.dirname(appRootPath), 'frontend', 'web', 'app')

# ── ML / AI layer ──────────────────────────────────────────────────────────────
_ml_path = os.path.join(os.path.dirname(appRootPath), 'ml')
if _ml_path not in sys.path:
    sys.path.insert(0, _ml_path)

_detector = None
try:
    from ai_module import SystemAnomalyDetector
    _db_path = os.environ.get(
        'METRICS_DB_PATH',
        os.path.join(appRootPath, 'metrics.db')
    )
    _detector = SystemAnomalyDetector(db_path=_db_path)
    print('[KernelPulse] AI anomaly detection ready.')
except Exception as _e:
    print(f'[KernelPulse] ML module unavailable: {_e}')

# ── MIME type helpers ──────────────────────────────────────────────────────────
_MIME_MAP = {
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.html': 'text/html',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.map':  'application/json',
}

def _content_type(filepath: str) -> str:
    """Determine Content-Type from file extension."""
    ext = os.path.splitext(filepath)[1].lower()
    return _MIME_MAP.get(ext, 'application/octet-stream')

def _is_binary(filepath: str) -> bool:
    """Return True for file types that should be read in binary mode."""
    ext = os.path.splitext(filepath)[1].lower()
    return ext in ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf')


# ── HTTP server ────────────────────────────────────────────────────────────────
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass

class MainHandler(BaseHTTPRequestHandler):

    def _send(self, code, content_type, data):
        """Write response with standard KernelPulse headers."""
        if isinstance(data, str):
            data = data.encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('X-Powered-By', 'KernelPulse')
        self.end_headers()
        self.wfile.write(data)

    def _json(self, payload, code=200):
        self._send(code, 'application/json', json.dumps(payload))

    # ── CORS preflight ─────────────────────────────────────────────────────
    def do_OPTIONS(self):
        """Handle CORS preflight requests for POST endpoints."""
        self._send(204, 'text/plain', b'')

    # ── POST handler ───────────────────────────────────────────────────────
    def do_POST(self):
        """Handle POST requests — used for /api/ingest (state mutation)."""
        try:
            parsed = urlparse(self.path)
            path   = parsed.path

            if path == '/api/ingest':
                # Read JSON body
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len) if content_len > 0 else b'{}'
                try:
                    data = json.loads(body)
                except (json.JSONDecodeError, ValueError):
                    data = {}

                metric    = data.get('metric', '')
                raw_value = data.get('value', '')

                # Fallback: also check query params for backward compatibility
                if not metric or raw_value == '':
                    params    = parse_qs(parsed.query)
                    metric    = metric or params.get('metric', [''])[0]
                    raw_value = raw_value if raw_value != '' else params.get('value', [''])[0]

                if _detector and metric and raw_value != '':
                    status = _detector.update(metric, raw_value)
                    self._json({"metric": metric, "status": status})
                else:
                    self._json({"error": "missing metric or value parameter"}, 400)
            else:
                self._json({"error": "POST not supported for this endpoint"}, 405)

        except Exception as e:
            self._json({"error": str(e)}, 500)

    # ── GET handler ────────────────────────────────────────────────────────
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            path   = parsed.path

            # ── AI / ML endpoints ──────────────────────────────────────────────
            if path == '/api/info':
                self._json({
                    "app":          "KernelPulse",
                    "version":      "1.0.0",
                    "ml_available": _detector is not None,
                })

            elif path == '/api/anomaly':
                if _detector:
                    self._json(_detector.get_full_insights())
                else:
                    self._json({"error": "ML module not available"}, 503)

            elif path == '/api/alerts':
                if _detector:
                    self._json({
                        "advice": _detector.get_advice(),
                        "status": _detector.get_all_status(),
                    })
                else:
                    self._json({"error": "ML module not available"}, 503)

            elif path == '/api/ingest':
                # Backward-compatible GET support — prefer POST for new code
                params     = parse_qs(parsed.query)
                metric     = params.get('metric', [''])[0]
                raw_value  = params.get('value',  [''])[0]
                if _detector and metric and raw_value:
                    status = _detector.update(metric, raw_value)
                    self._json({"metric": metric, "status": status})
                else:
                    self._json({"error": "missing metric or value parameter"}, 400)

            # ── Linux metric shell API ─────────────────────────────────────────
            elif self.path.startswith("/server/"):
                parts  = self.path.split('=')
                module = parts[1] if len(parts) > 1 else ''
                output = subprocess.Popen(
                    appRootPath + modulesSubPath + " " + module,
                    shell=True,
                    stdout=subprocess.PIPE)
                data = output.communicate()[0]
                self._send(200, 'application/json', data)

            # ── Static files ───────────────────────────────────────────────────
            else:
                if self.path == '/':
                    self.path = '/index.html'

                filepath = os.path.join(appStaticPath, self.path.lstrip('/'))

                content_type = _content_type(filepath)

                if _is_binary(filepath):
                    with open(filepath, 'rb') as f:
                        data = f.read()
                    self._send(200, content_type, data)
                else:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = f.read()
                    self._send(200, content_type, data)

        except IOError:
            self.send_error(404, 'File Not Found: %s' % self.path)

    def log_message(self, fmt, *args):
        # Suppress per-request console noise; keep errors visible
        pass


if __name__ == '__main__':
    args = parser.parse_args()
    server = ThreadedHTTPServer(('0.0.0.0', args.port), MainHandler)
    print(f'Starting KernelPulse on http://0.0.0.0:{args.port} — press Ctrl-C to stop')
    server.serve_forever()
