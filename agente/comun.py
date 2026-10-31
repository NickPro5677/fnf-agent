"""Piezas compartidas por los agentes: token, reloj de la canción y conexión al relay."""
import os
import time

try:
    from fnfws import ClienteWS
except ImportError:
    from .fnfws import ClienteWS

CARRILES = ["left", "down", "up", "right"]
FLECHAS = ["←", "↓", "↑", "→"]
URL_POR_DEFECTO = os.environ.get("FNF_RELAY", "ws://127.0.0.1:8765")
ARCHIVO_TOKEN = os.path.join(os.path.expanduser("~"), ".fnf-agent", "token")


class ErrorToken(ConnectionError):
    pass


def leer_token(dado=None):
    """Token del relay: --token, si no la variable FNF_TOKEN, si no el archivo que deja el relay."""
    if dado:
        return dado
    if os.environ.get("FNF_TOKEN"):
        return os.environ["FNF_TOKEN"]
    try:
        with open(ARCHIVO_TOKEN) as f:
            return f.read().strip() or None
    except OSError:
        return None


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


class RelojPing:
    """Reloj v2: usa ping/pong con el juego para medir la latencia y sincronizar el tiempo de la canción.

    En cada pong: rtt = ahora − enviado; tiempo de la canción ≈ pong.t + rtt/2.
    Se queda con las muestras de menor rtt (las más fiables).
    """

    def __init__(self, ahora=time.monotonic):
        self._ahora = ahora
        self.muestras = []  # (rtt, desfase)
        self.rtt = None
        self.desfase = None

    def reiniciar(self):
        self.muestras, self.rtt, self.desfase = [], None, None

    def ping(self, n):
        return {"type": "ping", "id": n, "sent": self._ahora() * 1000}

    def pong(self, msg):
        if msg.get("t") is None or msg.get("sent") is None:
            return
        ahora = self._ahora() * 1000
        rtt = ahora - msg["sent"]
        self.muestras = sorted(self.muestras + [(rtt, msg["t"] + rtt / 2 - ahora)])[:5]
        self.rtt = self.muestras[0][0]
        self.desfase = sum(d for _, d in self.muestras) / len(self.muestras)

    def ver(self, t_cancion):
        """Sin pongs todavía: estimación a partir del state (como v1)."""
        if not self.muestras:
            d = t_cancion - self._ahora() * 1000
            if self.desfase is None or d > self.desfase or d < self.desfase - 250:
                self.desfase = d

    def ahora(self):
        return None if self.desfase is None else self._ahora() * 1000 + self.desfase


def conectar(nombre, url=URL_POR_DEFECTO, token=None, v=1, caps=(), rol="agent"):
    """Conecta al relay, se presenta con el token y espera el welcome. Devuelve el ClienteWS.

    v=1 manda el saludo de siempre (más el token); v=2 anuncia "v":2 y sus capacidades.
    """
    token = leer_token(token)
    if not token:
        raise ErrorToken("Falta el token. Arranca python agente/relay.py (lo muestra) y pásalo con --token o FNF_TOKEN.")
    ws = ClienteWS(url)
    hola = {"type": "hello", "role": rol, "name": nombre, "token": token}
    if v == 2:
        hola.update({"v": 2, "caps": list(caps)})
    ws.enviar(hola)
    fin = time.monotonic() + 5
    while time.monotonic() < fin:
        m = ws.recibir(timeout=0.5)
        if not m:
            continue
        if m.get("type") == "welcome":
            ws.bienvenida = m
            return ws
        if m.get("type") == "error":
            ws.cerrar()
            raise ErrorToken(f"El relay dijo: {m.get('error')}. {m.get('detail', '')}".strip())
    ws.cerrar()
    raise ConnectionError("El relay no contestó al saludo.")


def responder_ping(ws, msg):
    """v2: el juego manda ping para medir la latencia; hay que devolver pong con el mismo id."""
    ws.enviar({"type": "pong", "id": msg.get("id"), "sent": msg.get("sent"), "to_id": msg.get("from_id")})


def caps_del_juego(msg):
    """Capacidades que anunció el juego (en welcome/peers del relay v2). [] si es un juego v1."""
    return list((msg.get("game") or {}).get("caps") or [])


def argumentos_comunes(ap):
    ap.add_argument("--relay", default=URL_POR_DEFECTO, help="dirección del relay (o variable FNF_RELAY)")
    ap.add_argument("--token", default=None, help="token del relay (si no: FNF_TOKEN o ~/.fnf-agent/token)")
    ap.add_argument("--una", action="store_true", help="salir después de una canción")
    return ap
