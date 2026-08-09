#!/usr/bin/env python3
# ============================================================
# fnf-agent/perception/perceive.py
# Percepción simbólica: detecta la flecha más cercana por carril
# en el frame renderizado, sin red neuronal.
# Salida JSON: {"lanes": {"left": {"dist_to_hit": n, "y": y}, ...}}
# dist_to_hit = píxeles que faltan para llegar a la línea (0=encima)
# -1 si el carril no tiene flecha visible.
# ============================================================
import json
import os
import sys

import PIL.Image as Image

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_DIR = os.path.dirname(ROOT)
RENDER = os.path.join(ENV_DIR, "env", "render", "latest.png")

HIT_Y = 560
TOP_Y = 200
LANE_XS = [200, 280, 360, 440]
LANE_NAMES = ["left", "down", "up", "right"]
LANE_COLOR = [(196, 94, 201), (46, 169, 229), (120, 230, 92), (250, 103, 92)]
TOL = 30
SCAN_GAP = 2


def within(c, ref, tol=TOL):
    return all(abs(a - b) <= tol for a, b in zip(c, ref))


def perceive(frame_path=None):
    path = frame_path or RENDER
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return {"error": "no_frame", "lanes": {}}
    pixels = im.load()
    lanes = {}
    for li, x in enumerate(LANE_XS):
        # barrido de abajo hacia arriba por la COLUMNA central exacta.
        # El receptor es de color neutro en el centro (solo su contorno,
        # fuera del eje) y las flechas reales lo cruzan por completo.
        best_y = None
        run = 0
        for y in range(HIT_Y - 10, TOP_Y, -1):
            if within(pixels[x, y], LANE_COLOR[li]):
                run += 1
                if run >= 6:  # trazo grueso: es una flecha real
                    best_y = y + run - 1  # borde inferior visible
                    break
            else:
                run = 0
        lanes[LANE_NAMES[li]] = {
            "y": best_y,
            "dist": max(0, HIT_Y - best_y) if best_y is not None else -1,
        }
    return {"lanes": lanes}


def to_state_text(res):
    lanes = res.get("lanes", {})
    return " ".join(f"lane:{k}={lanes.get(k, {}).get('dist', -1)}" for k in LANE_NAMES)


if __name__ == "__main__":
    fp = sys.argv[1] if len(sys.argv) > 1 else None
    res = perceive(fp)
    if "--text" in sys.argv:
        print(to_state_text(res))
    else:
        print(json.dumps(res))