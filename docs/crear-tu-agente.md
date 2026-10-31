# Crea tu propia IA

Necesitas solo Python 3 (sin instalar nada más). Usa el cliente incluido `agente/fnfws.py`.

```python
from agente.comun import conectar

cli = conectar("mi-ia", "ws://127.0.0.1:8765")   # manda el hello
while True:
    m = cli.recibir()            # dict (lanza ConnectionError si se cierra)
    if m["type"] == "state":
        for lane, dt in enumerate(m["lanes"]):
            if dt is not None and abs(dt) < 15 and not m["keys"][lane]:
                cli.enviar({"type": "key", "lane": lane, "down": True, "why": f"dt={dt}"})
            elif m["keys"][lane] and (m["holds"][lane] or 0) <= 0:
                cli.enviar({"type": "key", "lane": lane, "down": False})
```

Pasos:

1. `python agente/relay.py`
2. `python mi_ia.py` (desde la carpeta del proyecto)
3. En el juego: **IA externa → Jugar**.

Consejos:

- `state` llega ~cada 33 ms: para ser preciso, usa el mensaje `chart` y tu propio reloj (mira `agente/agente_chart.py`).
- Suelta las teclas: si no, los holds y las notas siguientes del mismo carril fallan.
- Con un modelo de lenguaje, la respuesta suele tardar demasiado para cada nota. Mira `agente/ejemplo_llm.py`:
  el modelo decide una *estrategia* y un bucle rápido toca las notas.

También puedes usar cualquier lenguaje con WebSocket. Los mensajes están en [protocolo.md](protocolo.md).
