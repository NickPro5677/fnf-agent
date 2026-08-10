# FNF-Agent — un agente que juega Friday Night Funkin' en Termux

Agente **100% local** para Android (probado en Termux):

- **Motor FNF en Python** (PIL) renderiza la highway, carga charts oficiales
  (formato v2.0.0), simula gameplay y recibe teclas por socket UNIX.
- **MCP** (Node) conecta el bot con el motor.
- **Bot de reglas** (`bot_loop.js`): lee el chart oficial (su memoria) y pulsa
  cada nota en su ventana usando el reloj del motor (`observe`). Determinista,
  rápido y sin dependencias: **no hay LLM, no hay comunicación con Ollama**.
- **Visor web** en el móvil (o en la misma Wi‑Fi) para ver jugar al agente en vivo.

## Arquitectura

```
bot/bot_loop.js          → bucle del agente (autoplayer de reglas + cliente MCP)
mcp/fnf-mcp.js           → servidor MCP (tools para jugar)
env/fnf_engine.py        → motor (simula + renderiza + socket UNIX)
env/charts/*.json        → tutorial, bopeebo, test
web/server.py + index.html → visor HTTP + controles
start_all.sh / stop_all.sh → arranque / parada del stack
```

```
  ┌─────────────┐  socket   ┌────────────┐  stdio   ┌──────────────┐
  │ fnf_engine  │◄─────────►│  fnf-mcp   │◄────────►│ bot_loop.js  │
  │  (python)   │           │  (node)    │          │ (reglas)     │
  └──────┬──────┘           └─────┬──────┘          └──────────────┘
         │ latest.png             │ observe (song_time / estado)
         ▼                        ▼
  ┌─────────────┐
  │  web visor  │
  │  :8787      │
  └─────────────┘
```

## Requisitos

| Paquete | Para qué |
|---------|----------|
| `python3` + `python-pillow` | motor + visor |
| `nodejs` | bot + MCP |

```sh
pkg update
pkg install python python-pillow nodejs
```

## Instalación (una vez)

```sh
cd ~/fnf-agent
npm install
```

## Cómo ejecutar

### Arrancar todo

```bash
cd ~/fnf-agent
bash start_all.sh
```

Eso levanta:

1. **Motor FNF**
2. **Visor web** en el puerto `8787`

### Abrir el visor

En el mismo móvil (navegador o WebView):

```
http://127.0.0.1:8787
```

Desde otro dispositivo en la misma Wi‑Fi (la IP la imprime `start_all.sh` /
`web/start_web.sh`):

```
http://<IP-del-móvil>:8787
```

En el visor:

1. Comprueba que **engine** esté en verde.
2. Elige canción (`tutorial` o `bopeebo`; `test` es la más corta).
3. Pulsa **▶ Jugar (agente)**.
4. Mira el frame en vivo, score, combo y health.

### Parar

```bash
bash stop_all.sh
```

## Alternativa solo por terminal

```bash
# Sesión 1 — motor
bash env/start_engine.sh

# Sesión 2 — visor (opcional)
bash web/start_web.sh

# Sesión 3 — agente (en primer plano)
FNF_SONG=test node bot/bot_loop.js
# o en background:
FNF_SONG=test bash bot/start_agent.sh
```

Logs:

| Componente | Archivo |
|------------|---------|
| Motor | `logs/engine.log` |
| Agente | `logs/agent.log` |
| Visor | `logs/web.log` |

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `FNF_SONG` | `tutorial` | `tutorial`, `bopeebo`, `test` |
| `FNF_DIFF` | `0` | `0` easy · `1` normal · `2` hard |
| `FNF_SCALE` | auto | factor de tiempo (más bajo = más lento); auto ≈ 0.5–0.7 |
| `FNF_WEB_PORT` | `8787` | puerto del visor |
| `FNF_WEB_HOST` | `0.0.0.0` | bind del visor |
| `FNF_WEB_TOKEN` | *(vacío)* | si se define, las rutas `POST` del visor exigen `X-Fnf-Token` |

```bash
FNF_SONG=bopeebo FNF_DIFF=1 bash bot/start_agent.sh
FNF_WEB_TOKEN=secreto123 bash web/start_web.sh   # protege los controles
FNF_WEB_PORT=8080 bash web/start_web.sh
```

## Cómo juega el bot (sin trampas, sin LLM)

El bot **no adivina**: tiene el chart oficial en memoria (es su "memoria" de la
canción) y sincroniza la pulsación con el reloj real del motor (`observe` →
`song_time_ms`). Pulsa en su ventana, mantiene los sustains hasta `t + l` y deja
que el motor valide cada golpe con sus ventanas de hit/miss (tardío = miss →
pierde health y combo). No hay LLM que decida; la decisión es exacta.

## Herramientas MCP

| Tool | Descripción |
|------|-------------|
| `observe` | estado + distancias por carril (ms) desde el motor |
| `input.press` | pulsa una tecla `left|down|up|right` durante `duration_ms` |
| `input.key` | suelta/mantiene una tecla (`down: true|false`) — control fino de sustains |
| `game.start` | inicia sesión (`song`, `diff`, `scale`) |
| `game.status` | estado del motor |
| `song.chart` | notas del chart oficial `[t_ms, carril, sustain_ms]` |

```bash
# Motor debe estar arriba
bash env/start_engine.sh
node mcp/test-client.mjs
```

## API del visor

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/` | HTML del visor |
| GET | `/frame` | PNG del último frame |
| GET | `/api/status` | estado motor + servicios + `auth` |
| GET | `/api/services` | engine/agent online |
| GET | `/api/charts` | lista de charts descubiertos (`name`, `diffs`, `scroll`) |
| POST | `/api/engine/start\|stop` | arranca/para motor |
| POST | `/api/agent/start\|stop` | arranca/para bot (`{song,diff}`; para el anterior antes de lanzar) |
| POST | `/api/game/start` | demo sin IA (`{song,diff,scale}`) |
| GET | `/healthz` | healthcheck |

> Si `FNF_WEB_TOKEN` está definido, los `POST` requieren cabecera
> `X-Fnf-Token`; los GET quedan siempre abiertos (ver juego, no tocar).

## Desarrollo y tests

```bash
bash check.sh         # sintaxis + tests + motor + visor + MCP (limpia al salir)
bash check.sh --quick # solo sintaxis + tests (sin procesos)
python3 tests/test_engine.py   # unit tests del motor
```

`tests/test_engine.py` incluye un **test de regresión del patrón del bot**
(play_like_bot): juega `tutorial` y `bopeebo` como lo hace el bot real y exige
WIN sin sustains rotos. Cambios en el motor o en el bot deben pasar este test.

## Solución de problemas

| Problema | Solución |
|----------|----------|
| Motor offline en el visor | `bash env/start_engine.sh` |
| Socket ocupado / stale | `bash env/stop_engine.sh` y vuelve a arrancar |
| Frame negro / 404 | el motor no está renderizando; revisa `logs/engine.log` |
| Agente no pulsa | mira `logs/agent.log` |
| No entra desde otro dispositivo | misma Wi‑Fi, firewall/AP isolation; prueba `http://IP:8787` |
| `chart no existe` | usa `tutorial`, `bopeebo` o `test` |

## Notas

- El visor es **solo control local**; si lo expones a la LAN define
  `FNF_WEB_TOKEN` para bloquear los `POST` de control (los GET de video
  quedan abiertos). No lo expongas a Internet.
- Versiones con LLM (Ollama) se eliminaron en v2: eran lentas (~10 s/decisión),
  no respondían el prompt y torpedeaban el ritmo. Si quieres un "cerebro" real,
  ese es un trabajo aparte; este repo es el entorno + autoplayer perfecto.