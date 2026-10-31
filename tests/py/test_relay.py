import json
import time
import urllib.request

import pytest

from conftest import TOKEN
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
    juego.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN})
    assert esperar(juego, "welcome")["agents"] == 0

    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "prueba", "token": TOKEN})
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
    agente.enviar({"type": "hello", "role": "agent", "name": "x", "token": TOKEN})
    esperar(agente, "welcome")
    agente.enviar({"type": "state", "t": 1})
    assert esperar(agente, "error")["error"] == "no_permitido"
    agente.enviar("esto no es json")
    assert esperar(agente, "error")["error"] == "json_invalido"
    agente.enviar({"type": "hello", "role": "admin", "token": TOKEN})
    assert esperar(agente, "error")["error"] == "role_invalido"


def cerrado(ws, timeout=2):
    """True si el relay cierra la conexión."""
    fin = time.monotonic() + timeout
    while time.monotonic() < fin:
        try:
            ws.recibir(timeout=0.2)
        except ConnectionError:
            return True
    return False


def test_sin_token_no_entra(relay):
    ws = ClienteWS(relay)
    ws.enviar({"type": "hello", "role": "agent", "name": "intruso"})
    assert esperar(ws, "error")["error"] == "token_requerido"
    assert cerrado(ws)


def test_token_incorrecto_no_entra_y_no_recibe_nada(relay):
    juego = ClienteWS(relay)
    juego.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN})
    esperar(juego, "welcome")
    ws = ClienteWS(relay)
    ws.enviar({"type": "hello", "role": "agent", "name": "intruso", "token": "casi-" + TOKEN})
    assert esperar(ws, "error")["error"] == "token_invalido"
    assert cerrado(ws)
    juego.enviar({"type": "state", "t": 1})
    # el juego no ve agentes nuevos
    with pytest.raises(AssertionError):
        esperar(juego, "peers", timeout=0.5, cumple=lambda m: m["agents"] > 0)


def test_mandar_algo_antes_del_saludo_cierra(relay):
    ws = ClienteWS(relay)
    ws.enviar({"type": "key", "lane": 0, "down": True})
    assert esperar(ws, "error")["error"] == "token_requerido"
    assert cerrado(ws)


def test_origin_de_otra_web_rechazado(relay):
    with pytest.raises(ConnectionError, match="403"):
        ClienteWS(relay, cabeceras={"Origin": "https://otra-web.example"})


def test_origin_local_aceptado(relay):
    for origen in ("http://127.0.0.1:8000", "http://localhost:5173"):
        ws = ClienteWS(relay, cabeceras={"Origin": origen})
        ws.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN})
        assert esperar(ws, "welcome")
        ws.cerrar()


def test_token_por_url_tambien_vale(relay):
    ws = ClienteWS(relay + "/?token=" + TOKEN)
    ws.enviar({"type": "hello", "role": "agent", "name": "url"})
    assert esperar(ws, "welcome")
    ws.cerrar()


def test_salud_http_no_revela_nada(relay):
    with urllib.request.urlopen(relay.replace("ws://", "http://") + "/") as r:
        d = json.load(r)
    assert d["v"] == 2 and "names" not in d and TOKEN not in json.dumps(d)


def test_v2_handshake_caps_y_info_del_juego(relay):
    juego = ClienteWS(relay)
    juego.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN, "v": 2, "caps": ["at", "ping", "lookahead"], "lookahead": 1500, "hz": 30})
    w = esperar(juego, "welcome")
    assert w["v"] == 2 and "at" in w["caps"]
    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "v2", "token": TOKEN, "v": 2, "caps": ["at"]})
    w = esperar(agente, "welcome")
    assert w["game"]["caps"] == ["at", "ping", "lookahead"] and w["game"]["lookahead"] == 1500
    juego.cerrar()
    agente.cerrar()


def test_ping_al_relay_y_ping_pong_entre_agente_y_juego(relay):
    juego = ClienteWS(relay)
    juego.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN, "v": 2})
    esperar(juego, "welcome")
    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "a", "token": TOKEN, "v": 2})
    esperar(agente, "welcome")
    agente.enviar({"type": "ping", "id": 7, "target": "relay", "sent": 1})
    p = esperar(agente, "pong")
    assert p["from"] == "relay" and p["id"] == 7
    agente.enviar({"type": "ping", "id": 8, "sent": 5})
    ping = esperar(juego, "ping")
    juego.enviar({"type": "pong", "id": ping["id"], "sent": ping["sent"], "t": 1234, "to_id": ping["from_id"]})
    p = esperar(agente, "pong")
    assert p["id"] == 8 and p["t"] == 1234
    juego.cerrar()
    agente.cerrar()


def test_espectador_ve_todo_pero_no_puede_tocar(relay):
    juego = ClienteWS(relay)
    juego.enviar({"type": "hello", "role": "game", "name": "navegador", "token": TOKEN})
    esperar(juego, "welcome")
    agente = ClienteWS(relay)
    agente.enviar({"type": "hello", "role": "agent", "name": "a", "token": TOKEN})
    esperar(agente, "welcome")
    mira = ClienteWS(relay)
    mira.enviar({"type": "hello", "role": "spectator", "name": "público", "token": TOKEN, "v": 2})
    assert esperar(mira, "welcome")["spectators"] == 1
    juego.enviar({"type": "state", "t": 50})
    assert esperar(mira, "state")["t"] == 50
    agente.enviar({"type": "key", "lane": 1, "down": True, "at": 70})
    assert esperar(mira, "key")["at"] == 70
    mira.enviar({"type": "key", "lane": 0, "down": True})
    assert esperar(mira, "error")["error"] == "no_permitido"
    with pytest.raises(AssertionError):
        esperar(juego, "key", timeout=0.4, cumple=lambda m: m.get("from") == "público")
    for ws in (juego, agente, mira):
        ws.cerrar()
