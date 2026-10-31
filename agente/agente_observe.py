#!/usr/bin/env python3
"""Agente "observe": no lee el chart. Solo mira el estado (cuánto falta a la
próxima nota de cada carril) y reacciona, como el agente `observe` original.

    python agente/agente_observe.py
"""
import argparse
import sys
import time

try:
    from comun import FLECHAS, URL_POR_DEFECTO, conectar
except ImportError:
    from .comun import FLECHAS, URL_POR_DEFECTO, conectar

UMBRAL_MS = 20       # pulsa cuando a la nota le faltan 20 ms o menos
MIN_PULSADO_MS = 40  # no suelta antes de 40 ms


def decidir(estado, abajo, pulsado_en, ahora_ms, umbral=UMBRAL_MS):
    """Función pura: dado el estado y las teclas, devuelve [(lane, down, motivo)]."""
    acciones = []
    for lane in range(4):
        dt = estado["lanes"][lane]
        hold = estado["holds"][lane]
        if not abajo[lane] and dt is not None and dt <= umbral:
            acciones.append((lane, True, f"{FLECHAS[lane]} faltan {dt} ms"))
        elif abajo[lane] and hold is None and ahora_ms - pulsado_en[lane] >= MIN_PULSADO_MS:
            acciones.append((lane, False, ""))
    return acciones


def jugar(ws, una=False, log=print):
    abajo, pulsado_en = [False] * 4, [0.0] * 4
    while True:
        msg = ws.recibir(timeout=1)
        if not msg:
            continue
        if msg.get("type") == "chart":
            ws.enviar({"type": "think", "text": "No leo el chart: reacciono a lo que veo en cada estado."})
        elif msg.get("type") == "state" and msg.get("playing"):
            ahora = time.monotonic() * 1000
            for lane, down, motivo in decidir(msg, abajo, pulsado_en, ahora):
                abajo[lane] = down
                if down:
                    pulsado_en[lane] = ahora
                ws.enviar({"type": "key", "lane": lane, "down": down, **({"why": motivo} if down else {})})
        elif msg.get("type") == "result":
            log(f"[observe] resultado: {msg.get('resultado')} · precisión {msg.get('precision', 0) * 100:.1f} %")
            abajo = [False] * 4
            if una:
                return msg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relay", default=URL_POR_DEFECTO)
    ap.add_argument("--una", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    try:
        ws = conectar("observe (Python)", a.relay)
    except OSError as e:
        sys.exit(f"No pude conectar a {a.relay}: {e}. ¿Arrancaste python agente/relay.py?")
    print(f"[observe] conectado a {a.relay}.")
    try:
        jugar(ws, una=a.una)
    except (KeyboardInterrupt, ConnectionError):
        pass


if __name__ == "__main__":
    main()
