#!/usr/bin/env bash
# ============================================================
# fnf-agent/web/start_web.sh
# Arranca el visor web en background y muestra las URLs de acceso.
# Puerto: FNF_WEB_PORT (8787). Bind 0.0.0.0 (local + red local).
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PY="$ROOT/web/server.py"
PID_FILE="$ROOT/logs/web.pid"
LOG_FILE="$ROOT/logs/web.log"
PORT="${FNF_WEB_PORT:-8787}"

mkdir -p "$ROOT/logs"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[web] ya está corriendo (pid $OLD_PID)."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

nohup python3 "$WEB_PY" >>"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "[web] visor arrancado pid $(cat "$PID_FILE") en el puerto $PORT."
sleep 0.6

echo
echo "  En este móvil:      http://127.0.0.1:$PORT"
IP=$(python3 - <<PY 2>/dev/null
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80))
    print(s.getsockname()[0])
except Exception:
    print("")
finally:
    s.close()
PY
)
if [ -n "$IP" ]; then
  echo "  Desde la misma Wi-Fi:  http://$IP:$PORT"
else
  echo "  Desde la misma Wi-Fi:  determina tu IP con: hostname -I"
fi
echo
echo "  [web] logs: $LOG_FILE"