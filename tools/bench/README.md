# Banco de pruebas de agentes (`fnf-bench`)

Harness local para medir bots e IAs **sin tocar Ajustes a mano**. Orquesta lo que ya existe (`simular()`, relay, Playwright); **no** duplica el motor ni cambia ventanas Sick/Good/Bad/Miss.

English: see [README.en.md](./README.en.md).

## Requisitos

- Node 22+
- Python 3 (relay y agentes `.py`)
- Solo modo `protocol`: `npm ci` y `npx playwright install chromium` (igual que e2e)

## Comandos

```sh
# Modo simulación (bot del juego, sin browser ni relay)
node tools/bench/cli.mjs sim \
  --perfil perfecto --cancion luz-de-neon --dificultad hard \
  --runs 1 --out runs/perfecto-hard

# IA real vía relay + latencia simulada
node tools/bench/cli.mjs protocol \
  --agent autoajuste --retraso 80 \
  --cancion luz-de-neon --dificultad hard \
  --runs 3 --min-sick 0.95 --out runs/autoajuste-80ms

# Agente custom + traza JSONL
node tools/bench/cli.mjs protocol \
  --agent-script ./mi_ia.py --runs 1 --trace --out runs/custom

# Comparar dos summaries / re-agregar una traza
node tools/bench/cli.mjs compare runs/a/summary.json runs/b/summary.json
node tools/bench/cli.mjs replay runs/autoajuste-80ms/run-001.jsonl
```

Presets (`--agent`): `autoajuste`, `observe`, `chart`, `js` (ver `presets.json`).

## Flags útiles

| Flag | Qué hace |
|---|---|
| `--cancion` / `--dificultad` | Chart (`primer-paso`, `luz-de-neon`, `turbo-cuantico`) y easy/normal/hard |
| `--runs` | Partidas (sim default 1; protocol default 3) |
| `--retraso` | ms de latencia en el relay (`protocol`) |
| `--perfil` / `--semilla` | Bot en `sim` |
| `--out dir` | Escribe `summary.json` (y `run-NNN.jsonl` con `--trace`) |
| `--trace` | Spectator → JSONL por run |
| `--min-sick 0.95` | Exit `1` si la media de Sick no llega |
| `--headed` | Ventana de Chromium (debug) |

Códigos de salida: `0` ok · `1` umbral / runs parciales con error · `2` infra o uso incorrecto.

## Salida

`summary.json` agrega sickRate, precisión, offsets (media/desv + histograma 15 ms), mejor/peor run y cada `RunResult`. Las trazas JSONL sirven para `replay` (re-agregar métricas; aplicar teclas al motor es fase 2).

El harness usa puerto efímero, token de prueba y HOME temporal (mismo patrón que e2e) y mata relay/agente/Chromium al salir o con Ctrl+C.

## Qué no hace (aún)

Cliente game Node sin Chromium, grids multi-agente, umbral obligatorio en CI, arena IA vs IA. Ver el plan del proyecto si aportas fases siguientes.
