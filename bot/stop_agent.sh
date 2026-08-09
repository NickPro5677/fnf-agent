#!/usr/bin/env bash
# ============================================================
# fnf-agent/bot/stop_agent.sh
# Detiene el agente (bot_loop.js).
# ============================================================
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/agent.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
  fi
  rm -f "$PID_FILE"
fi
pkill -f "bot_loop.js" 2>/dev/null
echo "[agent] detenido."