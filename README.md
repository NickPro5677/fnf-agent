# FNF-Agent 3.0

Plataforma **local** (Termux / Android) para jugar y evaluar agentes sobre
Friday Night Funkin'. Motor en Python (PIL), agentes en Node, visor HTTP.

- **Motor fiel en mecánica**: notas de jugador (`d` 0–3) vs oponente (`d` 4–7),
  juicios sick/good/bad/miss, health y score creíbles. Arte ligero, sin audio.
- **Agentes enchufables**: `chart` (memoria del JSON) y `observe` (solo el
  estado del motor). El bot local habla al socket; no pasa por MCP.
- **Visor** en el móvil: vídeo, HUD, pad táctil y controles.
- **MCP** opcional para clientes externos.

No hay LLM en el bucle de notas (se eliminó en v2: ~10 s/decisión).

## Arranque

```sh
pkg install python python-pillow nodejs
cd ~/fnf-agent   # o la ruta de este repo
npm install
bash start_all.sh
```

Abre `http://127.0.0.1:8787`. Elige canción y pulsa **▶ Jugar**.

Para LAN: `FNF_WEB_HOST=0.0.0.0 bash start_all.sh` y define `FNF_WEB_TOKEN`.

Parar: `bash stop_all.sh`.

Solo terminal:

```sh
bash env/start_engine.sh
FNF_SONG=test FNF_AGENT=chart node bot/bot_loop.js
```

## Migración desde 2.x

| 2.x | 3.0 |
|---|---|
| Todas las notas eran jugables (`d % 4`) | Default `FNF_SIDES=player` (solo boyfriend) |
| Ventanas 150 / 300 ms | 45 / 90 / 135 / 180 ms |
| Visor en `0.0.0.0` | Visor en `127.0.0.1` |
| Bot lanzaba MCP | Bot → socket directo |

`FNF_SIDES=both` restaura el recuento 2.x.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/arquitectura.md](docs/arquitectura.md) | Procesos, IPC, por qué MCP es opcional |
| [docs/motor.md](docs/motor.md) | Ventanas, sides, scoring, socket |
| [docs/agentes.md](docs/agentes.md) | `chart`, `observe`, cómo añadir uno |
| [docs/charts.md](docs/charts.md) | Formato v2.0.0, cómo añadir canciones |
| [docs/visor.md](docs/visor.md) | Rutas, token, pad |
| [docs/mcp.md](docs/mcp.md) | Tools para clientes externos |
| [docs/desarrollo.md](docs/desarrollo.md) | Tests, `check.sh`, convenciones |
| [.env.example](.env.example) | Todas las variables `FNF_*` |

```sh
bash check.sh --quick   # sintaxis + tests
bash check.sh           # + motor + visor + MCP
```

## Licencia

MIT. Friday Night Funkin' y sus charts oficiales pertenecen a sus autores.
Este repo no incluye audio ni sprites de Newgrounds.
