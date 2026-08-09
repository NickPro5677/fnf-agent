#!/usr/bin/env python3
# ============================================================
# fnf-agent/tests/test_engine.py
# Tests unitarios del motor (sin socket): sustains, hit windows,
# scrollSpeed, scorings y resultado final.
# Run: python3 tests/test_engine.py  (o bash check.sh)
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


def new_engine(song, diff=0):
    eng = fe.Engine()
    ok = eng.start(song, diff, 1.0)
    eng.start_ms = eng.now_ms  # sin countdown
    return eng, ok


def play_perfect(eng):
    """Pulsa cada nota exactamente en su tiempo y mantiene los sustains."""
    while eng.place == "playing" and eng.game_time < eng.song_len_ms + 5000:
        st = eng.game_time
        for n in eng.notes:
            if n["status"] == "wait" and abs(n["t"] - st) <= 1:
                eng.keys[n["lane"]] = True
            if n["status"] == "held" and st >= n["t"] + n["l"] + 1:
                eng.keys[n["lane"]] = False
        eng.update(3)
    return eng


def main():
    print("== test_engine ==")

    # 1) carga de chart: notas, sustains y scrollSpeed
    eng, ok = new_engine("bopeebo", 0)
    check("start bopeebo ok", ok)
    check("88 notas easy", len(eng.notes) == 88, f"got {len(eng.notes)}")
    sust = [n for n in eng.notes if n["l"] > 0]
    check("sustains presentes", len(sust) > 0, f"n={len(sust)}")
    check("scroll easy 1.2", abs(eng.scroll_speed - 1.2) < 1e-9, str(eng.scroll_speed))

    # 2) sin input -> todo miss -> DEFEAT (la partida acaba al caer la health)
    eng, _ = new_engine("test", 0)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms * 1.2:
        eng.update(30)
    check("sin input -> DEFEAT", eng.last_result.startswith("DEFEAT"), eng.last_result)
    check("health agotada", eng.health <= 0, f"health={eng.health}")
    check("miss registrado", eng.miss > 0, f"miss={eng.miss}")

    # 3) golpe perfecto -> WIN, todas a salud (sick+good)
    eng, _ = new_engine("test", 0)
    play_perfect(eng)
    check("perfecto test -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("acertadas == total", eng.sick + eng.good == len(eng.notes),
          f"sick={eng.sick} good={eng.good} miss={eng.miss}")
    check("combo máx == total", eng.max_combo == len(eng.notes),
          f"combo={eng.max_combo}")

    # 4) bopeebo con sustains → perfecto
    eng, _ = new_engine("bopeebo", 0)
    play_perfect(eng)
    check("bopeebo perfecto -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bopeebo sin miss", eng.miss == 0, f"miss={eng.miss}")
    check("bopeebo combo max", eng.max_combo == len(eng.notes),
          f"combo={eng.max_combo}")

    # 5) soltar un sustain a mitad -> esa nota acaba en miss
    eng, _ = new_engine("bopeebo", 0)
    broke = False
    while eng.place == "playing" and eng.game_time < eng.song_len_ms:
        st = eng.game_time
        for n in eng.notes:
            if n["status"] == "wait" and abs(n["t"] - st) <= 1 and not broke:
                eng.keys[n["lane"]] = True
                if n["l"] > 0 and not broke:
                    eng.keys[n["lane"]] = False  # soltar a mitad
                    broke = True
            if n["status"] == "held" and st >= n["t"] + n["l"] + 1:
                eng.keys[n["lane"]] = False
        eng.update(3)
    check("sustain roto -> miss", broke and eng.miss > 0,
          f"broke={broke} miss={eng.miss}")

    # 6) lane_distance devuelve un carril visible
    eng, _ = new_engine("test", 0)
    eng.game_time = max(0, eng.notes[0]["t"] - 200)
    ld = eng.lane_distance()
    check("lane_distance ve nota", any(v >= 0 for v in ld.values()), str(ld))

    # 7) diff clamp: -9 y 99 a 0..2
    e1, _ = new_engine("test", -5)
    e2, _ = new_engine("test", 99)
    check("clamp -5->0", e1.diff == 0, str(e1.diff))
    check("clamp 99->2", e2.diff == 2, str(e2.diff))

    print(f"\nPASS {PASS}  FAIL {FAIL}")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()