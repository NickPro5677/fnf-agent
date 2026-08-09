#!/usr/bin/env bash
# ============================================================
# fnf-agent/env/start_engine.sh
# Arranca el motor FNF de forma segura: limpia socket/PID viejos,
# lanza el motor en background, guarda PID y espera el socket.
# ============================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_PY="$ROOT/env/fnf_engine.py"
RUN_DIR="$ROOT/env/run"
SOCK="$RUN_DIR/engine.sock"
PID_FILE="$ROOT/logs/engine.pid"
LOG_FILE="$ROOT/logs/engine.log"

mkdir -p "$RUN_DIR" "$ROOT/logs"

# Si ya hay un motor corriendo (PID vivo), no duplicar.
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[engine] ya está corriendo (pid $OLD_PID)."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

rm -f "$SOCK"                       # socket stale de una sesión anterior
nohup python3 "$ENGINE_PY" >>"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "[engine] arrancado pid $(cat "$PID_FILE"). Esperando socket..."

for _ in $(seq 1 50); do
  [ -S "$SOCK" ] && break
  sleep 0.2
done

if [ -S "$SOCK" ]; then
  echo "[engine] socket listo: $SOCK"
else
  echo "[engine] ADVERTENCIA: no apareció el socket tras 10s. Revisa $LOG_FILE"
  exit 1
fi