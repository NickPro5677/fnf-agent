#!/usr/bin/env python3
# ============================================================
# fnf-agent/env/fnf_engine.py
# Motor FNF (charts oficiales v2.0.0). Highway de 4 carriles (PIL)
# y simulación según teclas inyectadas por UNIX socket.
#
# sides=player (default): d 0-3 jugador, d 4-7 oponente (auto-hit, no puntúa).
# sides=both: todas las notas son jugables (comportamiento 2.x).
#
# Estados: menu -> playing -> result
# IPC (unix socket, JSON por línea):
#   {"cmd":"start","song":"tutorial","diff":0,"scale":1,"sides":"player"}
#   {"cmd":"key","key":"left","down":true}
#   {"cmd":"status"}  /  {"cmd":"list"}  /  {"cmd":"quit"}
# Frame: $FNF_RENDER_DIR/latest.png
# ============================================================
import json
import os
import socket
import time

import PIL.Image as Image
import PIL.ImageDraw as ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
CHARTS_DIR = os.environ.get("FNF_CHARTS_DIR", os.path.join(ROOT, "charts"))
RENDER_DIR = os.environ.get("FNF_RENDER_DIR", os.path.join(ROOT, "render"))
RUN_DIR = os.environ.get("FNF_RUN_DIR", os.path.join(ROOT, "run"))
SOCK_PATH = os.environ.get("FNF_SOCK", os.path.join(RUN_DIR, "engine.sock"))

W, H = 640, 800
TOP_Y = 200
HIT_Y = int(os.environ.get("FNF_HIT_Y", 560))
TRAVEL_MS = 1500.0


def _clamp_fps(raw):
    try:
        v = int(raw)
    except (TypeError, ValueError):
        v = 15
    return max(8, min(30, v))


FPS = _clamp_fps(os.environ.get("FNF_FPS", 15))
TICK_MS = 1000.0 / FPS

LANES = 4
LANE_XS = [200, 280, 360, 440]
LANE_COLOR = [(196, 94, 201), (46, 169, 229), (120, 230, 92), (250, 103, 92)]
LANE_OPP = [(90, 50, 95), (30, 80, 110), (50, 110, 50), (120, 55, 50)]
LANE_NAMES = ["left", "down", "up", "right"]

# Ventanas de juicio (ms de canción). Aprox. FNF, no clon oficial.
HIT_SICK = 45
HIT_GOOD = 90
HIT_BAD = 135
HIT_MISS = 180

SCORE_SICK = 350
SCORE_GOOD = 200
SCORE_BAD = 100
SCORE_SUSTAIN = 50
HEALTH_SICK = 0.023
HEALTH_GOOD = 0.016
HEALTH_BAD = 0.008
HEALTH_MISS = 0.047
HEALTH_SUSTAIN_BREAK = 0.055

DIFF_KEYS = ("easy", "normal", "hard")


def arrow_points(x, y, lane, s=20):
    h = 0.866 * s
    if lane == 0:
        return [(x - s, y), (x + s, y - h), (x + s, y + h)]
    if lane == 3:
        return [(x + s, y), (x - s, y - h), (x - s, y + h)]
    if lane == 2:
        return [(x, y - s), (x - h, y + s), (x + h, y + s)]
    return [(x, y + s), (x - h, y - s), (x + h, y - s)]


def note_side(d):
    return "player" if (int(d) % 8) < 4 else "opponent"


def summarize_chart(chart):
    notes = chart.get("notes") or {}
    diffs = {}
    for key in DIFF_KEYS:
        raw = notes.get(key) or []
        if not isinstance(raw, list):
            continue
        player = sum(1 for n in raw if note_side(n.get("d", 0)) == "player")
        diffs[key] = {
            "total": len(raw),
            "player": player,
            "opponent": len(raw) - player,
        }
    scrolls = chart.get("scrollSpeed", {})
    if isinstance(scrolls, dict):
        scroll = scrolls.get("easy") or scrolls.get("base") or 1.0
    else:
        scroll = 1.0
    return {"diffs": diffs, "scroll": float(scroll)}


def list_charts(charts_dir=None):
    d = charts_dir or CHARTS_DIR
    out = []
    if not os.path.isdir(d):
        return out
    for fname in sorted(os.listdir(d)):
        if not fname.endswith("-chart.json"):
            continue
        name = fname[: -len("-chart.json")]
        try:
            with open(os.path.join(d, fname)) as fh:
                chart = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        info = summarize_chart(chart)
        info["name"] = name
        out.append(info)
    return out


class Engine:
    def __init__(self):
        self.song = ""
        self.notes = []
        self.scroll_speed = 1.0
        self.song_len_ms = 1
        self.scale = 1.0
        self.diff = 0
        self.sides = "player"
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
        self.events_ignored = 0
        self.judge = {"sick": 0, "good": 0, "bad": 0, "miss": 0}

    def start(self, song, diff=2, scale=1.0, sides="player"):
        diff = max(0, min(2, int(diff) if isinstance(diff, (int, float)) else 2))
        sides = "both" if str(sides).lower() == "both" else "player"
        path = os.path.join(CHARTS_DIR, f"{song}-chart.json")
        if not os.path.exists(path):
            self.error = f"chart no encontrado: {path}"
            return False
        with open(path) as f:
            chart = json.load(f)
        diff_key = DIFF_KEYS[diff]
        raw = chart.get("notes", {}).get(diff_key, [])
        self.song = song
        self.diff = diff
        self.sides = sides
        scrolls = chart.get("scrollSpeed", {})
        base_scroll = scrolls.get("base", 1.0) if isinstance(scrolls, dict) else 1.0
        self.scroll_speed = float(
            scrolls.get(diff_key, base_scroll) if isinstance(scrolls, dict) else 1.0
        )
        self.scale = max(0.05, float(scale))
        self.events_ignored = len(chart.get("events") or [])
        self.notes = []
        for n in sorted(raw, key=lambda n: n.get("t", 0)):
            d = int(n.get("d", 0))
            side = note_side(d)
            counts = sides == "both" or side == "player"
            self.notes.append({
                "t": float(n["t"]),
                "lane": d % LANES,
                "l": float(n.get("l", 0)),
                "side": side,
                "counts": counts,
                "hold_end": None,
                "status": "wait",
            })
        last_t = 0.0
        if self.notes:
            last = self.notes[-1]
            last_t = last["t"] + (last["l"] or 0)
        self.song_len_ms = last_t + 5000
        self.start_ms = self.now_ms + 2000
        self.game_time = 0
        self.combo = 0
        self.max_combo = 0
        self.score = 0
        self.health = 0.5
        self.keys = [False] * LANES
        self.last_result = ""
        self.error = ""
        self.judge = {"sick": 0, "good": 0, "bad": 0, "miss": 0}
        self.place = "playing"
        return True

    def travel_ms(self):
        return TRAVEL_MS / max(0.01, self.scroll_speed)

    def song_time(self):
        return self.game_time if self.place == "playing" else -1

    def notes_player(self):
        return [n for n in self.notes if n["counts"]]

    def notes_opponent_visual(self):
        return [n for n in self.notes if not n["counts"]]

    def accuracy(self):
        j = self.judge
        judged = j["sick"] + j["good"] + j["bad"] + j["miss"]
        if judged <= 0:
            return 1.0
        return (j["sick"] + 0.75 * j["good"] + 0.37 * j["bad"]) / judged

    def _hit(self, kind):
        self.combo += 1
        self.max_combo = max(self.max_combo, self.combo)
        if kind == "sick":
            self.score += SCORE_SICK + 10 * self.combo
            self.health = min(1.0, self.health + HEALTH_SICK)
        elif kind == "good":
            self.score += SCORE_GOOD + 10 * self.combo
            self.health = min(1.0, self.health + HEALTH_GOOD)
        else:
            self.score += SCORE_BAD + 5 * self.combo
            self.health = min(1.0, self.health + HEALTH_BAD)
        self.judge[kind] += 1

    def _miss(self, penalty=HEALTH_MISS):
        self.combo = 0
        self.health = max(0.0, self.health - penalty)
        self.judge["miss"] += 1

    def _judge_kind(self, off):
        if off <= HIT_SICK:
            return "sick"
        if off <= HIT_GOOD:
            return "good"
        if off <= HIT_BAD:
            return "bad"
        return None

    def update(self, dt_ms):
        self.now_ms += dt_ms
        if self.place != "playing":
            return
        if self.now_ms >= self.start_ms:
            self.game_time += dt_ms * self.scale
        st = self.game_time

        for note in self.notes:
            st_ = note["status"]

            if not note["counts"]:
                if st_ == "wait" and st >= note["t"]:
                    note["status"] = "auto"
                continue

            if st_ == "held":
                if self.keys[note["lane"]]:
                    if self.game_time >= note["hold_end"]:
                        note["status"] = "done"
                        self.score += SCORE_SUSTAIN
                    continue
                note["status"] = "miss"
                self._miss(HEALTH_SUSTAIN_BREAK)
                continue

            if st_ != "wait":
                continue

            t = note["t"]
            lag = t - st
            if st - t > HIT_MISS:
                note["status"] = "miss"
                self._miss()
                continue

            held = self.keys[note["lane"]]
            if not held:
                continue
            off = abs(lag)
            kind = self._judge_kind(off)
            if kind:
                note["status"] = "held" if note["l"] > 0 else "done"
                if note["l"] > 0:
                    note["hold_end"] = t + note["l"]
                self._hit(kind)
            elif st >= t and off <= HIT_MISS:
                note["status"] = "miss"
                self._miss()

        if self.health <= 0:
            self.place = "result"
            self.last_result = self._format_result("DEFEAT")
        elif st > self.song_len_ms:
            self.place = "result"
            self.last_result = self._format_result("WIN")

    def _format_result(self, kind):
        j = self.judge
        acc = self.accuracy() * 100
        return (
            f"{kind} score={self.score} combo={self.max_combo} "
            f"sick={j['sick']} good={j['good']} bad={j['bad']} miss={j['miss']} "
            f"acc={acc:.1f}%"
        )

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

        dr.rectangle(
            [LANE_XS[0] - 30, TOP_Y - 10, LANE_XS[-1] + 30, HIT_Y + 50],
            outline=(70, 62, 88),
            width=3,
        )

        for note in self.notes:
            if note["status"] not in ("wait", "held"):
                continue
            if note["l"] <= 0:
                continue
            lag0 = note["t"] - st
            lag1 = (note["t"] + note["l"]) - st
            head_y = HIT_Y if note["status"] == "held" else self.note_y(lag0)
            tail_y = self.note_y(lag1)
            if head_y is None or tail_y is None:
                continue
            x = LANE_XS[note["lane"]]
            c = LANE_COLOR[note["lane"]] if note["counts"] else LANE_OPP[note["lane"]]
            top = min(head_y, tail_y)
            bot = max(head_y, tail_y)
            if top < TOP_Y:
                top = TOP_Y
            if bot > HIT_Y:
                bot = HIT_Y
            if top >= bot:
                continue
            w = 6 if note["counts"] else 3
            dr.rectangle([x - w, top, x + w, bot], fill=c)

        for note in self.notes:
            if note["status"] not in ("wait", "held"):
                continue
            lag = note["t"] - st
            if lag > self.travel_ms() * 1.1 or lag < -HIT_MISS * 2.2:
                continue
            y = self.note_y(lag)
            if y is None:
                continue
            x = LANE_XS[note["lane"]]
            if note["counts"]:
                c = LANE_COLOR[note["lane"]]
                outline = (255, 255, 255)
                size = 16
            else:
                c = LANE_OPP[note["lane"]]
                outline = (90, 88, 100)
                size = 13
            dr.polygon(arrow_points(x, y, note["lane"], size), fill=c, outline=outline)

        for li in range(LANES):
            x = LANE_XS[li]
            c = LANE_COLOR[li]
            if self.keys[li]:
                dr.polygon(arrow_points(x, HIT_Y, li, 24), fill=(95, 88, 118), outline=(235, 235, 245))
            else:
                dr.polygon(arrow_points(x, HIT_Y, li, 22), fill=(55, 50, 70), outline=c)

        hw = W - 100
        dr.rectangle([50, H - 64, 50 + hw, H - 44], outline=(140, 140, 150), width=2)
        dr.rectangle([54, H - 60, 54 + int(hw * self.health), H - 48], fill=(70, 210, 90))

        j = self.judge
        dr.text((20, 16), f"COMBO {self.combo}  SCORE {self.score}", fill=(255, 255, 255))
        dr.text((20, 40), f"{self.song}  t={(st if st else 0) / 1000:.2f}s  {self.sides}", fill=(220, 220, 220))
        dr.text(
            (20, 60),
            f"sick={j['sick']} good={j['good']} bad={j['bad']} miss={j['miss']}  acc={self.accuracy()*100:.0f}%",
            fill=(180, 180, 190),
        )

        if self.place == "result":
            dr.rectangle([40, 330, W - 40, 480], fill=(20, 18, 28))
            dr.text((50, 370), self.last_result[:42], fill=(255, 220, 90))
            if len(self.last_result) > 42:
                dr.text((50, 400), self.last_result[42:90], fill=(255, 220, 90))

        save_frame(img)

    def note_y(self, lag):
        t = self.travel_ms()
        frac = (t - lag) / t
        y = TOP_Y + frac * (HIT_Y - TOP_Y)
        if TOP_Y - 8 <= y <= HIT_Y + 8:
            return int(y)
        return None

    def lane_distance(self):
        st = self.song_time()
        out = {}
        for li, name in enumerate(LANE_NAMES):
            d = None
            for note in self.notes:
                if note["status"] != "wait" or not note["counts"]:
                    continue
                if note["lane"] != li:
                    continue
                lag = note["t"] - st
                if -HIT_MISS * 1.2 <= lag <= self.travel_ms() * 1.1:
                    if d is None or abs(lag) < abs(d):
                        d = lag
            out[name] = -1 if d is None else round(d, 1)
        return out

    def holds(self):
        st = self.song_time()
        out = {name: -1 for name in LANE_NAMES}
        if self.place != "playing":
            return out
        for note in self.notes:
            if note["status"] != "held" or not note["counts"]:
                continue
            rem = note["hold_end"] - st
            name = LANE_NAMES[note["lane"]]
            if out[name] < 0 or rem > out[name]:
                out[name] = rem
        return {k: (-1 if v < 0 else round(v, 1)) for k, v in out.items()}

    def handle(self, msg):
        cmd = msg.get("cmd")
        if cmd == "start":
            ok = self.start(
                msg.get("song"),
                msg.get("diff", 2),
                msg.get("scale", 1.0),
                msg.get("sides", "player"),
            )
            return {
                "ok": ok,
                "song": self.song,
                "place": self.place,
                "error": self.error,
                "scale": self.scale,
                "sides": self.sides,
            }
        if cmd == "key":
            k = msg.get("key")
            if k in LANE_NAMES:
                self.keys[LANE_NAMES.index(k)] = bool(msg.get("down"))
            return {"ok": True}
        if cmd == "status":
            return self.status_dict()
        if cmd == "list":
            return {"songs": list_charts()}
        if cmd == "quit":
            return {"ok": True}
        return {"ok": False, "error": "unknown_cmd"}

    def status_dict(self):
        player = self.notes_player()
        return {
            "place": self.place,
            "song": self.song,
            "diff": self.diff,
            "sides": self.sides,
            "song_time_ms": self.song_time(),
            "scale": self.scale,
            "combo": self.combo,
            "max_combo": self.max_combo,
            "score": self.score,
            "health": round(self.health, 3),
            "accuracy": round(self.accuracy(), 4),
            "judge": dict(self.judge),
            "notes_total": len(player),
            "notes_left": sum(1 for n in player if n["status"] == "wait"),
            "notes_opponent": len(self.notes_opponent_visual()),
            "lanes": self.lane_distance(),
            "holds": self.holds(),
            "events_ignored": self.events_ignored,
            "result": self.last_result,
            "error": self.error,
            "frame_seq": self.frame_seq,
        }


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
    HIT_Y = int(os.environ.get("FNF_HIT_Y", HIT_Y))
    main()
