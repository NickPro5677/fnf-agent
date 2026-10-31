import asyncio
import os
import socket
import sys
import threading

import pytest

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(RAIZ, "agente"))

import relay as relay_mod  # noqa: E402


def puerto_libre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture
def relay():
    """Arranca un relay real en un hilo y devuelve su URL ws://."""
    puerto = puerto_libre()
    loop = asyncio.new_event_loop()
    listo = threading.Event()
    estado = {}

    def correr():
        asyncio.set_event_loop(loop)
        r, srv = loop.run_until_complete(relay_mod.servir("127.0.0.1", puerto, log=lambda *_: None))
        estado["relay"], estado["srv"] = r, srv
        listo.set()
        loop.run_forever()

    hilo = threading.Thread(target=correr, daemon=True)
    hilo.start()
    listo.wait(5)
    yield f"ws://127.0.0.1:{puerto}"
    async def parar():
        estado["srv"].close()
        for c in list(estado["relay"].clientes):
            c.writer.close()
        await asyncio.sleep(0.05)
        loop.stop()
    asyncio.run_coroutine_threadsafe(parar(), loop)
    hilo.join(2)
