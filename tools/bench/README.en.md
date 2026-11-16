# Agent test bench (`fnf-bench`)

Local harness to measure bots and external AIs **without opening game settings by hand**. It orchestrates what already exists (`simular()`, relay, Playwright); it does **not** duplicate the engine or change Sick/Good/Bad/Miss windows.

Español: [README.md](./README.md).

## Requirements

- Node 22+
- Python 3 (relay and `.py` agents)
- `protocol` mode only: `npm ci` and `npx playwright install chromium` (same as e2e)

## Commands

```sh
# Simulation (in-game bot, no browser / relay)
node tools/bench/cli.mjs sim \
  --perfil perfecto --cancion luz-de-neon --dificultad hard \
  --runs 1 --out runs/perfecto-hard

# Real AI via relay + simulated latency
node tools/bench/cli.mjs protocol \
  --agent autoajuste --retraso 80 \
  --cancion luz-de-neon --dificultad hard \
  --runs 3 --min-sick 0.95 --out runs/autoajuste-80ms

# Custom agent + JSONL trace
node tools/bench/cli.mjs protocol \
  --agent-script ./my_ai.py --runs 1 --trace --out runs/custom

# Compare summaries / re-aggregate a trace
node tools/bench/cli.mjs compare runs/a/summary.json runs/b/summary.json
node tools/bench/cli.mjs replay runs/autoajuste-80ms/run-001.jsonl
```

Presets (`--agent`): `autoajuste`, `observe`, `chart`, `js` (see `presets.json`).

## Useful flags

| Flag | Meaning |
|---|---|
| `--cancion` / `--dificultad` | Chart id and easy/normal/hard |
| `--runs` | Matches (sim default 1; protocol default 3) |
| `--retraso` | Simulated relay latency ms (`protocol`) |
| `--perfil` / `--semilla` | Bot profile / seed in `sim` |
| `--out dir` | Writes `summary.json` (and `run-NNN.jsonl` with `--trace`) |
| `--trace` | Spectator → JSONL per run |
| `--min-sick 0.95` | Exit `1` if mean Sick rate is below the bar |
| `--headed` | Show Chromium (debug) |

Exit codes: `0` ok · `1` threshold / partial infra issues · `2` infra or bad usage.

## Output

`summary.json` aggregates sickRate, accuracy, offsets (mean/std + 15 ms histogram), best/worst run, and each `RunResult`. JSONL traces feed `replay` (metrics only; key replay against the engine is phase 2).

Ephemeral port, test token, and temp HOME follow the e2e pattern; relay/agent/Chromium are cleaned up on exit or Ctrl+C.
