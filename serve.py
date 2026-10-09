"""Run Cash Flow locally with caching disabled, so you always see the newest version.
Usage:  python3 serve.py        (opens http://localhost:8090)
        python3 serve.py 8095   (another port)
Only reachable from this computer (127.0.0.1). Stop with Ctrl+C."""
import http.server, socketserver, os, sys, webbrowser
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache"); self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
try:
    srv = socketserver.TCPServer(("127.0.0.1", PORT), NoCache)
except OSError:
    sys.exit(f"Port {PORT} is busy. Stop the old server first:  lsof -ti:{PORT} | xargs kill   then run again.")
url = f"http://localhost:{PORT}"
print(f"Cash Flow is running at {url}  (no cache). Press Ctrl+C to stop.")
webbrowser.open(url)
try: srv.serve_forever()
except KeyboardInterrupt: print("\nStopped.")
