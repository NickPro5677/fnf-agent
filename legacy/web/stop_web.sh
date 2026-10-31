#!/usr/bin/env bash
# ============================================================
# fnf-agent/web/stop_web.sh
# Detiene el visor web.
# ============================================================
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/web.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
  fi
  rm -f "$PID_FILE"
fi
pkill -f "$ROOT/web/server.py" 2>/dev/null
echo "[web] visor detenido."