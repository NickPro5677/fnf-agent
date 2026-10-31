#!/usr/bin/env python3
"""Relay de FNF-Agent: une el juego (navegador) con las IAs (agentes).

    python agente/relay.py              # escucha en ws://127.0.0.1:8765
    python agente/relay.py --host 0.0.0.0 --port 8765   # para la red local (cuidado)

Reglas sencillas:
- Cada cliente se presenta con {"type":"hello","role":"game"|"agent","name":"..."}.
- Lo que manda el juego (chart, state, judgement, result) llega a todos los agentes.
- Lo que manda un agente (key, think) llega a todos los juegos.
- El relay avisa a todos cuántos hay con {"type":"peers",...}.
Solo librería estándar. Ver docs/protocolo.md.
"""
import argparse
import asyncio
import json
import sys

try:
    from fnfws import CERRAR, MAX_MENSAJE, PING, PONG, TEXTO, armar_frame, clave_aceptar
except ImportError:  # importado como paquete (tests)
    from .fnfws import CERRAR, MAX_MENSAJE, PING, PONG, TEXTO, armar_frame, clave_aceptar

DEL_JUEGO = {"chart", "state", "judgement", "result"}
DEL_AGENTE = {"key", "think"}


class Cliente:
    def __init__(self, writer):
        self.writer = writer
        self.rol = None
        self.nombre = "?"

    async def enviar(self, obj):
        try:
            self.writer.write(armar_frame(TEXTO, json.dumps(obj, separators=(",", ":")).encode()))
            await self.writer.drain()
        except (ConnectionError, RuntimeError):
            pass


class Relay:
    def __init__(self, log=print):
        self.clientes = set()
        self.log = log

    def resumen(self):
        agentes = [c.nombre for c in self.clientes if c.rol == "agent"]
        juegos = sum(1 for c in self.clientes if c.rol == "game")
        return {"games": juegos, "agents": len(agentes), "names": agentes}

    async def avisar(self, tipo="peers", solo=None):
        msg = {"type": tipo, **self.resumen()}
        for c in list(solo and [solo] or self.clientes):
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
        if h.get("upgrade", "").lower() != "websocket" or "sec-websocket-key" not in h:
            cuerpo = json.dumps({"ok": True, "relay": "fnf-agent", **self.resumen()}).encode()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n"
                         + f"Content-Length: {len(cuerpo)}\r\nConnection: close\r\n\r\n".encode() + cuerpo)
            await writer.drain()
            writer.close()
            return
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {clave_aceptar(h['sec-websocket-key'])}\r\n\r\n").encode())
        await writer.drain()
        c = Cliente(writer)
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
            await self._mensaje(c, msg)

    async def _mensaje(self, c, msg):
        tipo = msg.get("type")
        if tipo == "hello":
            rol = msg.get("role")
            if rol not in ("game", "agent"):
                await c.enviar({"type": "error", "error": "role_invalido"})
                return
            c.rol, c.nombre = rol, str(msg.get("name") or rol)[:40]
            self.log(f"[relay] entra {c.rol} '{c.nombre}'")
            await self.avisar("welcome", solo=c)
            await self.avisar()
            return
        if c.rol == "game" and tipo in DEL_JUEGO:
            destino = [x for x in self.clientes if x.rol == "agent"]
        elif c.rol == "agent" and tipo in DEL_AGENTE:
            msg["from"] = c.nombre
            destino = [x for x in self.clientes if x.rol == "game"]
        else:
            await c.enviar({"type": "error", "error": "no_permitido", "detail": f"{c.rol} no puede enviar '{tipo}'"})
            return
        for x in destino:
            await x.enviar(msg)


async def servir(host="127.0.0.1", port=8765, log=print):
    relay = Relay(log=log)
    servidor = await asyncio.start_server(relay.manejar, host, port)
    return relay, servidor


def main():
    ap = argparse.ArgumentParser(description="Relay WebSocket de FNF-Agent")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()

    async def correr():
        _, srv = await servir(a.host, a.port)
        print(f"[relay] listo en ws://{a.host}:{a.port}  (Ctrl+C para salir)", flush=True)
        if a.host not in ("127.0.0.1", "localhost"):
            print("[relay] ⚠ escuchando fuera de este equipo: cualquiera en tu red puede conectarse", flush=True)
        async with srv:
            await srv.serve_forever()

    try:
        asyncio.run(correr())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
