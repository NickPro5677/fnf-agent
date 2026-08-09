#!/usr/bin/env bash
# ============================================================
# fnf-agent/bot/start_agent.sh
# Arranca el agente (bot_loop.js) en background.
# Variables: FNF_SONG (tutorial|bopeebo|test), FNF_DIFF (0..2).
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOT_JS="$ROOT/bot/bot_loop.js"
PID_FILE="$ROOT/logs/agent.pid"
LOG_FILE="$ROOT/logs/agent.log"

mkdir -p "$ROOT/logs"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[agent] ya está corriendo (pid $OLD_PID). Detenlo con stop_agent.sh"
    exit 1
  fi
  rm -f "$PID_FILE"
fi

# Aviso si Ollama no responde (el bot fallará al decidir)
if ! curl -sf --max-time 1 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "[agent] ADVERTENCIA: Ollama no responde en :11434 — ejecuta 'ollama serve'"
fi

nohup node "$BOT_JS" >>"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "[agent] arrancado pid $(cat "$PID_FILE") (song=${FNF_SONG:-tutorial} diff=${FNF_DIFF:-0})"
echo "[agent] logs: $LOG_FILE"