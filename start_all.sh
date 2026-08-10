#!/usr/bin/env bash
# ============================================================
# fnf-agent/start_all.sh
# Arranca el stack completo: motor + visor web.
# El agente se lanza aparte (bot/start_agent.sh o desde el visor).
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$ROOT/logs"

echo "== FNF-Agent · arranque =="

# ---- Motor ----
bash "$ROOT/env/start_engine.sh" && echo

# ---- Visor web ----
bash "$ROOT/web/start_web.sh"

echo
echo "Listo. Abre el visor y pulsa ▶ Jugar, o:"
echo "  FNF_SONG=test bash $ROOT/bot/start_agent.sh"
echo
echo "Parar todo:  bash $ROOT/stop_all.sh"