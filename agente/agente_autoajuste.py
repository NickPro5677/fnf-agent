#!/usr/bin/env python3
"""Agente "autoajuste" (protocolo v2): mide la latencia con ping/pong, sincroniza su reloj con el
de la canción y manda cada tecla POR ADELANTADO con "at" (el instante exacto en que debe contar).
Con cada juicio corrige su error medio, así que se ajusta solo aunque la red vaya lenta.

    python agente/relay.py &
    python agente/agente_autoajuste.py          # el token lo lee de ~/.fnf-agent/token
"""
import argparse
import sys
import time

try:
    from agente_chart import planificar
    from comun import FLECHAS, RelojPing, argumentos_comunes, caps_del_juego, conectar, responder_ping
except ImportError:
    from .agente_chart import planificar
    from .comun import FLECHAS, RelojPing, argumentos_comunes, caps_del_juego, conectar, responder_ping

MARGEN_MS = 90        # cuánto antes de lo necesario sale cada tecla
MAX_CORRECCION = 60   # ms


class Autoajuste:
    """La lógica, sin red: se puede probar sola."""

    def __init__(self, ahora=time.monotonic):
        self.reloj = RelojPing(ahora)
        self.ahora_s = ahora
        self.plan, self.i = [], 0
        self.correccion = 0.0
        self.usa_at = True
        self.n_ping = 0
        self.ultimo_ping = -1e9

    def nuevo_chart(self, notas):
        self.plan, self.i = planificar(notas), 0
        self.reloj.reiniciar()
        self.ultimo_ping = -1e9

    def juicio(self, offset):
        """offset + = tarde. Corrige poco a poco hacia 0."""
        if offset is None:
            return
        self.correccion = max(-MAX_CORRECCION, min(MAX_CORRECCION, self.correccion - 0.35 * offset))

    def pings_pendientes(self):
        """Muchos pings al principio (para sincronizar rápido) y luego uno por segundo."""
        ahora = self.ahora_s() * 1000
        cada = 100 if len(self.reloj.muestras) < 5 else 1000
        if ahora - self.ultimo_ping >= cada:
            self.ultimo_ping = ahora
            self.n_ping += 1
            return [self.reloj.ping(self.n_ping)]
        return []

    def teclas_pendientes(self):
        """Teclas que ya toca mandar: [(mensaje)]."""
        t = self.reloj.ahora()
        if t is None:
            return []
        ida = (self.reloj.rtt / 2) if self.reloj.rtt is not None else 100
        adelanto = ida + MARGEN_MS if self.usa_at else ida
        salen = []
        while self.i < len(self.plan) and self.plan[self.i][0] - adelanto <= t:
            ta, lane, down, motivo = self.plan[self.i]
            m = {"type": "key", "lane": lane, "down": down}
            if self.usa_at:
                m["at"] = round(ta + self.correccion, 1)
            if down:
                m["why"] = f"{FLECHAS[lane]} {motivo}"
            salen.append(m)
            self.i += 1
        return salen


def jugar(ws, una=False, log=print):
    a = Autoajuste()
    a.usa_at = "at" in caps_del_juego(getattr(ws, "bienvenida", {}) or {})
    jugando = False
    while True:
        msg = ws.recibir(timeout=0.002)
        if msg:
            tipo = msg.get("type")
            if tipo in ("welcome", "peers"):
                a.usa_at = "at" in caps_del_juego(msg)
            elif tipo == "chart":
                a.nuevo_chart(msg["notes"])
                jugando = True
                log(f"[autoajuste] '{msg.get('song')}': {len(msg['notes'])} notas · {'con at' if a.usa_at else 'sin at (juego v1)'}")
            elif tipo == "state":
                a.reloj.ver(msg["t"])
            elif tipo == "pong":
                a.reloj.pong(msg)
                if len(a.reloj.muestras) == 5 and a.reloj.rtt is not None:
                    ws.enviar({"type": "think", "text": f"Latencia {a.reloj.rtt:.0f} ms ida y vuelta: mando cada tecla {a.reloj.rtt / 2 + MARGEN_MS:.0f} ms antes"})
            elif tipo == "ping":
                responder_ping(ws, msg)
            elif tipo == "judgement":
                antes = round(a.correccion)
                a.juicio(msg.get("offset") if msg.get("kind") != "miss" else None)
                if abs(round(a.correccion) - antes) >= 5:
                    ws.enviar({"type": "think", "text": f"Me ajusto: corrijo {a.correccion:+.0f} ms"})
            elif tipo == "result":
                rtt = f"{a.reloj.rtt:.0f} ms" if a.reloj.rtt is not None else "?"
                log(f"[autoajuste] resultado: {msg.get('resultado')} · precisión {msg.get('precision', 0) * 100:.1f} % · "
                    f"sick {msg.get('juicios', {}).get('sick')} · latencia {rtt} · corrección {a.correccion:+.0f} ms")
                jugando = False
                a.plan, a.i = [], 0
                if una:
                    return msg
        if jugando and a.usa_at:
            for p in a.pings_pendientes():
                ws.enviar(p)
        for m in a.teclas_pendientes():
            ws.enviar(m)


def main():
    ap = argumentos_comunes(argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter))
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    try:
        ws = conectar("autoajuste (Python)", a.relay, token=a.token, v=2, caps=["at", "ping"])
    except OSError as e:
        sys.exit(f"No pude conectar a {a.relay}: {e}")
    print(f"[autoajuste] conectado a {a.relay} (v2). Elige 'IA externa' en el juego y pulsa Jugar.")
    try:
        jugar(ws, una=a.una)
    except (KeyboardInterrupt, ConnectionError):
        pass


if __name__ == "__main__":
    main()
