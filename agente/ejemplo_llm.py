#!/usr/bin/env python3
"""Ejemplo de IA "lenta" (estilo LLM). Es ilustrativo, no para ganar.

Un LLM tarda cientos de milisegundos o segundos en contestar, demasiado para
decidir nota por nota (eso se vio en la v2). Truco: cada cierto tiempo le
pasamos las PRÓXIMAS notas y le pedimos un plan; luego el plan se ejecuta
con un reloj rápido. Mientras piensa, el juego sigue.

Sin configuración usa un "modelo de mentira" local (a veces se equivoca).
Con un servidor compatible con la API de OpenAI (por ejemplo uno local):
    FNF_LLM_URL=http://127.0.0.1:8080/v1/chat/completions FNF_LLM_MODEL=mi-modelo \
    python agente/ejemplo_llm.py
La clave, si hace falta, se lee de la variable FNF_LLM_KEY (nunca la escribas en el código).
"""
import argparse
import json
import os
import random
import sys
import threading
import time
import urllib.request

try:
    from comun import CARRILES, FLECHAS, URL_POR_DEFECTO, Reloj, conectar
except ImportError:
    from .comun import CARRILES, FLECHAS, URL_POR_DEFECTO, Reloj, conectar

HORIZONTE_MS = 2500


def preguntar_al_modelo(notas, lento_s=0.6, rnd=random.Random(5)):
    """Devuelve [{"id", "lane"}] con las notas que el modelo decide tocar."""
    url = os.environ.get("FNF_LLM_URL")
    if url:
        texto = "Juego de ritmo. Notas próximas (id, carril 0-3, ms):\n" + "\n".join(
            f"{n['id']},{n['lane']},{n['t']}" for n in notas) + '\nResponde SOLO JSON: [{"id":..,"lane":..}] con las notas a pulsar.'
        cuerpo = json.dumps({"model": os.environ.get("FNF_LLM_MODEL", "local"), "messages": [{"role": "user", "content": texto}], "temperature": 0}).encode()
        cab = {"Content-Type": "application/json"}
        if os.environ.get("FNF_LLM_KEY"):
            cab["Authorization"] = "Bearer " + os.environ["FNF_LLM_KEY"]
        with urllib.request.urlopen(urllib.request.Request(url, cuerpo, cab), timeout=20) as r:
            contenido = json.load(r)["choices"][0]["message"]["content"]
        inicio, fin = contenido.find("["), contenido.rfind("]")
        return json.loads(contenido[inicio:fin + 1])
    time.sleep(lento_s)  # el "modelo de mentira" también tarda
    return [{"id": n["id"], "lane": n["lane"] if rnd.random() > 0.08 else (n["lane"] + 1) % 4} for n in notas]


def jugar(ws, una=False, log=print):
    reloj = Reloj()
    notas, plan, hechas = [], [], set()
    pensando = threading.Event()

    def pensar(t):
        ventana = [n for n in notas if t + 300 < n["t"] <= t + HORIZONTE_MS and n["id"] not in hechas]
        if not ventana:
            pensando.clear()
            return
        ws.enviar({"type": "think", "text": f"Pensando… {len(ventana)} notas en los próximos {HORIZONTE_MS / 1000:.1f} s"})
        try:
            respuesta = preguntar_al_modelo(ventana)
        except Exception as e:  # noqa: BLE001 (ejemplo: cualquier error del modelo)
            ws.enviar({"type": "think", "text": f"El modelo falló: {e}"})
            respuesta = []
        por_id = {n["id"]: n for n in ventana}
        for r in respuesta:
            n = por_id.get(r.get("id"))
            if n and r.get("lane") in range(4):
                hechas.add(n["id"])
                plan.append((n["t"], r["lane"], n.get("l") or 50, n["id"]))
        plan.sort()
        ws.enviar({"type": "think", "text": f"Plan listo: {len(respuesta)} pulsaciones. " + " ".join(FLECHAS[r['lane']] for r in respuesta[:12])})
        pensando.clear()

    sueltas = []
    while True:
        msg = ws.recibir(timeout=0.002)
        if msg:
            if msg.get("type") == "chart":
                notas, plan, hechas = msg["notes"], [], set()
                reloj.reiniciar()
            elif msg.get("type") == "state":
                reloj.ver(msg["t"])
            elif msg.get("type") == "result":
                log(f"[llm] resultado: {msg.get('resultado')} · precisión {msg.get('precision', 0) * 100:.1f} %")
                notas, plan = [], []
                if una:
                    return msg
        t = reloj.ahora()
        if t is None:
            continue
        if notas and not pensando.is_set():
            pensando.set()
            threading.Thread(target=pensar, args=(t,), daemon=True).start()
        while plan and plan[0][0] <= t:
            tn, lane, largo, nid = plan.pop(0)
            ws.enviar({"type": "key", "lane": lane, "down": True, "why": f"plan del modelo: nota {nid} → {CARRILES[lane]}"})
            sueltas.append((tn + largo, lane))
        for s in [s for s in sueltas if s[0] <= t]:
            ws.enviar({"type": "key", "lane": s[1], "down": False})
            sueltas.remove(s)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relay", default=URL_POR_DEFECTO)
    ap.add_argument("--una", action="store_true")
    a = ap.parse_args()
    try:
        ws = conectar("ejemplo LLM", a.relay)
    except OSError as e:
        sys.exit(f"No pude conectar a {a.relay}: {e}")
    print("[llm] conectado. Modelo:", os.environ.get("FNF_LLM_URL") or "de mentira (local)")
    try:
        jugar(ws, una=a.una)
    except (KeyboardInterrupt, ConnectionError):
        pass


if __name__ == "__main__":
    main()
