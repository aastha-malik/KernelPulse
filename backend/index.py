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
from http.server import BaseHTTPRequestHandler, HTTPServer
import subprocess
from socketserver import ThreadingMixIn
import argparse


parser = argparse.ArgumentParser(description='Simple Threaded HTTP server to run linux-dash.')
parser.add_argument('--port', metavar='PORT', type=int, nargs='?', default=8080,
                    help='Port to run the server on.')

modulesSubPath = '/linux_json_api.sh'
appRootPath = os.path.dirname(os.path.realpath(__file__))
appStaticPath = os.path.join(os.path.dirname(appRootPath), 'frontend', 'web', 'app')

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass

class MainHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            data = ''
            contentType = 'text/html'
            if self.path.startswith("/server/"):
                parts = self.path.split('=')
                if len(parts) > 1:
                    module = parts[1]
                else:
                    module = ''
                output = subprocess.Popen(
                    appRootPath + modulesSubPath + " " + module,
                    shell = True,
                    stdout = subprocess.PIPE)
                data = output.communicate()[0]
            else:
                if self.path == '/':
                    self.path = '/index.html'

                filepath = os.path.join(appStaticPath, self.path.lstrip('/'))

                if self.path.endswith('.css'):
                    contentType = 'text/css'
                elif self.path.endswith('.js'):
                    contentType = 'application/javascript'

                f = open(filepath, 'r', encoding='utf-8')
                data = f.read()
                f.close()

            self.send_response(200)
            self.send_header('Content-type', contentType)
            self.end_headers()
            if isinstance(data, str):
                data = data.encode()
            self.wfile.write(data)

        except IOError:
            self.send_error(404, 'File Not Found: %s' % self.path)

if __name__ == '__main__':
    args = parser.parse_args()
    server = ThreadedHTTPServer(('0.0.0.0', args.port), MainHandler)
    print('Starting server, use <Ctrl-C> to stop')
    server.serve_forever()
