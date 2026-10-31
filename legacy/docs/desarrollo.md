# Desarrollo

Probado en Termux (Android): `python3` + Pillow + Node.

```sh
bash check.sh --quick   # py_compile, node --check, tests/test_engine.py
bash check.sh           # + motor, visor, MCP (limpia al salir)
python3 tests/test_engine.py
```

`tests/test_engine.py` es el contrato:

- recuentos player/opponent (luz-de-neon easy = 44/44)
- `sides=both` → 88 jugables
- ventanas sick/good/bad/miss
- oponente nunca es `miss`
- `play_like_bot` (LEAD=40, SLACK=80) gana primer-paso y luz-de-neon player
  sin miss ni sustains rotos

Si cambias ventanas o el agente `chart`, actualiza `play_like_bot` en el
mismo cambio.

## Convenciones

- Comentarios de cabecera en español, cortos.
- Un agente = un archivo en `bot/agents/` que exporta `run`.
- Docs: números de ventanas y env vars viven en [motor.md](motor.md) y
  [.env.example](../.env.example); el resto enlaza.
- Scripts de start/stop: PID en `logs/`, `pkill` por **ruta absoluta**.

## Estructura

```
env/fnf_engine.py     motor
env/charts/           JSON v2.0.0
env/client.py         CLI del socket
bot/bot_loop.js       dispatcher
bot/lib/              cliente UNIX + parseo de charts
bot/agents/           chart.js, observe.js
mcp/fnf-mcp.js        MCP
web/                  visor
tests/test_engine.py  contrato
docs/                 este árbol
```

## Fuera de alcance (a propósito)

Sprites, audio oficial, cámara/events, RL, LLM por nota, WebSockets,
reescribir el motor en otro lenguaje.
