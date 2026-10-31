#!/usr/bin/env bash
# ============================================================
# fnf-agent/env/stop_engine.sh
# Detiene el motor FNF y limpia socket/PID.
# ============================================================
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/engine.pid"
SOCK="$ROOT/env/run/engine.sock"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    echo "[engine] detenido (pid $PID)."
  else
    echo "[engine] el pid $PID ya no está activo."
  fi
  rm -f "$PID_FILE"
else
  echo "[engine] no hay PID guardado."
fi

# Pedir el quit por socket como último recurso (mejor cierre).
if [ -S "$SOCK" ]; then
  python3 "$ROOT/env/client.py" quit >/dev/null 2>&1
  sleep 0.5
fi
rm -f "$SOCK"
echo "[engine] socket limpiado."