# Visor

HTTP en `FNF_WEB_HOST:FNF_WEB_PORT` (default `127.0.0.1:8787`).

`start_all.sh` / `web/start_web.sh` lo levantan. LAN:

```sh
FNF_WEB_HOST=0.0.0.0 FNF_WEB_TOKEN=secreto bash web/start_web.sh
```

Sin token y bind público, el log avisa: cualquiera en la red puede
arrancar/parar procesos.

## Rutas

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/` | no | HTML |
| GET | `/frame` | no | PNG |
| GET | `/api/status` | no | motor + services + `auth` + `bind` |
| GET | `/api/services` | no | PIDs / online |
| GET | `/api/charts` | no | lista con counts player/opponent |
| GET | `/healthz` | no | `ok` |
| POST | `/api/engine/start\|stop` | token si hay | scripts del motor |
| POST | `/api/agent/start\|stop` | token | body `{song,diff,sides,agent,scale}` |
| POST | `/api/game/start` | token | demo sin agente `{song,diff,scale,sides}` |
| POST | `/api/input` | token | `{key, down}` pad / teclado |

Si `FNF_WEB_TOKEN` está definido, los POST exigen `X-Fnf-Token`.
Los GET quedan abiertos (ver, no tocar). El token se guarda en
`localStorage` desde el card del visor.

CORS `*` solo en GET. Los POST no mandan `Access-Control-Allow-Origin: *`.

`services.engine` es true solo si el socket **responde** a `status`, no si
existe el fichero huérfano.

## UI

- HUD: score, combo, accuracy, health, sick/good/bad/miss.
- Selectores: canción, dificultad, sides, agente, scale.
- Pad táctil + flechas del teclado → `/api/input`.
- El engine pill refleja un motor vivo.

El poll es `/frame` cada 100 ms y `/api/status` cada 500 ms.
