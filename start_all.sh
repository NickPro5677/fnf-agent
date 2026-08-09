#!/usr/bin/env bash
# ============================================================
# fnf-agent/start_all.sh
# Arranca el stack completo: Ollama (si no corre) + motor + web.
# El agente se lanza aparte (bot/start_agent.sh o desde el visor).
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${FNF_WEB_PORT:-8787}"

mkdir -p "$ROOT/logs"

echo "== FNF-Agent · arranque =="

# ---- Ollama ----
if curl -sf --max-time 1 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "[ollama] ya responde en :11434"
else
  if command -v ollama >/dev/null 2>&1; then
    echo "[ollama] arrancando serve..."
    export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
    nohup ollama serve >>"$ROOT/logs/ollama.log" 2>&1 &
    echo $! > "$ROOT/logs/ollama.pid"
    for _ in $(seq 1 30); do
      curl -sf --max-time 1 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1 && break
      sleep 0.4
    done
    if curl -sf --max-time 1 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      echo "[ollama] listo (pid $(cat "$ROOT/logs/ollama.pid"))"
    else
      echo "[ollama] ADVERTENCIA: no responde aún. Revisa logs/ollama.log"
      echo "         (el visor igual arranca; el agente necesita Ollama)"
    fi
  else
    echo "[ollama] no instalado — el agente no podrá decidir teclas"
  fi
fi

# ---- Motor ----
bash "$ROOT/env/start_engine.sh"

# ---- Visor web ----
bash "$ROOT/web/start_web.sh"

echo
echo "Listo. Abre el visor y pulsa ▶ Jugar, o:"
echo "  FNF_SONG=test bash $ROOT/bot/start_agent.sh"
echo
echo "Parar todo:  bash $ROOT/stop_all.sh"
