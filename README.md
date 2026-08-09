# FNF-Agent — IA que juega Friday Night Funkin' en Termux

Agente **100% local** para Android (probado en Redmi Note 11 + Termux):

- **Ollama** (`fnf-agent` sobre `llama3.2:1b`) decide qué tecla pulsar.
- **MCP** conecta el cerebro con el motor del juego.
- **Motor FNF en Python** (PIL) renderiza la highway, carga charts oficiales
  (formato v2.0.0) y recibe teclas por socket UNIX.
- **Percepción simbólica** lee `env/render/latest.png` y mide distancias por carril.
- **Visor web** en el móvil (o en la misma Wi‑Fi) para ver jugar al agente en vivo.

## Arquitectura

```
bot/bot_loop.js          → bucle del agente (Ollama + cliente MCP)
mcp/fnf-mcp.js           → servidor MCP (tools para jugar)
perception/perceive.py   → frame → distancias por carril
env/fnf_engine.py        → motor (simula + renderiza + socket UNIX)
env/charts/*.json        → tutorial, bopeebo, test
web/server.py + index.html → visor HTTP + controles
model/Modelfile          → modelo Ollama "fnf-agent"
start_all.sh / stop_all.sh → arranque / parada del stack
```

```
  ┌─────────────┐  socket   ┌────────────┐  stdio   ┌──────────────┐
  │ fnf_engine  │◄─────────►│  fnf-mcp   │◄────────►│ bot_loop.js  │
  │  (python)   │           │  (node)    │          │ + Ollama     │
  └──────┬──────┘           └─────┬──────┘          └──────────────┘
         │ latest.png             │ observe
         ▼                        ▼
  ┌─────────────┐          perception/
  │  web visor  │          perceive.py
  │  :8787      │
  └─────────────┘
```

## Requisitos

| Paquete | Para qué |
|---------|----------|
| `python3` + `python-pillow` | motor + percepción + visor |
| `nodejs` | bot + MCP |
| `ollama` | modelo local |
| ~2 GB RAM libres | inferencia en el teléfono |

```sh
pkg update
pkg install python python-pillow nodejs ollama
```

## Instalación (una vez)

```sh
cd ~/fnf-agent
npm install

# Ollama debe estar corriendo para pull/create
ollama serve &          # o en otra sesión de Termux
ollama pull llama3.2:1b-instruct-q4_K_M
ollama create fnf-agent -f model/Modelfile
ollama list             # debe listar fnf-agent
```

Prueba rápida del modelo (debe contestar algo con `right`):

```bash
curl -s http://127.0.0.1:11434/api/generate \
  -d '{"model":"fnf-agent","prompt":"Objetivo = right. Contesta solo el nombre del objetivo.","stream":false,"num_predict":4}'
```

## Cómo ejecutar (recomendado)

### 1) Arrancar todo

```bash
cd ~/fnf-agent
bash start_all.sh
```

Eso levanta:

1. **Ollama** (si no estaba)
2. **Motor FNF**
3. **Visor web** en el puerto `8787`

### 2) Abrir el visor

En el mismo móvil (navegador o Termux:API / WebView):

```
http://127.0.0.1:8787
```

Desde otro dispositivo en la misma Wi‑Fi (la IP la imprime `start_all.sh` /
`web/start_web.sh`):

```
http://<IP-del-Redmi>:8787
```

En el visor:

1. Comprueba que **engine** y **ollama** estén en verde.
2. Elige canción (`test` es la más corta, ideal para probar).
3. Pulsa **▶ Jugar (agente)**.
4. Mira el frame en vivo, score, combo y health.

### 3) Parar

```bash
bash stop_all.sh                 # agente + motor + web (Ollama sigue)
STOP_OLLAMA=1 bash stop_all.sh   # también apaga Ollama
```

## Alternativa solo por terminal

```bash
# Terminal / sesión 1
ollama serve

# Sesión 2 — motor
bash env/start_engine.sh

# Sesión 3 — visor (opcional)
bash web/start_web.sh

# Sesión 4 — agente
FNF_SONG=test FNF_DIFF=0 bash bot/start_agent.sh
# o en primer plano:
FNF_SONG=test node bot/bot_loop.js
```

Logs:

| Componente | Archivo |
|------------|---------|
| Motor | `logs/engine.log` |
| Agente | `logs/agent.log` |
| Visor | `logs/web.log` |
| Ollama | `logs/ollama.log` |

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `FNF_SONG` | `tutorial` | `tutorial`, `bopeebo`, `test` |
| `FNF_DIFF` | `0` | `0` easy · `1` normal · `2` hard |
| `FNF_MODEL` | `fnf-agent` | modelo Ollama |
| `FNF_WEB_PORT` | `8787` | puerto del visor |
| `FNF_WEB_HOST` | `0.0.0.0` | bind del visor |
| `OLLAMA_HOST` | `127.0.0.1:11434` | API de Ollama |

```bash
FNF_SONG=bopeebo FNF_DIFF=1 bash bot/start_agent.sh
FNF_WEB_PORT=8080 bash web/start_web.sh
```

> Por la latencia de Ollama en móvil (~3–6 s por decisión), el bot **ralentiza**
> el tiempo del juego (`scale`) para que cada nota tenga margen. `test` acaba
> en pocos minutos; `tutorial` y `bopeebo` son más largos.

## Herramientas MCP

| Tool | Descripción |
|------|-------------|
| `observe` | estado + distancias por carril |
| `input.press` | pulsa `left\|down\|up\|right\|enter\|escape` |
| `game.start` | inicia sesión (`song`, `diff`, `scale`) |
| `game.status` | estado del motor |
| `song.chart` | notas del chart oficial |
| `session.reset` | reinicia la canción actual |

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
| GET | `/api/status` | estado motor + servicios |
| GET | `/api/services` | engine/agent/ollama online |
| POST | `/api/engine/start\|stop` | arranca/para motor |
| POST | `/api/agent/start\|stop` | arranca/para bot (`{song,diff}`) |
| POST | `/api/game/start` | demo sin IA (`{song,diff,scale}`) |
| GET | `/healthz` | healthcheck |

## Solución de problemas

| Problema | Solución |
|----------|----------|
| Motor offline en el visor | `bash env/start_engine.sh` |
| `model 'fnf-agent' not found` | `ollama create fnf-agent -f model/Modelfile` |
| Ollama no responde | `ollama serve` (deja la sesión abierta) |
| Socket ocupado / stale | `bash env/stop_engine.sh` y vuelve a arrancar |
| Frame negro / 404 | el motor no está renderizando; revisa `logs/engine.log` |
| Agente no pulsa | mira `logs/agent.log`; suele ser Ollama caído o latencia alta |
| No entra desde otro dispositivo | misma Wi‑Fi, firewall/AP isolation; prueba `http://IP:8787` |
| `chart no existe` | usa `tutorial`, `bopeebo` o `test` |

## Notas

- `env/setup_env.sh` y `env/run_x.sh` eran un intento con FNF real en proot/Xvfb;
  el proyecto actual simula todo en Python/PIL — se pueden ignorar.
- Para menos latencia prueba `FNF_MODEL=mobile` (si lo tienes en `ollama list`).
- El visor es **solo control local**: no hay autenticación; no lo expongas a Internet.
