#!/usr/bin/env python3
# ============================================================
# web/server.py — visor + control del motor y agentes (FNF-Agent 3.0)
# Binding: FNF_WEB_HOST (default 127.0.0.1). Puerto: FNF_WEB_PORT (8787).
# ============================================================
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(ROOT)
ENV_DIR = os.path.join(PROJ, "env")
BOT_DIR = os.path.join(PROJ, "bot")
LOG_DIR = os.path.join(PROJ, "logs")
RUN_DIR = os.environ.get("FNF_RUN_DIR", os.path.join(ENV_DIR, "run"))
SOCK = os.environ.get("FNF_SOCK", os.path.join(RUN_DIR, "engine.sock"))
RENDER_DIR = os.environ.get("FNF_RENDER_DIR", os.path.join(ENV_DIR, "render"))
FRAME_FILE = os.path.join(RENDER_DIR, "latest.png")
INDEX = os.path.join(ROOT, "index.html")
PORT = int(os.environ.get("FNF_WEB_PORT", "8787"))
HOST = os.environ.get("FNF_WEB_HOST", "127.0.0.1")
TOKEN = os.environ.get("FNF_WEB_TOKEN", "") or ""

ENGINE_PID = os.path.join(LOG_DIR, "engine.pid")
AGENT_PID = os.path.join(LOG_DIR, "agent.pid")
WEB_PID = os.path.join(LOG_DIR, "web.pid")

if ENV_DIR not in sys.path:
    sys.path.insert(0, ENV_DIR)
try:
    import fnf_engine as fe
except ImportError:
    fe = None


def _pid_alive(pid_file):
    try:
        with open(pid_file) as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)
        return pid
    except Exception:
        return None


def _read_json_body(handler, limit=4096):
    raw = handler.rfile.read(int(handler.headers.get("Content-Length", 0) or 0))
    if not raw:
        return {}
    if len(raw) > limit:
        raise ValueError("body too large")
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return {}


def engine_call(payload, timeout=1.5):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect(SOCK)
        s.sendall((json.dumps(payload) + "\n").encode())
        buf = b""
        while b"\n" not in buf:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        line = buf.split(b"\n")[0].decode("utf-8", "replace")
        return json.loads(line or "{}")
    finally:
        try:
            s.close()
        except OSError:
            pass


def engine_status():
    try:
        data = engine_call({"cmd": "status"})
        data["engine"] = "online"
        return data
    except Exception as e:
        return {"engine": "offline", "error": str(e), "place": "menu"}


def engine_alive():
    try:
        engine_call({"cmd": "status"}, timeout=0.6)
        return True
    except Exception:
        return False


def services_status():
    return {
        "engine": engine_alive(),
        "engine_pid": _pid_alive(ENGINE_PID),
        "agent": bool(_pid_alive(AGENT_PID)),
        "agent_pid": _pid_alive(AGENT_PID),
        "web_pid": _pid_alive(WEB_PID) or os.getpid(),
        "sock": os.path.exists(SOCK),
        "frame": os.path.exists(FRAME_FILE) and os.path.getsize(FRAME_FILE) > 64,
    }


def run_script(script, env_extra=None, timeout=25):
    env = os.environ.copy()
    if env_extra:
        env.update({k: str(v) for k, v in env_extra.items() if v is not None})
    try:
        p = subprocess.run(
            ["bash", script],
            cwd=PROJ,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        out = (p.stdout or "") + (p.stderr or "")
        return {"ok": p.returncode == 0, "code": p.returncode, "out": out.strip()[-1500:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": -1, "out": "timeout"}
    except Exception as e:
        return {"ok": False, "code": -1, "out": str(e)}


def read_frame_bytes():
    last_err = None
    for _ in range(4):
        try:
            with open(FRAME_FILE, "rb") as f:
                data = f.read()
            if len(data) >= 64 and data[:4] == b"\x89PNG":
                return data
            last_err = "frame incompleto"
        except FileNotFoundError as e:
            last_err = str(e)
        except OSError as e:
            last_err = str(e)
        time.sleep(0.03)
    return None if last_err else b""


def charts_payload():
    if fe is not None:
        return {"charts": fe.list_charts()}
    charts = []
    cdir = os.path.join(PROJ, "env", "charts")
    for f in sorted(os.listdir(cdir)):
        if f.endswith("-chart.json"):
            charts.append({"name": f[: -len("-chart.json")]})
    return {"charts": charts}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, ctype, cors_star=True):
        if isinstance(body, str):
            body = body.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            if cors_star:
                self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Fnf-Token")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _json(self, code, obj, cors_star=True):
        return self._send(code, json.dumps(obj, ensure_ascii=False), "application/json", cors_star)

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/":
            try:
                with open(INDEX, "rb") as f:
                    return self._send(200, f.read(), "text/html; charset=utf-8")
            except FileNotFoundError:
                return self._send(404, "index.html no encontrado", "text/plain")

        if path == "/frame":
            data = read_frame_bytes()
            if data:
                return self._send(200, data, "image/png")
            return self._send(404, "frame no disponible", "text/plain")

        if path == "/api/status":
            st = engine_status()
            st["services"] = services_status()
            st["auth"] = "on" if TOKEN else "off"
            st["bind"] = f"{HOST}:{PORT}"
            return self._json(200, st)

        if path == "/api/services":
            return self._json(200, services_status())

        if path == "/api/charts":
            try:
                return self._json(200, charts_payload())
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)})

        if path == "/healthz":
            return self._send(200, "ok", "text/plain")

        return self._send(404, "no encontrado", "text/plain")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        def _authed():
            if not TOKEN:
                return True
            got = self.headers.get("X-Fnf-Token") or self.headers.get("X-FNF-TOKEN") or ""
            return got == TOKEN

        if not _authed():
            return self._json(401, {"ok": False, "error": "token inválido o ausente"}, cors_star=False)

        try:
            body = _read_json_body(self)
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)}, cors_star=False)

        if path == "/api/engine/start":
            return self._json(200, run_script(os.path.join(ENV_DIR, "start_engine.sh")), cors_star=False)

        if path == "/api/engine/stop":
            return self._json(200, run_script(os.path.join(ENV_DIR, "stop_engine.sh")), cors_star=False)

        if path == "/api/agent/start":
            extra = {}
            if body.get("song"):
                extra["FNF_SONG"] = body["song"]
            if body.get("diff") is not None:
                extra["FNF_DIFF"] = body["diff"]
            if body.get("sides"):
                extra["FNF_SIDES"] = body["sides"]
            if body.get("agent"):
                extra["FNF_AGENT"] = body["agent"]
            if body.get("scale") not in (None, "", "auto"):
                extra["FNF_SCALE"] = body["scale"]
            if not services_status()["engine"]:
                eng = run_script(os.path.join(ENV_DIR, "start_engine.sh"))
                if not eng["ok"]:
                    return self._json(500, {"ok": False, "error": "engine no arrancó", "detail": eng}, cors_star=False)
            run_script(os.path.join(BOT_DIR, "stop_agent.sh"))
            return self._json(200, run_script(os.path.join(BOT_DIR, "start_agent.sh"), extra), cors_star=False)

        if path == "/api/agent/stop":
            return self._json(200, run_script(os.path.join(BOT_DIR, "stop_agent.sh")), cors_star=False)

        if path == "/api/game/start":
            song = body.get("song", "test")
            diff = int(body.get("diff", 0))
            scale = float(body.get("scale", 0.35))
            sides = body.get("sides", "player")
            try:
                res = engine_call({
                    "cmd": "start", "song": song, "diff": diff, "scale": scale, "sides": sides,
                })
                return self._json(200, {"ok": True, "result": res}, cors_star=False)
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)}, cors_star=False)

        if path == "/api/input":
            key = body.get("key")
            down = bool(body.get("down"))
            if key not in ("left", "down", "up", "right"):
                return self._json(400, {"ok": False, "error": "key inválida"}, cors_star=False)
            try:
                res = engine_call({"cmd": "key", "key": key, "down": down})
                return self._json(200, {"ok": True, "result": res}, cors_star=False)
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)}, cors_star=False)

        return self._json(404, {"ok": False, "error": "ruta no encontrada"}, cors_star=False)

    def log_message(self, fmt, *args):
        return


def main():
    os.makedirs(RUN_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(RENDER_DIR, exist_ok=True)
    if HOST not in ("127.0.0.1", "localhost", "::1") and not TOKEN:
        print(
            f"[web] ADVERTENCIA: bind {HOST} sin FNF_WEB_TOKEN — "
            "cualquiera en la red puede arrancar/parar procesos.",
            flush=True,
        )
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[web] visor escuchando en http://{HOST}:{PORT}/", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[web] apagado.", flush=True)


if __name__ == "__main__":
    main()
