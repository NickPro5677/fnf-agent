"""Piezas compartidas por los agentes: reloj de la canción y conexión al relay."""
import os
import time

try:
    from fnfws import ClienteWS
except ImportError:
    from .fnfws import ClienteWS

CARRILES = ["left", "down", "up", "right"]
FLECHAS = ["←", "↓", "↑", "→"]
URL_POR_DEFECTO = os.environ.get("FNF_RELAY", "ws://127.0.0.1:8765")


class Reloj:
    """Estima el tiempo de la canción (ms) a partir de los mensajes "state".

    El "state" llega con un poquito de retraso, así que nos quedamos con la
    estimación más adelantada (la que tuvo menos retraso).
    """

    def __init__(self, ahora=time.monotonic):
        self._ahora = ahora
        self.desfase = None

    def reiniciar(self):
        self.desfase = None

    def ver(self, t_cancion):
        d = t_cancion - self._ahora() * 1000
        if self.desfase is None or d > self.desfase or d < self.desfase - 250:
            self.desfase = d  # 250 ms atrás = el juego se reinició o se pausó

    def ahora(self):
        return None if self.desfase is None else self._ahora() * 1000 + self.desfase


def conectar(nombre, url=URL_POR_DEFECTO):
    ws = ClienteWS(url)
    ws.enviar({"type": "hello", "role": "agent", "name": nombre})
    return ws
