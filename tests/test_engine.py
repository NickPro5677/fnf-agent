#!/usr/bin/env python3
# ============================================================
# fnf-agent/tests/test_engine.py
# Tests unitarios del motor (sin socket): sustains, hit windows,
# scrollSpeed, scorings y resultado final.
# Incluye un test de REGRESIÓN del patrón real del bot (autoplayer
# de reglas): pulsar por carril con engagement y soltar tras el
# final de la nota. Este test hubiera cazado el bug que rompía
# los sustains (release ~350ms antes del fin).
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


def play_like_bot(eng, scale):
    """Replica el autoplayer de reglas (bot/bot_loop.js) sobre el motor:
    engagement por carril con LEAD=200, soltando después de t+l+SLACK."""
    LEAD = 200.0
    SLACK = 120.0
    MISS_EDGE = -150.0
    TICK = 66.0
    lanes = [False, False, False, False]   # tecla abajo
    release = [0.0] * 4                     # wall-ms cuando soltar
    now = 0.0
    engine_notes = eng.notes
    done = [False] * len(engine_notes)
    while eng.place == "playing" and eng.game_time < eng.song_len_ms + 5000:
        now += TICK
        st = eng.game_time
        # soltar engagements vencidos
        for li in range(4):
            if lanes[li] and release[li] > 0 and now >= release[li]:
                lanes[li] = False
                release[li] = 0
                eng.keys[li] = False
        # programar notas pendientes
        for i, note in enumerate(engine_notes):
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

    # 8) REGRESIÓN: patrón del bot (engagement por carril) en tutorial —
    #    el sustain no debe romperse (bug: se soltaba la tecla ~350ms antes)
    eng, _ = new_engine("tutorial", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot tutorial -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot tutorial sin miss", eng.miss == 0, f"miss={eng.miss}")
    sust = [n for n in eng.notes if n["l"] > 0]
    check("bot tutorial sustains aciertos", all(n["status"] == "done" for n in sust),
          [n["status"] for n in sust])

    # 9) REGRESIÓN: bopeebo easy (66 sustains) jugado como el bot -> WIN
    eng, _ = new_engine("bopeebo", 0)
    eng.scale = 0.6
    play_like_bot(eng, eng.scale)
    check("bot bopeebo -> WIN", eng.last_result.startswith("WIN"), eng.last_result)
    check("bot bopeebo sin miss", eng.miss == 0, f"miss={eng.miss}")
    sust = [n for n in eng.notes if n["l"] > 0]
    broken = [n for n in sust if n["status"] == "miss"]
    check("bot bopeebo sustains intactos", len(broken) == 0, f"rotos={len(broken)}")

    print(f"\nPASS {PASS}  FAIL {FAIL}")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()