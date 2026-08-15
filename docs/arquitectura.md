# Arquitectura

FNF-Agent 3.0 es un stack de tres procesos locales más un servidor MCP opcional.

```
                    ┌─────────────────────────────────────┐
                    │  web/server.py  +  web/index.html   │
                    │  control, frame, pad, HUD           │
                    └──────────────┬──────────────────────┘
                                   │ UNIX JSON
┌──────────────┐   UNIX JSON    ┌──▼──────────────┐
│ bot/agents/* │───────────────►│ env/fnf_engine  │──► env/render/latest.png
│ chart|observe│                │ + env/charts    │
└──────▲───────┘                └────────┬────────┘
       │ bot/lib/engine.js               │
┌──────┴───────┐                         │
│ mcp/fnf-mcp  │◄── stdio (clientes)     │
└──────────────┘
```

## Procesos

| Proceso | Cómo arranca | Rol |
|---|---|---|
| Motor | `env/start_engine.sh` | Reloj, física, render, socket |
| Visor | `web/start_web.sh` | HTTP, control, frame |
| Agente | `bot/start_agent.sh` o `node bot/bot_loop.js` | Una canción y sale |
| MCP | `node mcp/fnf-mcp.js` | Solo si un cliente externo lo pide |

`start_all.sh` levanta motor + visor. El agente se lanza desde el visor o a mano.

## IPC

Un único contrato JSON por línea en el socket UNIX (`env/run/engine.sock`,
override `FNF_SOCK`):

```json
{"cmd":"start","song":"tutorial","diff":0,"scale":0.6,"sides":"player"}
{"cmd":"key","key":"left","down":true}
{"cmd":"status"}
{"cmd":"list"}
{"cmd":"quit"}
```

Respuestas: un objeto JSON + `\n`. Detalle de `status` en [motor.md](motor.md).

El cliente JS compartido es `bot/lib/engine.js`. Lo usan los agentes y el MCP.
El visor y `env/client.py` implementan el mismo protocolo en Python.

## Por qué MCP es opcional

En v2 el bot hablaba MCP por stdio y el MCP hablaba al motor. En Termux eso
añadía un proceso y una ida/vuelta por cada `observe`/`key`. El bot 3.0 llama
al socket. MCP se queda para Claude u otros clientes que ya hablan el
protocolo; ver [mcp.md](mcp.md).

## Reloj

El motor avanza a `FNF_FPS` (default 15). `game_time` solo corre tras 2 s de
countdown, multiplicado por `scale`. El agente sincroniza con
`song_time_ms`, no con su reloj de pared (salvo el *release* de teclas del
agente `chart`, que convierte ms de canción a pared dividiendo por `scale`).
