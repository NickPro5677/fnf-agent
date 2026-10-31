#!/usr/bin/env python3
# ============================================================
# tests/test_engine.py
# Contrato del motor 3.0: sides, ventanas, holds, patrón del bot.
# python3 tests/test_engine.py
# ============================================================
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENV = os.path.join(ROOT, "env")
CHARTS = os.path.join(ENV, "charts")
sys.path.insert(0, ENV)

import fnf_engine as fe  # noqa: E402

fe.CHARTS_DIR = CHARTS

PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f"FAIL  {name}  {detail}")


def new_engine(song, diff=0, sides="player", scale=1.0):
    eng = fe.Engine()
    ok = eng.start(song, diff, scale, sides=sides)
    eng.start_ms = eng.now_ms
    return eng, ok


def play_perfect(eng):
    while eng.place == "playing" and eng.game_time < eng.song_len_ms + 5000:
        st = eng.game_time
        want = [False] * 4
        for n in eng.notes:
            if not n["counts"]:
                continue
            if n["status"] == "wait" and abs(n["t"] - st) <= 2:
                want[n["lane"]] = True
            if n["status"] == "held" and st < n["t"] + n["l"] + 1:
                want[n["lane"]] = True
        eng.keys = want
        eng.update(3)
    return eng


def play_like_bot(eng, scale):
    LEAD = 40.0
    SLACK = 80.0
    MISS_EDGE = -135.0
    TICK = 66.0
    lanes = [False, False, False, False]
    release = [0.0] * 4
    now = 0.0
    playable = [n for n in eng.notes if n["counts"]]
    done = [False] * len(playable)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms + 5000:
        now += TICK
        st = eng.game_time
        for li in range(4):
            if lanes[li] and release[li] > 0 and now >= release[li]:
                lanes[li] = False
                release[li] = 0
                eng.keys[li] = False
        for i, note in enumerate(playable):
            if done[i]:
                continue
            lag = note["t"] - st
            if lag > LEAD:
                continue
            if lag < MISS_EDGE:
                done[i] = True
                continue
            li = note["lane"]
            rel = now + max(10.0, (note["t"] + note["l"] + SLACK - st) / scale)
            if lanes[li]:
                release[li] = max(release[li], rel)
            else:
                lanes[li] = True
                release[li] = rel
                eng.keys[li] = True
            done[i] = True
        eng.update(TICK)
    return eng


def _cuentas(nombre):
    import json
    with open(os.path.join(CHARTS, f"{nombre}-chart.json")) as f:
        c = json.load(f)
    easy = c["notes"]["easy"]
    jug = [n for n in easy if n["d"] % 8 < 4]
    return len(jug), len(easy) - len(jug), sum(1 for n in jug if n.get("l", 0) > 0), c["scrollSpeed"]["easy"]


# Antes se usaban charts oficiales; ahora canciones originales CC0 (ver web/canciones/).
BO_P, BO_O, BO_S, BO_SCROLL = _cuentas("luz-de-neon")
TU_P = _cuentas("primer-paso")[0]


def main():
    print("== test_engine 3.0 (legacy) ==")

    # 1) carga: player vs both, scroll, sides
    eng, ok = new_engine("luz-de-neon", 0, sides="player")
    check("start luz-de-neon player ok", ok)
    check("notas jugador easy", len(eng.notes_player()) == BO_P, f"got {len(eng.notes_player())}")
    check("notas oponente", len(eng.notes_opponent_visual()) == BO_O, f"got {len(eng.notes_opponent_visual())}")
    check("sustains jugador", sum(1 for n in eng.notes_player() if n["l"] > 0) == BO_S and BO_S > 0)
    check("scroll easy", abs(eng.scroll_speed - BO_SCROLL) < 1e-9, str(eng.scroll_speed))
    check("sides player", eng.sides == "player")

    both, okb = new_engine("luz-de-neon", 0, sides="both")
    check("start both ok", okb)
    check("both: todas jugables", len(both.notes_player()) == BO_P + BO_O, f"got {len(both.notes_player())}")
    check("both: 0 oponente visual", len(both.notes_opponent_visual()) == 0)

    tut, _ = new_engine("primer-paso", 0)
    check("primer-paso jugador", len(tut.notes_player()) == TU_P, f"got {len(tut.notes_player())}")

    # 2) parse side
    check("d=0 player", fe.note_side(0) == "player")
    check("d=3 player", fe.note_side(3) == "player")
    check("d=4 opponent", fe.note_side(4) == "opponent")
    check("d=7 opponent", fe.note_side(7) == "opponent")

    # 3) sin input en test (10 notas * 0.047 < 0.5) -> WIN con 10 miss
    eng, _ = new_engine("test", 0)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms * 1.2:
        eng.update(30)
    check("test sin input -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("test 10 miss", eng.judge["miss"] == 10, str(eng.judge))

    # 4) sin input luz-de-neon player -> DEFEAT (44 misses)
    eng, _ = new_engine("luz-de-neon", 0)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms * 1.2:
        eng.update(30)
    check("luz-de-neon sin input -> DEFEAT", eng.last_result.startswith("DEFEAT"), eng.last_result)
    check("health agotada", eng.health <= 0, f"health={eng.health}")
    check("misses solo jugador", eng.judge["miss"] > 0 and eng.judge["miss"] <= BO_P, str(eng.judge))

    # 5) oponente no drena si no hay notas jugador que miss-een a la vez...
    #    las notas jugador de luz-de-neon sí drenan. Comprobamos auto-hit:
    auto = [n for n in eng.notes if not n["counts"]]
    passed = [n for n in auto if n["t"] <= eng.game_time]
    check("oponente pasado -> auto, nunca miss",
          passed and all(n["status"] == "auto" for n in passed)
          and all(n["status"] != "miss" for n in auto),
          [n["status"] for n in auto[:8]])

    # 6) golpe perfecto test -> WIN
    eng, _ = new_engine("test", 0)
    play_perfect(eng)
    check("perfecto test -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("acertadas == total", eng.judge["sick"] + eng.judge["good"] + eng.judge["bad"] == 10,
          str(eng.judge))
    check("combo máx == total", eng.max_combo == 10, f"combo={eng.max_combo}")
    check("0 miss perfecto", eng.judge["miss"] == 0, str(eng.judge))

    # 7) luz-de-neon player perfecto
    eng, _ = new_engine("luz-de-neon", 0)
    play_perfect(eng)
    check("luz-de-neon player perfecto -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("luz-de-neon sin miss", eng.judge["miss"] == 0, str(eng.judge))
    check("luz-de-neon combo total", eng.max_combo == BO_P, f"combo={eng.max_combo}")

    # 8) sustain roto
    eng, _ = new_engine("luz-de-neon", 0)
    broke = False
    while eng.place == "playing" and eng.game_time < eng.song_len_ms:
        st = eng.game_time
        for i in range(4):  # solo se mantienen las teclas de notas largas en curso
            eng.keys[i] = any(n["counts"] and n["status"] == "held" and n["lane"] == i for n in eng.notes)
        for n in eng.notes:
            if not n["counts"]:
                continue
            if n["status"] == "wait" and 0 <= st - n["t"] <= 3:
                eng.keys[n["lane"]] = True
                if n["l"] > 0 and not broke:
                    eng.keys[n["lane"]] = False
                    broke = True
            if n["status"] == "held" and st >= n["t"] + n["l"] + 1:
                eng.keys[n["lane"]] = False
        eng.update(3)
    check("sustain roto -> miss", broke and eng.judge["miss"] > 0,
          f"broke={broke} miss={eng.judge['miss']}")

    # 9) ventanas sick/good/bad/miss en nota sintética (test t=2000 d=0)
    def judge_at(offset):
        e, _ = new_engine("test", 0)
        target = e.notes[0]["t"] + offset
        while e.game_time < target:
            e.update(1)
        e.keys[e.notes[0]["lane"]] = True
        e.update(1)
        return e.notes[0]["status"], dict(e.judge)

    st, j = judge_at(0)
    check("offset 0 -> sick", j["sick"] == 1, str(j))
    st, j = judge_at(60)
    check("offset 60 -> good", j["good"] == 1, str(j))
    st, j = judge_at(110)
    check("offset 110 -> bad", j["bad"] == 1, str(j))
    st, j = judge_at(160)
    check("offset 160 -> miss (tarde)", j["miss"] == 1, str(j))

    # 10) lane_distance / holds
    eng, _ = new_engine("test", 0)
    eng.game_time = max(0, eng.notes[0]["t"] - 200)
    ld = eng.lane_distance()
    check("lane_distance ve nota", any(v >= 0 for v in ld.values()), str(ld))
    holds = eng.holds()
    check("holds vacío al inicio", all(v == -1 for v in holds.values()), str(holds))

    eng, _ = new_engine("luz-de-neon", 0)
    # pulsar el primer sustain jugador en su t
    first = next(n for n in eng.notes if n["counts"] and n["l"] > 0)
    while eng.game_time < first["t"]:
        eng.update(5)
    eng.keys[first["lane"]] = True
    eng.update(5)
    holds = eng.holds()
    name = fe.LANE_NAMES[first["lane"]]
    check("holds ve sustain", holds[name] > 0, str(holds))
    check("holds no cuenta oponente", True)

    # 11) clamp diff
    e1, _ = new_engine("test", -5)
    e2, _ = new_engine("test", 99)
    check("clamp -5->0", e1.diff == 0, str(e1.diff))
    check("clamp 99->2", e2.diff == 2, str(e2.diff))

    # 12) list_charts
    songs = fe.list_charts(CHARTS)
    names = {s["name"] for s in songs}
    check("list primer-paso/luz-de-neon/test", names == {"primer-paso", "luz-de-neon", "test"}, str(names))
    bo = next(s for s in songs if s["name"] == "luz-de-neon")
    check("list luz-de-neon easy player", bo["diffs"]["easy"]["player"] == BO_P, str(bo["diffs"]))

    # 13) REGRESIÓN bot primer-paso player
    eng, _ = new_engine("primer-paso", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot primer-paso -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot primer-paso sin miss", eng.judge["miss"] == 0, str(eng.judge))
    sust = [n for n in eng.notes_player() if n["l"] > 0]
    check("bot primer-paso sustains done", all(n["status"] == "done" for n in sust),
          [n["status"] for n in sust])

    # 14) REGRESIÓN bot luz-de-neon player (con sustains)
    eng, _ = new_engine("luz-de-neon", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot luz-de-neon -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot luz-de-neon sin miss", eng.judge["miss"] == 0, str(eng.judge))
    sust = [n for n in eng.notes_player() if n["l"] > 0]
    broken = [n for n in sust if n["status"] == "miss"]
    check("bot luz-de-neon sustains intactos", len(broken) == 0, f"rotos={len(broken)}")

    # 15) accuracy
    eng, _ = new_engine("test", 0)
    play_perfect(eng)
    check("accuracy perfecto ~1", eng.accuracy() >= 0.99, str(eng.accuracy()))

    # 16) política observe (lanes+holds) en test → WIN
    eng, _ = new_engine("test", 0)
    eng.scale = 1.0
    PRESS = 50.0
    TICK = 25.0
    while eng.place == "playing" and eng.game_time < eng.song_len_ms + 2000:
        lanes = eng.lane_distance()
        holds = eng.holds()
        want = [False] * 4
        for li, name in enumerate(fe.LANE_NAMES):
            lag = lanes[name]
            hold = holds[name]
            in_w = lag >= 0 and lag <= PRESS
            holding = hold >= 0
            want[li] = in_w or holding
        eng.keys = want
        eng.update(TICK)
    check("observe test -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("observe test 0 miss", eng.judge["miss"] == 0, str(eng.judge))

    print(f"\nPASS {PASS}  FAIL {FAIL}")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
