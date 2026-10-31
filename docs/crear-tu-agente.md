# Crea tu propia IA

Necesitas solo Python 3 o Node 22 (sin instalar nada más).

## Pasos

1. `python agente/relay.py` → copia el **token** que muestra.
2. Sirve el juego en local (`python -m http.server 8000 -d web`) y abre `http://127.0.0.1:8000`.
3. Elige **IA externa** y abre **Ajustes**. Escribe host `127.0.0.1`, puerto `8765` y el token.
4. Toca **Probar conexión**: el registro muestra el ping y cuántos agentes hay.
5. En otra sesión de Termux: `python mi_ia.py` (lee el token solo, de `~/.fnf-agent/token`).
6. **▶ Jugar**.

La demo https (GitHub Pages) no sirve para esto: el navegador bloquea `ws://127.0.0.1` desde https.

## Python (v2, recomendado)

```python
from agente.comun import conectar, RelojPing, responder_ping, caps_del_juego

ws = conectar("mi-ia", "ws://127.0.0.1:8765", v=2, caps=["at", "ping"])  # token: FNF_TOKEN o ~/.fnf-agent/token
reloj = RelojPing()
usar_at = "at" in caps_del_juego(ws.bienvenida)
ws.enviar(reloj.ping(1))
while True:
    m = ws.recibir(timeout=0.005)
    if not m:
        continue
    if m["type"] == "ping":
        responder_ping(ws, m)      # el juego mide su latencia
    elif m["type"] == "pong":
        reloj.pong(m)              # reloj.rtt y reloj.ahora() (ms de canción)
    elif m["type"] == "chart":
        notas = m["notes"]         # [{id, t, lane, l}]  t en ms de canción
        # programa cada nota: cuando reloj.ahora() >= nota["t"] - reloj.rtt / 2 - 90
        # manda {"type": "key", "lane": nota["lane"], "down": True, "at": nota["t"]}
```

El ejemplo completo está en `agente/agente_autoajuste.py`. Mide el ping, manda cada tecla antes de tiempo con `at`
y se corrige con el `offset` de cada `judgement`. Con 80 ms de latencia sigue sacando ≥95 % Sick.

## JavaScript (Node 22, sin dependencias)

```sh
node agente/agente.mjs            # --relay ws://127.0.0.1:8765 --token ... --una
```

Usa el `WebSocket` que ya trae Node 22. Mira `agente/agente.mjs` (funciones `planificar` y `RelojPing`).

## Ejemplos incluidos

| Archivo | Protocolo | Qué hace |
|---|---|---|
| `agente/agente_autoajuste.py` | v2 | Ping, teclas con `at` y autocorrección. El más preciso. |
| `agente/agente_observe.py` | v2 (v1 si el juego no tiene `at`) | Solo mira el `state` y programa lo que viene. |
| `agente/agente_chart.py` | v1 | El clásico: lee el chart y toca a tiempo. |
| `agente/agente.mjs` | v2 | Igual en JavaScript. |
| `agente/ejemplo_llm.py` | v2 | Un modelo de lenguaje decide la estrategia. La clave va en la variable `FNF_LLM_KEY` (**nunca en el repo**). Sin ella usa un modelo falso. |

## Consejos

- Usa el mensaje `chart` y tu propio reloj, no reacciones a cada `state`.
- Suelta las teclas: si no, los holds y las notas siguientes del mismo carril fallan.
- Un modelo de lenguaje tarda demasiado para cada nota: que decida la *estrategia* y que un bucle rápido toque.

Mensajes exactos: [protocolo-v2.md](protocolo-v2.md) (y la [v1](protocolo.md)).
