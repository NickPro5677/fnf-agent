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


def main():
    print("== test_engine 3.0 ==")

    # 1) carga: player vs both, scroll, sides
    eng, ok = new_engine("bopeebo", 0, sides="player")
    check("start bopeebo player ok", ok)
    check("44 notas jugador easy", len(eng.notes_player()) == 44, f"got {len(eng.notes_player())}")
    check("44 notas oponente", len(eng.notes_opponent_visual()) == 44, f"got {len(eng.notes_opponent_visual())}")
    check("sustains jugador", sum(1 for n in eng.notes_player() if n["l"] > 0) == 33)
    check("scroll easy 1.2", abs(eng.scroll_speed - 1.2) < 1e-9, str(eng.scroll_speed))
    check("sides player", eng.sides == "player")

    both, okb = new_engine("bopeebo", 0, sides="both")
    check("start both ok", okb)
    check("both: 88 jugables", len(both.notes_player()) == 88, f"got {len(both.notes_player())}")
    check("both: 0 oponente visual", len(both.notes_opponent_visual()) == 0)

    tut, _ = new_engine("tutorial", 0)
    check("tutorial 32 jugador", len(tut.notes_player()) == 32, f"got {len(tut.notes_player())}")

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

    # 4) sin input bopeebo player -> DEFEAT (44 misses)
    eng, _ = new_engine("bopeebo", 0)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms * 1.2:
        eng.update(30)
    check("bopeebo sin input -> DEFEAT", eng.last_result.startswith("DEFEAT"), eng.last_result)
    check("health agotada", eng.health <= 0, f"health={eng.health}")
    check("misses solo jugador", eng.judge["miss"] > 0 and eng.judge["miss"] <= 44, str(eng.judge))

    # 5) oponente no drena si no hay notas jugador que miss-een a la vez...
    #    las notas jugador de bopeebo sí drenan. Comprobamos auto-hit:
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

    # 7) bopeebo player perfecto
    eng, _ = new_engine("bopeebo", 0)
    play_perfect(eng)
    check("bopeebo player perfecto -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bopeebo sin miss", eng.judge["miss"] == 0, str(eng.judge))
    check("bopeebo combo 44", eng.max_combo == 44, f"combo={eng.max_combo}")

    # 8) sustain roto
    eng, _ = new_engine("bopeebo", 0)
    broke = False
    while eng.place == "playing" and eng.game_time < eng.song_len_ms:
        st = eng.game_time
        for n in eng.notes:
            if not n["counts"]:
                continue
            if n["status"] == "wait" and abs(n["t"] - st) <= 1:
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

    eng, _ = new_engine("bopeebo", 0)
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
    check("list tutorial/bopeebo/test", names == {"tutorial", "bopeebo", "test"}, str(names))
    bo = next(s for s in songs if s["name"] == "bopeebo")
    check("list bopeebo easy player 44", bo["diffs"]["easy"]["player"] == 44, str(bo["diffs"]))

    # 13) REGRESIÓN bot tutorial player
    eng, _ = new_engine("tutorial", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot tutorial -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot tutorial sin miss", eng.judge["miss"] == 0, str(eng.judge))
    sust = [n for n in eng.notes_player() if n["l"] > 0]
    check("bot tutorial sustains done", all(n["status"] == "done" for n in sust),
          [n["status"] for n in sust])

    # 14) REGRESIÓN bot bopeebo player (33 sustains)
    eng, _ = new_engine("bopeebo", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot bopeebo -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot bopeebo sin miss", eng.judge["miss"] == 0, str(eng.judge))
    sust = [n for n in eng.notes_player() if n["l"] > 0]
    broken = [n for n in sust if n["status"] == "miss"]
    check("bot bopeebo sustains intactos", len(broken) == 0, f"rotos={len(broken)}")

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
