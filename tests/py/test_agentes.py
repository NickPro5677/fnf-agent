import threading
import time

import agente_chart
import agente_observe
from comun import Reloj, conectar
from fnfws import ClienteWS


def test_planificar_notas_simples_holds_y_repetidas():
    plan = agente_chart.planificar([
        {"id": 0, "t": 1000, "lane": 0, "l": 0},
        {"id": 1, "t": 1030, "lane": 0, "l": 0},
        {"id": 2, "t": 1100, "lane": 3, "l": 400},
    ])
    sin_motivo = [(t, lane, down) for t, lane, down, _ in plan]
    assert sin_motivo == [(1000, 0, True), (1025, 0, False), (1030, 0, True), (1080, 0, False), (1100, 3, True), (1500, 3, False)]


def test_reloj_usa_la_estimacion_con_menos_retraso():
    falso = [10.0]
    r = Reloj(ahora=lambda: falso[0])
    assert r.ahora() is None
    r.ver(500)
    falso[0] = 10.1
    r.ver(590)  # llegó con 10 ms de retraso: no cambia
    assert round(r.ahora()) == 600
    r.ver(0)    # el juego se reinició
    assert round(r.ahora()) == 0


def test_observe_decide():
    e = {"lanes": [15, 300, None, -5], "holds": [None, None, None, None]}
    acc = agente_observe.decidir(e, [False] * 4, [0] * 4, 1000)
    assert [(a[0], a[1]) for a in acc] == [(0, True), (3, True)]
    e2 = {"lanes": [None, None, None, None], "holds": [200, None, None, None]}
    acc2 = agente_observe.decidir(e2, [True, False, False, True], [900, 0, 0, 980], 1000)
    assert acc2 == []  # 0 sigue en hold; 3 lleva solo 20 ms
    acc3 = agente_observe.decidir(e2, [True, False, False, True], [900, 0, 0, 900], 1000)
    assert acc3 == [(3, False, "")]


class JuegoFalso:
    """Imita al navegador: manda chart y estados a 30 Hz y mide cuándo llegan las teclas."""

    def __init__(self, url, notas):
        self.ws = ClienteWS(url)
        self.ws.enviar({"type": "hello", "role": "game", "name": "falso"})
        self.notas = notas
        self.pulsos = []

    def correr(self, duracion_ms):
        t0 = time.monotonic()
        self.ws.enviar({"type": "chart", "song": "prueba", "notes": self.notas})
        ultimo = -1e9
        pendientes = list(self.notas)
        while True:
            t = (time.monotonic() - t0) * 1000 - 500
            if t > duracion_ms:
                break
            if t - ultimo >= 33:
                ultimo = t
                pendientes = [n for n in pendientes if n["t"] - t > -180 and n["id"] not in {p[1] for p in self.pulsos}]
                lanes = [None] * 4
                for n in pendientes:
                    if lanes[n["lane"]] is None:
                        lanes[n["lane"]] = round(n["t"] - t)
                self.ws.enviar({"type": "state", "t": round(t), "playing": True, "lanes": lanes, "holds": [None] * 4, "next": []})
            m = self.ws.recibir(timeout=0.002)
            if m and m.get("type") == "key" and m["down"]:
                cand = [n for n in self.notas if n["lane"] == m["lane"] and abs(n["t"] - t) <= 180 and n["id"] not in {p[1] for p in self.pulsos}]
                if cand:
                    self.pulsos.append((t - cand[0]["t"], cand[0]["id"]))
        self.ws.enviar({"type": "result", "resultado": "victoria", "precision": 1, "juicios": {"miss": 0}})


def notas_prueba():
    return [{"id": i, "t": 300 + i * 220, "lane": i % 4, "l": 0} for i in range(10)]


def _jugar_con(relay, modulo, nombre):
    ws = conectar(nombre, relay)
    hilo = threading.Thread(target=lambda: modulo.jugar(ws, una=True, log=lambda *_: None), daemon=True)
    hilo.start()
    time.sleep(0.2)
    juego = JuegoFalso(relay, notas_prueba())
    juego.correr(300 + 10 * 220 + 300)
    hilo.join(3)
    return juego.pulsos


def test_agente_chart_acierta_todas_dentro_de_good(relay):
    pulsos = _jugar_con(relay, agente_chart, "chart")
    assert len(pulsos) == 10
    assert max(abs(d) for d, _ in pulsos) <= 90, pulsos


def test_agente_observe_acierta_todas(relay):
    pulsos = _jugar_con(relay, agente_observe, "observe")
    assert len(pulsos) == 10
    assert max(abs(d) for d, _ in pulsos) <= 135, pulsos


def test_ejemplo_llm_con_modelo_de_mentira_toca_notas(relay):
    import ejemplo_llm
    pulsos = _jugar_con(relay, ejemplo_llm, "llm")
    assert len(pulsos) >= 3  # ilustrativo: llega tarde a las primeras, pero juega
