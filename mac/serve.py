"""Serve Label Studio and its native M50 bridge on the Mac's loopback interface."""
import argparse
import functools
import json
import os
import re
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parent.parent
START = bytes.fromhex('00 ' * 12 + '10 ff f1 02 1d 76 30 00 0e 00')
END = bytes.fromhex('1d 0c 10 ff f1 45')
PRINT_LOCK = threading.Lock()
RECENT_PRINTS = {}


def validate_job(job):
    rows = int.from_bytes(job[22:24], 'little')
    return (
        80 <= rows <= 800 and len(job) == 30 + 14 * rows
        and job.startswith(START) and job.endswith(END)
        and any(job[24:-len(END)])
    )


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}

    def __init__(self, *args, bridge, **kwargs):
        self.bridge = bridge
        super().__init__(*args, directory=ROOT / 'dist', **kwargs)

    def permitted(self):
        port = self.server.server_port
        origin = f'http://127.0.0.1:{port}'
        return (
            self.headers.get('Host') == f'127.0.0.1:{port}'
            and self.headers.get('Origin') in (None, origin)
            and self.headers.get('Sec-Fetch-Site') in (None, 'same-origin', 'none')
        )

    def reply(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def get_local(self):
        if self.path == '/api/bridge':
            self.reply({'available': True})
        elif self.path == '/api/status':
            self.run_bridge('status')
        else:
            super().do_GET()

    def do_GET(self):
        if not self.permitted():
            return self.reply({'error': '僅允許本機工作室存取。'}, 403)
        self.get_local()

    def do_POST(self):
        if not self.permitted() or self.headers.get('Origin') != f'http://127.0.0.1:{self.server.server_port}':
            return self.reply({'error': '僅允許本機工作室送出列印。'}, 403)
        if self.path != '/api/print' or self.headers.get('Content-Type') != 'application/octet-stream':
            return self.reply({'error': '不支援的要求。'}, 404)
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            length = 0
        if not 1150 <= length <= 11230:
            return self.reply({'error': '列印資料大小無效。'}, 400)
        self.connection.settimeout(6)
        try:
            job = self.rfile.read(length)
        except (TimeoutError, OSError):
            return self.reply({'error': '未收到完整列印資料。'}, 400)
        if not validate_job(job):
            return self.reply({'error': '列印資料格式無效。'}, 400)
        print_id = self.headers.get('X-Print-Id', '')
        if not re.fullmatch(r'[a-f0-9-]{36}', print_id):
            return self.reply({'error': '缺少有效的列印工作編號。'}, 400)
        with tempfile.NamedTemporaryFile() as temporary:
            temporary.write(job)
            temporary.flush()
            self.run_bridge('print', temporary.name, print_id=print_id)

    def run_bridge(self, *parameters, print_id=None):
        acquired = PRINT_LOCK.acquire(timeout=45) if print_id else PRINT_LOCK.acquire(blocking=False)
        if not acquired:
            return self.reply({'error': 'M50 正在處理上一個操作。'}, 409)
        try:
            now = time.monotonic()
            for key, (timestamp, _) in list(RECENT_PRINTS.items()):
                if now - timestamp > 120:
                    del RECENT_PRINTS[key]
            if print_id in RECENT_PRINTS:
                response = RECENT_PRINTS[print_id][1]
            else:
                response = self.run_tool(parameters)
                if print_id:
                    RECENT_PRINTS[print_id] = (now, response)
        finally:
            PRINT_LOCK.release()
        self.reply(response, 503 if 'error' in response else 200)

    def run_tool(self, parameters):
        try:
            process = subprocess.run(
                [self.bridge, *parameters], text=True, capture_output=True, timeout=43,
            )
            return json.loads(process.stdout)
        except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
            return {'error': 'Mac 藍牙工具未回報結果。請先確認標籤機是否已出紙。'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bridge', required=True)
    parser.add_argument('--port', type=int, default=8785)
    options = parser.parse_args()
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', options.port), functools.partial(Handler, bridge=options.bridge))
    print(f'Label Studio: http://127.0.0.1:{server.server_port}/', flush=True)
    server.serve_forever()
