#!/usr/bin/env python3
"""Agente "observe": no lee el chart. Solo mira el estado y reacciona, como el agente `observe` original.

Con un juego v2 usa las próximas notas del "lookahead" y manda cada tecla con "at" (el instante de la
canción en que debe contar), así la latencia no le afecta. Con un juego v1 reacciona a "lanes" como siempre.

    python agente/agente_observe.py
"""
import argparse
import sys
import time

try:
    from comun import FLECHAS, argumentos_comunes, caps_del_juego, conectar, responder_ping
except ImportError:
    from .comun import FLECHAS, argumentos_comunes, caps_del_juego, conectar, responder_ping

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


VENTANA_AT_MS = 400  # v2: programa las notas que llegan en menos de esto


def decidir_v2(estado, programadas, ventana=VENTANA_AT_MS):
    """v2, función pura: notas de "next" que llegan pronto → teclas con "at" (pulsar y soltar)."""
    salen = []
    for n in estado.get("next", []):
        if n["id"] in programadas or n["t"] - estado["t"] > ventana:
            continue
        programadas.add(n["id"])
        salen.append({"type": "key", "lane": n["lane"], "down": True, "at": n["t"], "why": f"{FLECHAS[n['lane']]} nota {n['id']} (la vi venir)"})
        salen.append({"type": "key", "lane": n["lane"], "down": False, "at": n["t"] + (n.get("l") or 45)})
    return salen


def jugar(ws, una=False, log=print):
    abajo, pulsado_en = [False] * 4, [0.0] * 4
    usa_at = "at" in caps_del_juego(getattr(ws, "bienvenida", {}) or {})
    programadas = set()
    while True:
        msg = ws.recibir(timeout=1)
        if not msg:
            continue
        if msg.get("type") in ("welcome", "peers"):
            usa_at = "at" in caps_del_juego(msg)
        elif msg.get("type") == "ping":
            responder_ping(ws, msg)
        elif msg.get("type") == "chart":
            programadas = set()
            ws.enviar({"type": "think", "text": "No leo el chart: reacciono a lo que veo en cada estado."})
        elif msg.get("type") == "state" and msg.get("playing") and usa_at and msg.get("v") == 2:
            for m in decidir_v2(msg, programadas):
                ws.enviar(m)
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
    ap = argumentos_comunes(argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter))
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    try:
        ws = conectar("observe (Python)", a.relay, token=a.token, v=2, caps=["at"])
    except OSError as e:
        sys.exit(f"No pude conectar a {a.relay}: {e}. ¿Arrancaste python agente/relay.py?")
    print(f"[observe] conectado a {a.relay}.")
    try:
        jugar(ws, una=a.una)
    except (KeyboardInterrupt, ConnectionError):
        pass


if __name__ == "__main__":
    main()
