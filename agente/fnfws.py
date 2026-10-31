"""WebSocket mínimo (RFC 6455) solo con la librería estándar de Python.

Lo usan el relay (servidor) y los agentes (cliente). Así en Termux no hace
falta instalar nada: solo `pkg install python`.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import time
from urllib.parse import urlparse

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_MENSAJE = 256 * 1024
TEXTO, CERRAR, PING, PONG = 0x1, 0x8, 0x9, 0xA


def clave_aceptar(clave):
    return base64.b64encode(hashlib.sha1((clave + GUID).encode()).digest()).decode()


def armar_frame(opcode, datos, enmascarar=False):
    """Convierte bytes en un frame WebSocket."""
    cab = bytes([0x80 | opcode])
    n = len(datos)
    bit = 0x80 if enmascarar else 0
    if n < 126:
        cab += bytes([bit | n])
    elif n < 65536:
        cab += bytes([bit | 126]) + struct.pack(">H", n)
    else:
        cab += bytes([bit | 127]) + struct.pack(">Q", n)
    if enmascarar:
        m = os.urandom(4)
        datos = bytes(b ^ m[i % 4] for i, b in enumerate(datos))
        cab += m
    return cab + datos


def leer_frame_desde(leer):
    """Lee un frame usando `leer(n)` (que devuelve exactamente n bytes). Devuelve (opcode, datos)."""
    b1, b2 = leer(2)
    opcode = b1 & 0x0F
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack(">H", leer(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", leer(8))[0]
    if n > MAX_MENSAJE:
        raise ValueError("mensaje demasiado grande")
    mascara = leer(4) if b2 & 0x80 else None
    datos = leer(n) if n else b""
    if mascara:
        datos = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
    return opcode, datos


class ClienteWS:
    """Cliente WebSocket bloqueante muy simple. Ejemplo:

        ws = ClienteWS("ws://127.0.0.1:8765")
        ws.enviar({"type": "hello", "role": "agent", "name": "yo"})
        msg = ws.recibir(timeout=0.01)   # dict o None
    """

    def __init__(self, url, timeout=5, cabeceras=None):
        u = urlparse(url)
        if u.scheme != "ws":
            raise ValueError("solo ws:// (sin TLS)")
        self.sock = socket.create_connection((u.hostname, u.port or 80), timeout=timeout)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        clave = base64.b64encode(os.urandom(16)).decode()
        ruta = (u.path or "/") + (f"?{u.query}" if u.query else "")
        pedido = (
            f"GET {ruta} HTTP/1.1\r\nHost: {u.hostname}:{u.port or 80}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {clave}\r\nSec-WebSocket-Version: 13\r\n"
            + "".join(f"{k}: {v}\r\n" for k, v in (cabeceras or {}).items()) + "\r\n"
        )
        self.sock.sendall(pedido.encode())
        cab = b""
        while b"\r\n\r\n" not in cab:
            trozo = self.sock.recv(1024)
            if not trozo:
                raise ConnectionError("el relay cerró la conexión")
            cab += trozo
        cabecera, self.buf = cab.split(b"\r\n\r\n", 1)
        if b" 101 " not in cabecera.split(b"\r\n")[0] or clave_aceptar(clave).encode() not in cabecera:
            linea = cabecera.split(b"\r\n")[0].decode(errors="replace")
            raise ConnectionError(f"el servidor no aceptó WebSocket ({linea})")
        self.sock.settimeout(None)
        self.abierto = True

    def enviar(self, obj):
        texto = obj if isinstance(obj, str) else json.dumps(obj, separators=(",", ":"))
        self.sock.sendall(armar_frame(TEXTO, texto.encode(), enmascarar=True))

    def _sacar_frame(self):
        """Saca un frame completo del buffer, o None si todavía falta llegar algo."""
        pos = [0]

        def leer(n):
            if pos[0] + n > len(self.buf):
                raise BlockingIOError
            d = self.buf[pos[0]:pos[0] + n]
            pos[0] += n
            return d

        try:
            r = leer_frame_desde(leer)
        except BlockingIOError:
            return None
        self.buf = self.buf[pos[0]:]
        return r

    def recibir(self, timeout=None):
        """Devuelve el siguiente mensaje JSON (dict), o None si pasa `timeout` segundos."""
        fin = None if timeout is None else time.monotonic() + timeout
        while True:
            frame = self._sacar_frame()
            if frame is None:
                resta = None if fin is None else fin - time.monotonic()
                if resta is not None and resta <= 0:
                    return None
                self.sock.settimeout(resta)
                try:
                    trozo = self.sock.recv(65536)
                except (socket.timeout, BlockingIOError):
                    return None
                finally:
                    self.sock.settimeout(None)
                if not trozo:
                    self.abierto = False
                    raise ConnectionError("conexión cerrada")
                self.buf += trozo
                continue
            op, datos = frame
            if op == TEXTO:
                try:
                    return json.loads(datos.decode())
                except ValueError:
                    continue
            if op == PING:
                self.sock.sendall(armar_frame(PONG, datos, enmascarar=True))
            if op == CERRAR:
                self.abierto = False
                raise ConnectionError("el relay cerró la conexión")

    def cerrar(self):
        try:
            self.sock.sendall(armar_frame(CERRAR, b"", enmascarar=True))
        except OSError:
            pass
        self.sock.close()
        self.abierto = False
