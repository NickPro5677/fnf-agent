#!/usr/bin/env python3
"""Relay de FNF-Agent: une el juego (navegador) con tu IA (agente). Protocolo v2, compatible con v1.

    python agente/relay.py              # escucha en ws://127.0.0.1:8765 y muestra el token
    python agente/relay.py --token mi-token-largo   # fija tú el token (o variable FNF_TOKEN)

Seguridad:
- Token SIEMPRE obligatorio: el relay lo genera al arrancar, lo muestra aquí y lo guarda en
  ~/.fnf-agent/token (solo tu usuario puede leerlo) para que los agentes de este equipo lo usen solos.
  En el juego lo escribes en Ajustes de IA externa.
- Origin: si la conexión viene de una página web, solo se aceptan http://127.0.0.1 y http://localhost
  (cualquier puerto) y las que añadas con --origen. Así otra web abierta en tu navegador no puede usarlo.

Reglas:
- Cada cliente se presenta con {"type":"hello","role":"game"|"agent"|"spectator","name":"...","token":"..."}.
  (v2 añade "v":2 y "caps":[...]; ver docs/protocolo-v2.md)
- Lo del juego (chart, state, judgement, result, pong) llega a agentes y espectadores.
- Lo del agente (key, think, ping) llega al juego; los espectadores lo ven también.
- {"type":"ping","target":"relay"} lo contesta el propio relay (para medir la conexión).
Solo librería estándar.
"""
import argparse
import asyncio
import hmac
import itertools
import json
import os
import re
import secrets
import sys
import time

try:
    from fnfws import CERRAR, MAX_MENSAJE, PING, PONG, TEXTO, armar_frame, clave_aceptar
except ImportError:  # importado como paquete (tests)
    from .fnfws import CERRAR, MAX_MENSAJE, PING, PONG, TEXTO, armar_frame, clave_aceptar

VERSION = 2
CAPS = ["at", "ping", "lookahead", "spectator"]
DEL_JUEGO = {"chart", "state", "judgement", "result", "pong", "ping", "config"}
DEL_AGENTE = {"key", "think", "ping", "pong"}
ORIGEN_LOCAL = re.compile(r"^https?://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$")
ARCHIVO_TOKEN = os.path.join(os.path.expanduser("~"), ".fnf-agent", "token")
_ids = itertools.count(1)


def nuevo_token():
    """Token fácil de teclear en el móvil: 3 grupos de 4 (≈ 60 bits)."""
    abc = "abcdefghjkmnpqrstuvwxyz23456789"
    return "-".join("".join(secrets.choice(abc) for _ in range(4)) for _ in range(3))


def guardar_token(token, ruta=ARCHIVO_TOKEN):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(token + "\n")


class Cliente:
    def __init__(self, writer):
        self.writer = writer
        self.id = next(_ids)
        self.rol = None
        self.nombre = "?"
        self.v = 1
        self.caps = []
        self.info = {}

    async def enviar(self, obj, retraso=0):
        if retraso:
            await asyncio.sleep(retraso / 1000)
        try:
            self.writer.write(armar_frame(TEXTO, json.dumps(obj, separators=(",", ":")).encode()))
            await self.writer.drain()
        except (ConnectionError, RuntimeError):
            pass


class Relay:
    def __init__(self, token, origenes=(), retraso=0, log=print):
        if not token:
            raise ValueError("el relay necesita un token")
        self.token = token
        self.origenes = set(origenes)
        self.retraso = retraso  # ms de latencia simulada por mensaje reenviado (solo pruebas)
        self.clientes = set()
        self.log = log

    def origen_ok(self, origen):
        return origen is None or bool(ORIGEN_LOCAL.match(origen)) or origen in self.origenes

    def resumen(self):
        agentes = [c.nombre for c in self.clientes if c.rol == "agent"]
        juegos = [c for c in self.clientes if c.rol == "game"]
        r = {"games": len(juegos), "agents": len(agentes), "spectators": sum(1 for c in self.clientes if c.rol == "spectator"),
             "names": agentes}
        if juegos:
            r["game"] = juegos[-1].info
        return r

    async def avisar(self, tipo="peers", solo=None):
        msg = {"type": tipo, "v": VERSION, "caps": CAPS, **self.resumen()}
        for c in list(solo and [solo] or self.clientes):
            if c.rol:
                await c.enviar(msg)

    async def manejar(self, reader, writer):
        try:
            cab = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 10)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError, ConnectionError):
            writer.close()
            return
        lineas = cab.decode(errors="replace").split("\r\n")
        h = {}
        for l in lineas[1:]:
            if ":" in l:
                k, v = l.split(":", 1)
                h[k.strip().lower()] = v.strip()
        origen = h.get("origin")
        if not self.origen_ok(origen):
            self.log(f"[relay] ✋ rechazo una conexión desde {origen[:80]} (Origin no permitido)")
            writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            await writer.drain()
            writer.close()
            return
        if h.get("upgrade", "").lower() != "websocket" or "sec-websocket-key" not in h:
            # salud: no dice nada que sirva para conectarse
            cuerpo = json.dumps({"ok": True, "relay": "fnf-agent", "v": VERSION, "token": "obligatorio"}).encode()
            permitir = f"Access-Control-Allow-Origin: {origen}\r\nVary: Origin\r\n" if origen else ""
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n" + permitir.encode()
                         + f"Content-Length: {len(cuerpo)}\r\nConnection: close\r\n\r\n".encode() + cuerpo)
            await writer.drain()
            writer.close()
            return
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {clave_aceptar(h['sec-websocket-key'])}\r\n\r\n").encode())
        await writer.drain()
        c = Cliente(writer)
        m = re.search(r"[?&]token=([^&\s]+)", lineas[0].split(" ")[1] if " " in lineas[0] else "")
        c.token_url = m.group(1) if m else None
        self.clientes.add(c)
        try:
            await self._bucle(reader, c)
        except (asyncio.IncompleteReadError, ConnectionError, ValueError):
            pass
        finally:
            self.clientes.discard(c)
            if c.rol:
                self.log(f"[relay] sale {c.rol} '{c.nombre}'")
                await self.avisar()
            writer.close()

    async def _bucle(self, reader, c):
        while True:
            b1, b2 = await reader.readexactly(2)
            op = b1 & 0x0F
            n = b2 & 0x7F
            if n == 126:
                n = int.from_bytes(await reader.readexactly(2), "big")
            elif n == 127:
                n = int.from_bytes(await reader.readexactly(8), "big")
            if n > MAX_MENSAJE:
                raise ValueError("mensaje demasiado grande")
            mascara = await reader.readexactly(4) if b2 & 0x80 else None
            datos = await reader.readexactly(n) if n else b""
            if mascara:
                datos = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
            if op == CERRAR:
                return
            if op == PING:
                c.writer.write(armar_frame(PONG, datos))
                continue
            if op != TEXTO:
                continue
            try:
                msg = json.loads(datos.decode())
            except ValueError:
                await c.enviar({"type": "error", "error": "json_invalido"})
                continue
            if not isinstance(msg, dict):
                continue
            if await self._mensaje(c, msg) == "cerrar":
                c.writer.write(armar_frame(CERRAR, (4001).to_bytes(2, "big") + b"token"))
                await c.writer.drain()
                return

    def _token_ok(self, dado):
        return isinstance(dado, str) and hmac.compare_digest(dado.encode(), self.token.encode())

    async def _mensaje(self, c, msg):
        tipo = msg.get("type")
        if tipo == "hello":
            if not self._token_ok(msg.get("token") or c.token_url):
                falta = not (msg.get("token") or c.token_url)
                self.log(f"[relay] ✋ rechazo a '{str(msg.get('name'))[:40]}': {'sin token' if falta else 'token incorrecto'}")
                await c.enviar({"type": "error", "error": "token_requerido" if falta else "token_invalido",
                                "detail": "Copia el token que muestra el relay al arrancar."})
                return "cerrar"
            rol = msg.get("role")
            if rol not in ("game", "agent", "spectator"):
                await c.enviar({"type": "error", "error": "role_invalido"})
                return None
            c.rol, c.nombre = rol, str(msg.get("name") or rol)[:40]
            c.v = 2 if msg.get("v") == 2 else 1
            c.caps = [x for x in msg.get("caps", []) if isinstance(x, str)][:16] if c.v == 2 else []
            if rol == "game":
                c.info = {k: msg[k] for k in ("lookahead", "hz", "mode", "caps") if k in msg}
            self.log(f"[relay] entra {c.rol} '{c.nombre}' (v{c.v})")
            await self.avisar("welcome", solo=c)
            await self.avisar()
            return None
        if not c.rol:
            await c.enviar({"type": "error", "error": "token_requerido", "detail": "Manda primero hello con tu token."})
            return "cerrar"
        if tipo == "ping" and msg.get("target") == "relay":
            await c.enviar({"type": "pong", "id": msg.get("id"), "sent": msg.get("sent"), "from": "relay", "relay_ms": int(time.time() * 1000)})
            return None
        if c.rol == "game" and tipo in DEL_JUEGO:
            if tipo == "config":
                c.info = {k: msg[k] for k in ("lookahead", "hz", "mode", "caps") if k in msg}
                await self.avisar()
                return None
            if tipo == "pong" and "to_id" in msg:
                destino = [x for x in self.clientes if x.id == msg["to_id"]]
            else:
                destino = [x for x in self.clientes if x.rol in ("agent", "spectator")]
                if tipo in ("ping",):
                    msg["from_id"] = c.id
                    destino = [x for x in destino if x.rol == "agent"]
        elif c.rol == "agent" and tipo in DEL_AGENTE:
            msg["from"] = c.nombre
            if tipo == "pong" and "to_id" in msg:
                destino = [x for x in self.clientes if x.id == msg["to_id"]]
            else:
                if tipo == "ping":
                    msg["from_id"] = c.id
                destino = [x for x in self.clientes if x.rol == "game" or (x.rol == "spectator" and tipo != "ping")]
        else:
            await c.enviar({"type": "error", "error": "no_permitido", "detail": f"{c.rol} no puede enviar '{tipo}'"})
            return None
        for x in destino:
            if self.retraso:
                asyncio.ensure_future(x.enviar(msg, self.retraso))
            else:
                await x.enviar(msg)
        return None


async def servir(host="127.0.0.1", port=8765, token=None, origenes=(), retraso=0, log=print):
    relay = Relay(token=token, origenes=origenes, retraso=retraso, log=log)
    servidor = await asyncio.start_server(relay.manejar, host, port)
    return relay, servidor


def main():
    ap = argparse.ArgumentParser(description="Relay WebSocket de FNF-Agent (protocolo v2)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--token", default=os.environ.get("FNF_TOKEN"), help="token fijo (si no, se genera uno nuevo)")
    ap.add_argument("--origen", action="append", default=[], help="Origin web extra permitido, p. ej. http://192.168.1.5:8000")
    ap.add_argument("--retraso", type=int, default=0, help="latencia simulada en ms por mensaje (para pruebas)")
    a = ap.parse_args()
    token = a.token or nuevo_token()
    if len(token) < 8:
        sys.exit("El token debe tener al menos 8 caracteres.")
    try:
        guardar_token(token)
        donde = f"guardado en {ARCHIVO_TOKEN}"
    except OSError:
        donde = "no pude guardarlo en archivo: pásalo a tus agentes con --token"

    async def correr():
        _, srv = await servir(a.host, a.port, token=token, origenes=a.origen, retraso=a.retraso)
        print(f"[relay] listo en ws://{a.host}:{a.port}  (Ctrl+C para salir)", flush=True)
        print(f"[relay] 🔑 token: {token}   ({donde})", flush=True)
        print("[relay]    escríbelo en el juego: Ajustes de IA externa → Token", flush=True)
        if a.host not in ("127.0.0.1", "localhost"):
            print("[relay] ⚠ escuchando fuera de este equipo: no compartas el token", flush=True)
        if a.retraso:
            print(f"[relay] ⏱ latencia simulada: {a.retraso} ms por mensaje", flush=True)
        async with srv:
            await srv.serve_forever()

    try:
        asyncio.run(correr())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
