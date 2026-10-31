#!/usr/bin/env bash
# ============================================================
# fnf-agent/stop_all.sh
# Detiene agente, motor y visor web.
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "== FNF-Agent · parada =="
bash "$ROOT/bot/stop_agent.sh" 2>/dev/null || true
bash "$ROOT/env/stop_engine.sh" 2>/dev/null || true
bash "$ROOT/web/stop_web.sh" 2>/dev/null || true
echo "Listo."