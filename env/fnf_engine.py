#!/usr/bin/env python3
# ============================================================
# fnf-agent/env/fnf_engine.py
# Motor FNF compatible con charts oficiales (formato v2.0.0).
# Renderiza la highway de 4 carriles con PIL y simula gameplay
# segun teclas inyectadas por UNIX socket (el MCP lo hace).
#
# Estados: menu -> playing -> result
# IPC (unix socket, lineas JSON, respuestas JSON line-by-line):
#   {"cmd":"start","song":"tutorial","diff":2,"scale":1}
#   {"cmd":"key","key":"left","down":true}
#   {"cmd":"status"}  /  {"cmd":"quit"}
# Frame de video: $FNF_RENDER_DIR/latest.png (siempre sobrescribe)
#
# Notas sostenidas (sustain, campo "l" de los charts):
#   - La tecla debe mantenerse pulsada `l` ms después del golpe.
#   - Soltar antes = cancel + reset de combo.
#   - Completar el sustain da puntos extra.
# scrollSpeed del chart afecta a la velocidad visual de la nota.
# ============================================================
import json
import os
import socket
import time

import PIL.Image as Image
import PIL.ImageDraw as ImageDraw

W, H = 640, 800
TOP_Y = 200
HIT_Y = 560
TRAVEL_MS = 1500.0  # tiempo base de viaje (afinado por scrollSpeed)
FPS = 15
TICK_MS = 1000.0 / FPS

LANES = 4
LANE_XS = [200, 280, 360, 440]
LANE_COLOR = [(196, 94, 201), (46, 169, 229), (120, 230, 92), (250, 103, 92)]
LANE_NAMES = ["left", "down", "up", "right"]

HIT_WINDOW_GOOD = 150  # ms: ventana de golpe bueno
HIT_WINDOW_MISS = 300  # ms: la nota muere si pasa de aquí sin pulsar


def arrow_points(x, y, lane, s=20):
    h = 0.866 * s
    if lane == 0:      # izquierda
        return [(x - s, y), (x + s, y - h), (x + s, y + h)]
    if lane == 3:      # derecha
        return [(x + s, y), (x - s, y - h), (x - s, y + h)]
    if lane == 2:      # arriba
        return [(x, y - s), (x - h, y + s), (x + h, y + s)]
    return [(x, y + s), (x - h, y - s), (x + h, y - s)]  # abajo


class Engine:
    def __init__(self):
        self.song = ""
        self.notes = []          # lista de diccionarios (ver start)
        self.scroll_speed = 1.0
        self.song_len_ms = 1
        self.scale = 1.0
        self.diff = 0
        self.start_ms = 0
        self.now_ms = 0
        self.game_time = 0
        self.place = "menu"      # menu | playing | over
        self.combo = 0
        self.max_combo = 0
        self.score = 0
        self.health = 0.5
        self.keys = [False] * LANES
        self.last_result = ""
        self.error = ""
        self.frame_seq = 0
        self.sick = self.good = self.miss = 0

    # ---------------- sesion ----------------
    def start(self, song, diff=2, scale=1.0):
        diff = max(0, min(2, int(diff) if isinstance(diff, (int, float)) else 2))
        path = os.path.join(CHARTS_DIR, f"{song}-chart.json")
        if not os.path.exists(path):
            self.error = f"chart no encontrado: {path}"
            return False
        with open(path) as f:
            chart = json.load(f)
        diff_key = ["easy", "normal", "hard"][diff]
        raw = chart.get("notes", {}).get(diff_key, [])
        self.song = song
        self.diff = diff
        scrolls = chart.get("scrollSpeed", {})
        base_scroll = scrolls.get("base", 1.0) if isinstance(scrolls, dict) else 1.0
        self.scroll_speed = float(scrolls.get(diff_key, base_scroll) if isinstance(scrolls, dict) else 1.0)
        self.scale = max(0.05, float(scale))
        self.notes = []
        for n in sorted(raw, key=lambda n: n.get("t", 0)):
            self.notes.append({
                "t": float(n["t"]),
                "lane": int(n.get("d", 0)) % LANES,
                "l": float(n.get("l", 0)),
                "hold_end": None,   # instante (game_time) del final del sustain
                "status": "wait",   # wait | held | done | miss
            })
        self.song_len_ms = (self.notes[-1]["t"] + (self.notes[-1]["l"] or 0) if self.notes else 0) + 5000
        self.start_ms = self.now_ms + 2000   # cuenta regresiva real de 2 s
        self.game_time = 0
        self.combo = 0
        self.max_combo = 0
        self.score = 0
        self.health = 0.5
        self.keys = [False] * LANES
        self.last_result = ""
        self.error = ""
        self.sick = self.good = self.miss = 0
        self.place = "playing"
        return True

    def travel_ms(self):
        return TRAVEL_MS / max(0.01, self.scroll_speed)

    def song_time(self):
        return self.game_time if self.place == "playing" else -1

    # ---------------- simulacion ----------------
    def _add_key(self):
        self.combo += 1
        self.max_combo = max(self.max_combo, self.combo)
        self.score += 50 + 10 * self.combo
        self.health = min(1.0, self.health + 0.02)

    def _miss(self, penalty=0.06):
        self.combo = 0
        self.health = max(0.0, self.health - penalty)

    def update(self, dt_ms):
        self.now_ms += dt_ms
        if self.place != "playing":
            return
        if self.now_ms >= self.start_ms:
            self.game_time += dt_ms * self.scale
        st = self.game_time

        for note in self.notes:
            st_ = note["status"]

            # notas en sustain: requiere la tecla mantenida
            if st_ == "held":
                if self.keys[note["lane"]]:
                    if self.game_time >= note["hold_end"]:
                        note["status"] = "done"
                        self.score += 100
                    continue
                # soltaste antes: sustain roto -> miss
                note["status"] = "miss"
                self.miss += 1
                self._miss(0.08)
                continue

            if st_ != "wait":
                continue

            t = note["t"]
            # fuera de la ventana de miss -> muere sin golpear
            if st - t > HIT_WINDOW_MISS and st - t > 0:
                note["status"] = "miss"
                self.miss += 1
                self._miss()
                continue

            held = self.keys[note["lane"]]
            if held and HIT_WINDOW_GOOD >= abs(t - st) >= 0:
                note["status"] = "held" if note["l"] > 0 else "done"
                if note["l"] > 0:
                    note["hold_end"] = t + note["l"]
                self._add_key()
                off = abs(t - st)
                if off <= 40:
                    self.sick += 1
                else:
                    self.good += 1
            elif held and st >= t:  # tecla pulsada pero ya pasó su ventana buena
                if abs(t - st) <= HIT_WINDOW_MISS:
                    note["status"] = "miss"
                    self.miss += 1
                    self._miss(0.04)

        if self.health <= 0:
            self.place = "result"
            self.last_result = f"DEFEAT score={self.score} combo={self.max_combo} sick={self.sick} good={self.good} miss={self.miss}"
        elif st > self.song_len_ms:
            self.place = "result"
            self.last_result = f"WIN score={self.score} combo={self.max_combo} sick={self.sick} good={self.good} miss={self.miss}"

    # ---------------- render ----------------
    def render(self):
        self.frame_seq += 1
        img = Image.new("RGB", (W, H), (16, 14, 22))
        dr = ImageDraw.Draw(img)
        st = self.song_time()

        # gradient de fondo
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

        # sustains: barras del sustain ANTES de las teclas
        for note in self.notes:
            if note["status"] not in ("wait", "held"):
                continue
            if note["l"] <= 0:
                continue
            lag0 = note["t"] - st
            lag1 = (note["t"] + note["l"]) - st
            # cabeza: si lo mantienes, en la línea; si aún no, en su flecha
            head_y = HIT_Y if note["status"] == "held" else self.note_y(lag0)
            tail_y = self.note_y(lag1)   # extremo del sustain
            if head_y is None or tail_y is None:
                continue
            x = LANE_XS[note["lane"]]
            c = LANE_COLOR[note["lane"]]
            top = min(head_y, tail_y)
            bot = max(head_y, tail_y)
            if top < TOP_Y:
                top = TOP_Y
            if bot > HIT_Y:
                bot = HIT_Y
            if top >= bot:
                continue
            dr.rectangle([x - 6, top, x + 6, bot], fill=c)

        # notas (flechas)
        for note in self.notes:
            if note["status"] not in ("wait", "held"):
                continue
            lag = note["t"] - st
            if lag > self.travel_ms() * 1.1 or lag < -HIT_WINDOW_MISS * 2.2:
                continue
            y = self.note_y(lag)
            if y is None:
                continue
            x = LANE_XS[note["lane"]]
            c = LANE_COLOR[note["lane"]]
            # flecha rellana de color, contorno blanco
            dr.polygon(arrow_points(x, y, note["lane"], 16), fill=c, outline=(255, 255, 255))

        # receptores
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
        dr.text((20, 60), f"judge  sick={self.sick} good={self.good} miss={self.miss}",
                fill=(180, 180, 190))

        if self.place == "result":
            dr.rectangle([60, 340, W - 60, 460], fill=(20, 18, 28))
            dr.text((90, 380), self.last_result, fill=(255, 220, 90))

        save_frame(img)

    def note_y(self, lag):
        """y del carril para un lag (ms respecto de la nota). None si ausente."""
        t = self.travel_ms()
        frac = (t - lag) / t
        y = TOP_Y + frac * (HIT_Y - TOP_Y)
        if TOP_Y - 8 <= y <= HIT_Y + 8:
            return int(y)
        return None

    def lane_distance(self):
        """distancia en ms de la flecha más cercana por carril (0 = en la línea, -1 sin nota)."""
        st = self.song_time()
        out = {}
        for li, name in enumerate(LANE_NAMES):
            d = None
            for note in self.notes:
                if note["status"] != "wait":
                    continue
                if note["lane"] != li:
                    continue
                lag = note["t"] - st
                if -HIT_WINDOW_MISS * 1.2 <= lag <= self.travel_ms() * 1.1:
                    if d is None or abs(lag) < abs(d):
                        d = lag
            out[name] = -1 if d is None else round(d, 1)
        return out

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
                "notes_left": sum(1 for n in self.notes if n["status"] == "wait"),
                "lanes": self.lane_distance(),
                "result": self.last_result,
                "error": self.error,
                "frame_seq": self.frame_seq,
            }
        if cmd == "quit":
            return {"ok": True}
        return {"ok": False, "error": "unknown_cmd"}


def save_frame(img):
    tmp = os.path.join(RENDER_DIR, "_latest.png.tmp")
    img.save(tmp, "PNG")
    os.replace(tmp, os.path.join(RENDER_DIR, "latest.png"))


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
        while True:
            try:
                conn, _ = srv.accept()
                conn.setblocking(False)
                clients[conn] = b""
            except (BlockingIOError, OSError):
                break

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
    ROOT = os.path.dirname(os.path.abspath(__file__))
    CHARTS_DIR = os.environ.get("FNF_CHARTS_DIR", os.path.join(ROOT, "charts"))
    RENDER_DIR = os.environ.get("FNF_RENDER_DIR", os.path.join(ROOT, "render"))
    RUN_DIR = os.environ.get("FNF_RUN_DIR", os.path.join(ROOT, "run"))
    SOCK_PATH = os.environ.get("FNF_SOCK", os.path.join(RUN_DIR, "engine.sock"))
    HIT_Y = int(os.environ.get("FNF_HIT_Y", 560))
    main()