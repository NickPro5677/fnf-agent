import json
import time
import urllib.request

from fnfws import ClienteWS


def esperar(ws, tipo, timeout=2, cumple=lambda m: True):
    fin = time.monotonic() + timeout
    while time.monotonic() < fin:
        m = ws.recibir(timeout=0.2)
        if m and m.get("type") == tipo and cumple(m):
            return m
    raise AssertionError(f"no llegó {tipo}")


def test_responde_http_de_salud(relay):
    with urllib.request.urlopen(relay.replace("ws://", "http://") + "/") as r:
        assert json.load(r)["relay"] == "fnf-agent"


def test_juego_y_agente_se_ven_y_se_pasan_mensajes(relay):
    juego = ClienteWS(relay)
    juego.enviar({"type": "hello", "role": "game", "name": "navegador"})
    assert esperar(juego, "welcome")["agents"] == 0

    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "prueba"})
    assert esperar(agente, "welcome")["games"] == 1
    p = esperar(juego, "peers", cumple=lambda m: m["agents"] == 1)
    assert p["agents"] == 1 and p["names"] == ["prueba"]

    juego.enviar({"type": "state", "t": 123})
    assert esperar(agente, "state")["t"] == 123

    agente.enviar({"type": "key", "lane": 2, "down": True})
    k = esperar(juego, "key")
    assert k["lane"] == 2 and k["from"] == "prueba"

    agente.cerrar()
    assert esperar(juego, "peers", cumple=lambda m: m["agents"] == 0)["agents"] == 0
    juego.cerrar()


def test_un_agente_no_puede_hacerse_pasar_por_el_juego(relay):
    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "x"})
    esperar(agente, "welcome")
    agente.enviar({"type": "state", "t": 1})
    assert esperar(agente, "error")["error"] == "no_permitido"
    agente.enviar("esto no es json")
    assert esperar(agente, "error")["error"] == "json_invalido"
    agente.enviar({"type": "hello", "role": "admin"})
    assert esperar(agente, "error")["error"] == "role_invalido"
