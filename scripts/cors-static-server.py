# ============================================================
# 本机静态文件服务（带 CORS）：给浏览器页面里的 JS fetch 本地成片 / 封面用（抖音创作者中心灌文件）
# 用法：python3 scripts/cors-static-server.py ~/Downloads 8766 &   → http://127.0.0.1:8766/<文件夹>/<文件>
# 用完 kill；只监听 127.0.0.1
# ============================================================
import http.server, os, sys

root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads")
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8766


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=root, **k)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


print(f"serving {root} on http://127.0.0.1:{port}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
