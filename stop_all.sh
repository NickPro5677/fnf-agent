#!/usr/bin/env bash
# ============================================================
# fnf-agent/stop_all.sh
# Detiene agente, motor y visor web.
# Ollama se deja corriendo por defecto (útil para otros usos).
# Usa STOP_OLLAMA=1 para apagarlo también.
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "== FNF-Agent · parada =="
bash "$ROOT/bot/stop_agent.sh" 2>/dev/null || true
bash "$ROOT/env/stop_engine.sh" 2>/dev/null || true
bash "$ROOT/web/stop_web.sh" 2>/dev/null || true

if [ "${STOP_OLLAMA:-0}" = "1" ]; then
  if [ -f "$ROOT/logs/ollama.pid" ]; then
    PID=$(cat "$ROOT/logs/ollama.pid" 2>/dev/null || echo "")
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo "[ollama] detenido (pid $PID)."
    fi
    rm -f "$ROOT/logs/ollama.pid"
  fi
  # no pkill global: podría matar un ollama del usuario que no es nuestro
else
  echo "[ollama] se deja corriendo (STOP_OLLAMA=1 para apagarlo)."
fi

echo "Listo."
