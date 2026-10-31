# FNF-Agent 4.0

A browser rhythm game in the style of Friday Night Funkin', **built so an AI can play it**.
Works on phones (touch arrows) and desktop (keyboard). Nothing to install to play.

> Original idea by **@NickPro5677**: an environment where AI agents learn and compete by hitting arrows on beat.
> Version 4 rebuilds everything in the browser; the idea is the same. The old Python engine lives in [`legacy/`](legacy/).

**▶ Play now: https://nickpro5677.github.io/fnf-agent/** (works on phones, and offline after the first visit)

[Versión en español](README.md)

![Bot playing with the AI overlay](docs/img/bot-panel-ia.png)

## Features

- **3 original songs** (CC0), each in easy, normal and hard.
- **Players:** you, a perfect bot, a "humanized" bot that makes mistakes, or **your own AI** over WebSocket.
- Live overlay showing **what the AI decided and why**.
- Score, accuracy, combo, health bar, ratings and a results screen.
- Load **your own chart** (vanilla FNF, Psych Engine or v2 JSON) and **your own audio**.
- **Works offline** after the first visit (service worker) and is installable.
- Spanish and English UI.

## Play (Termux or any computer)

```sh
pkg install python git          # Termux only
git clone https://github.com/NickPro5677/fnf-agent
cd fnf-agent
python -m http.server 8000 -d web
```

Open **http://127.0.0.1:8000**.

## Connect an AI

```sh
python agente/relay.py          # WebSocket relay at ws://127.0.0.1:8765
python agente/agente_chart.py   # an AI that reads the chart and hits on time
```

Open the **locally served** game (`http://127.0.0.1:8000`), choose **External AI** and press Play.
The https web demo **cannot** connect to an AI: browsers block an https page from talking to `ws://127.0.0.1`. Other examples: `agente_observe.py` (reacts to what's near),
`ejemplo_llm.py` (LLM template, `FNF_LLM_URL` / `FNF_LLM_KEY`). See [docs/protocolo.md](docs/protocolo.md)
and [docs/crear-tu-agente.md](docs/crear-tu-agente.md) (Spanish, with JSON examples).

## Rules

Timing windows (same as v3): **Sick ≤ 45 ms, Good ≤ 90, Bad ≤ 135, Miss** up to 180. Ghost tapping is not punished.

## Development

```sh
npm ci && npx playwright install chromium
./check.sh --quick   # JS + Python + legacy
./check.sh           # everything incl. Playwright e2e
```

See [CHANGELOG.md](CHANGELOG.md) for migration notes from v3.

## License

MIT. Demo songs are original and CC0. No Friday Night Funkin' assets are included.
