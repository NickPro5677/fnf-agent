#!/usr/bin/env python3
# ============================================================
# fnf-agent/env/fnf_engine.py
# Motor FNF compatible con charts oficiales (formato v2.0.0).
# Renderiza la highway de 4 carriles con PIL y simula gameplay
# segun teclas inyectadas por UNIX socket (el MCP lo hace).
#
# Estados: menu -> playing -> result
# IPC (unix socket, lineas JSON, respuestas JSON line-by-line):
#   {"cmd":"start","song":"tutorial","diff":2}
#   {"cmd":"key","key":"left","state":true}
#   {"cmd":"status"}  /  {"cmd":"quit"}
# Frame de video: $FNF_RENDER_DIR/latest.png (siempre sobrescribe)
# ============================================================
import json
import os
import socket
import time
import select

import PIL.Image as Image
import PIL.ImageDraw as ImageDraw

def save_frame(img):
    tmp = os.path.join(RENDER_DIR, "_latest.png.tmp")
    img.save(tmp, "PNG")
    os.replace(tmp, os.path.join(RENDER_DIR, "latest.png"))


ROOT = os.path.dirname(os.path.abspath(__file__))
CHARTS_DIR = os.environ.get("FNF_CHARTS_DIR", os.path.join(ROOT, "charts"))
RENDER_DIR = os.environ.get("FNF_RENDER_DIR", os.path.join(ROOT, "render"))
RUN_DIR = os.environ.get("FNF_RUN_DIR", os.path.join(ROOT, "run"))
SOCK_PATH = os.environ.get("FNF_SOCK", os.path.join(RUN_DIR, "engine.sock"))

FPS = 15
TICK_MS = 1000.0 / FPS
W, H = 640, 800
TOP_Y = 200
HIT_Y = 560
TRAVEL_MS = 1500.0

LANES = 4
LANE_XS = [200, 280, 360, 440]
LANE_COLOR = [(196, 94, 201), (46, 169, 229), (120, 230, 92), (250, 103, 92)]
LANE_NAMES = ["left", "down", "up", "right"]

HIT_WINDOW_GOOD = 150
HIT_WINDOW_MISS = 300


def arrow_points(x, y, lane, s=20):
    h = 0.866 * s
    if lane == 0:      # izquierda
        return [(x - s, y), (x + s, y - h), (x + s, y + h)]
    if lane == 3:      # derecha
        return [(x + s, y), (x - s, y - h), (x - s, y + h)]
    if lane == 2:      # arriba
        return [(x, y - s), (x - h, y + s), (x + h, y + s)]
    return [(x, y + s), (x - h, y - s), (x + h, y - s)]  # abajo


class Note:
    __slots__ = ("t", "d", "lane", "hit")

    def __init__(self, t, d):
        self.t = t
        self.d = d
        self.lane = d % LANES
        self.hit = None  # None=pendiente, True=acertada, False=fallada/perdida


class Engine:
    def __init__(self):
        self.song = ""
        self.notes = []
        self.scroll_speed = 1
        self.song_len_ms = 1
        self.scale = 1.0
        self.diff = 0
        self.start_ms = 0
        self.now_ms = 0
        self.game_time = 0
        self.place = "menu"
        self.combo = 0
        self.max_combo = 0
        self.score = 0
        self.health = 0.5
        self.keys = [False] * LANES
        self.last_result = ""
        self.error = ""
        self.frame_seq = 0

    # ---------------- sesion ----------------
    def start(self, song, diff=2, scale=1.0):
        path = os.path.join(CHARTS_DIR, f"{song}-chart.json")
        if not os.path.exists(path):
            self.error = f"chart no encontrado: {path}"
            return False
        with open(path) as f:
            chart = json.load(f)
        diff_key = ["easy", "normal", "hard"][min(diff, 2)]
        raw = chart.get("notes", {}).get(diff_key, [])
        self.song = song
        self.diff = diff
        self.scroll_speed = chart.get("scrollSpeed", {}).get(diff_key, 1)
        self.scale = max(0.05, float(scale))
        self.notes = sorted((Note(n["t"], n.get("d", 0)) for n in raw), key=lambda n: n.t)
        self.song_len_ms = (self.notes[-1].t if self.notes else 0) + 5000
        self.start_ms = self.now_ms + 2000  # cuenta regresiva real de 2s
        self.game_time = 0
        self.combo = 0
        self.max_combo = 0
        self.score = 0
        self.health = 0.5
        for li in range(LANES):
            self.keys[li] = False
        self.last_result = ""
        self.error = ""
        self.place = "playing"
        return True

    def song_time(self):
        if self.place == "playing":
            return self.game_time
        return -1

    # ---------------- simulacion ----------------
    def update(self, dt_ms):
        self.now_ms += dt_ms
        if self.place != "playing":
            return
        if self.now_ms >= self.start_ms:
            self.game_time += dt_ms * self.scale
        st = self.game_time
        for n in self.notes[:]:
            if n.hit is not None:
                continue
            if n.t - HIT_WINDOW_GOOD <= st:  # nota ya puede procesarse
                if abs(n.t - st) <= HIT_WINDOW_MISS:
                    held = self.keys[n.lane]
                    if n.t >= st:  # todavia puede pegarse en buena ventana
                        if held and abs(n.t - st) <= HIT_WINDOW_GOOD:
                            n.hit = True
                            self.combo += 1
                            self.max_combo = max(self.max_combo, self.combo)
                            self.score += 50 + 10 * self.combo
                            self.health = min(1.0, self.health + 0.02)
                        elif held and abs(n.t - st) <= HIT_WINDOW_MISS:
                            n.hit = False
                            self.combo = 0
                            self.health = max(0.0, self.health - 0.08)
                    else:  # pasó de largo
                        n.hit = False
                        self.combo = 0
                        self.health = max(0.0, self.health - 0.06)
        if self.health <= 0:
            self.place = "result"
            self.last_result = f"DEFEAT score={self.score} combo={self.max_combo}"
        elif st > self.song_len_ms:
            self.place = "result"
            self.last_result = f"WIN score={self.score} combo={self.max_combo}"

    # ---------------- render ----------------
    def render(self):
        self.frame_seq += 1
        img = Image.new("RGB", (W, H), (16, 14, 22))
        dr = ImageDraw.Draw(img)
        st = self.song_time()
        for i in range(10):
            v = 10 + i * 20
            dr.rectangle([0, i * H // 10, W, (i + 1) * H // 10], fill=(v, v - 6, v + 4))

        if self.place == "menu":
            dr.rectangle([0, 320, W, 520], fill=(24, 20, 32))
            dr.text((150, 340), "FNF - AGENT", fill=(255, 220, 90))
            dr.text((140, 400), "esperando 'start'", fill=(210, 210, 210))
            save_frame(img)
            return

        # highway
        dr.rectangle([LANE_XS[0] - 30, TOP_Y - 10, LANE_XS[-1] + 30, HIT_Y + 50], outline=(70, 62, 88), width=3)

        # notas
        for n in self.notes:
            if n.hit is not None:
                continue
            lag = n.t - st
            if lag > TRAVEL_MS * 1.1 or lag < -HIT_WINDOW_MISS * 2:
                continue
            frac = (TRAVEL_MS - lag) / TRAVEL_MS
            y = TOP_Y + frac * (HIT_Y - TOP_Y)
            if TOP_Y - 5 <= y <= HIT_Y + 5:
                x = LANE_XS[n.lane]
                c = LANE_COLOR[n.lane]
                dr.polygon(arrow_points(x, y, n.lane, 16), fill=c, outline=(255, 255, 255))

        # receptores: si está presionado, dibujar contorno claro y centro
        # ligeramente más luminoso (nunca el lane-color de relleno, para que
        # la percepción por columna no confunda el receptor con una flecha).
        for li in range(LANES):
            x = LANE_XS[li]
            c = LANE_COLOR[li]
            if self.keys[li]:
                dr.polygon(arrow_points(x, HIT_Y, li, 24), fill=(95, 88, 118), outline=(235, 235, 245))
            else:
                dr.polygon(arrow_points(x, HIT_Y, li, 22), fill=(55, 50, 70), outline=c)

        # health
        hw = W - 100
        dr.rectangle([50, H - 64, 50 + hw, H - 44], outline=(140, 140, 150), width=2)
        dr.rectangle([54, H - 60, 54 + int(hw * self.health), H - 48], fill=(70, 210, 90))

        # hud
        dr.text((20, 16), f"COMBO {self.combo}  SCORE {self.score}", fill=(255, 255, 255))
        dr.text((20, 40), f"{self.song}  t={(st if st else 0) / 1000:.2f}s", fill=(220, 220, 220))

        if self.place == "result":
            dr.rectangle([60, 340, W - 60, 460], fill=(20, 18, 28))
            dr.text((90, 380), self.last_result, fill=(255, 220, 90))

        save_frame(img)

    # ---------------- ipc ----------------
    def handle(self, msg):
        cmd = msg.get("cmd")
        if cmd == "start":
            ok = self.start(msg.get("song"), msg.get("diff", 2), msg.get("scale", 1.0))
            return {"ok": ok, "song": self.song, "place": self.place, "error": self.error, "scale": self.scale}
        if cmd == "key":
            k = msg.get("key")
            if k in LANE_NAMES:
                self.keys[LANE_NAMES.index(k)] = bool(msg.get("down"))
            return {"ok": True}
        if cmd == "status":
            return {
                "place": self.place,
                "song": self.song,
                "diff": self.diff,
                "song_time_ms": self.song_time(),
                "scale": self.scale,
                "combo": self.combo,
                "max_combo": self.max_combo,
                "score": self.score,
                "health": round(self.health, 3),
                "notes_total": len(self.notes),
                "notes_left": sum(1 for n in self.notes if n.hit is None),
                "result": self.last_result,
                "error": self.error,
                "frame_seq": self.frame_seq,
            }
        if cmd == "quit":
            return {"ok": True}
        return {"ok": False, "error": "unknown_cmd"}


def main():
    for d in (RENDER_DIR, RUN_DIR):
        os.makedirs(d, exist_ok=True)
    try:
        os.unlink(SOCK_PATH)
    except FileNotFoundError:
        pass

    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(SOCK_PATH)
    srv.listen(8)
    srv.setblocking(False)

    eng = Engine()
    clients = {}
    next_tick = 0
    running = True

    while running:
        # aceptar
        while True:
            try:
                conn, _ = srv.accept()
                conn.setblocking(False)
                clients[conn] = b""
            except (BlockingIOError, OSError):
                break

        # leer comandos
        for conn in list(clients):
            try:
                data = conn.recv(65536)
            except (BlockingIOError, OSError):
                continue
            if not data:
                conn.close()
                del clients[conn]
                continue
            pending = clients[conn] + data
            clients[conn] = b""
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                if not line.strip():
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                rep = eng.handle(msg)
                if rep is not None:
                    try:
                        conn.sendall((json.dumps(rep) + "\n").encode())
                    except OSError:
                        pass
                if msg.get("cmd") == "quit":
                    running = False
            clients[conn] = pending

        now_ms = int(time.time() * 1000)
        if now_ms >= next_tick:
            eng.update(now_ms - eng.now_ms)
            eng.render()
            next_tick = now_ms + TICK_MS
        time.sleep(0.005)

    srv.close()
    print("[engine] fin.")


if __name__ == "__main__":
    main()