#!/usr/bin/env python3
"""Agente "chart": lee todas las notas al empezar y pulsa cada una a su tiempo.

Es la versión 4.0 del agente `chart` original (legacy/bot/agents/chart.js),
ahora conectado al juego del navegador a través del relay.

    python agente/relay.py &
    python agente/agente_chart.py            # espera a que empieces una canción con "IA externa"
"""
import argparse
import sys

try:
    from comun import FLECHAS, URL_POR_DEFECTO, Reloj, conectar
except ImportError:
    from .comun import FLECHAS, URL_POR_DEFECTO, Reloj, conectar

PULSACION_MS = 50


def planificar(notas, pulsacion=PULSACION_MS):
    """Convierte las notas en una lista ordenada de acciones (t, lane, down, motivo)."""
    acciones = []
    por_carril = {}
    for n in sorted(notas, key=lambda x: x["t"]):
        por_carril.setdefault(n["lane"], []).append(n)
    for lane, lista in por_carril.items():
        for i, n in enumerate(lista):
            fin = n["t"] + (n.get("l") or pulsacion)
            sig = lista[i + 1]["t"] if i + 1 < len(lista) else None
            if sig is not None and fin >= sig:
                fin = sig - 5
            motivo = f"nota {n.get('id', '?')} en t={n['t']}" + (f" (larga {n['l']} ms)" if n.get("l") else "")
            acciones.append((n["t"], lane, True, motivo))
            acciones.append((max(fin, n["t"] + 1), lane, False, ""))
    acciones.sort(key=lambda a: (a[0], a[2]))  # soltar antes que pulsar en el mismo ms
    return acciones


def jugar(ws, una=False, log=print):
    reloj = Reloj()
    plan, i = [], 0
    while True:
        msg = ws.recibir(timeout=0.002)
        if msg:
            tipo = msg.get("type")
            if tipo == "chart":
                plan, i = planificar(msg["notes"]), 0
                reloj.reiniciar()
                log(f"[chart] canción '{msg.get('song')}': {len(msg['notes'])} notas")
                ws.enviar({"type": "think", "text": f"Leí el chart: {len(msg['notes'])} notas. Voy a pulsar cada una a su tiempo."})
            elif tipo == "state":
                reloj.ver(msg["t"])
            elif tipo == "result":
                log(f"[chart] resultado: {msg.get('resultado')} · precisión {msg.get('precision', 0) * 100:.1f} % · fallos {msg.get('juicios', {}).get('miss')}")
                plan, i = [], 0
                if una:
                    return msg
        t = reloj.ahora()
        while t is not None and i < len(plan) and plan[i][0] <= t:
            ta, lane, down, motivo = plan[i]
            ws.enviar({"type": "key", "lane": lane, "down": down, **({"why": f"{FLECHAS[lane]} {motivo}"} if down else {})})
            i += 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relay", default=URL_POR_DEFECTO)
    ap.add_argument("--una", action="store_true", help="salir después de una canción")
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    try:
        ws = conectar("chart (Python)", a.relay)
    except OSError as e:
        sys.exit(f"No pude conectar a {a.relay}: {e}. ¿Arrancaste python agente/relay.py?")
    print(f"[chart] conectado a {a.relay}. Elige 'IA externa' en el juego y pulsa Jugar.")
    try:
        jugar(ws, una=a.una)
    except (KeyboardInterrupt, ConnectionError):
        pass


if __name__ == "__main__":
    main()
