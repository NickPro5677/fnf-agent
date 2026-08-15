#!/usr/bin/env bash
# ============================================================
# check.sh — sintaxis, tests del motor, stack (motor/visor/MCP)
# Uso: bash check.sh [--quick]
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
FAILED=0
STARTED_ENGINE=0
STARTED_WEB=0

step() { printf "\n== %s ==\n" "$1"; }
ok() { printf "  ok  %s\n" "$1"; }
bad() { printf "  FAIL %s\n" "$1"; FAILED=1; }

step "sintaxis"
for f in env/fnf_engine.py web/server.py tests/test_engine.py; do
  python3 -m py_compile "$f" 2>/dev/null && ok "py_compile $f" || bad "py_compile $f"
done
for f in mcp/fnf-mcp.js bot/bot_loop.js bot/lib/engine.js bot/lib/chart.js bot/agents/chart.js bot/agents/observe.js; do
  node --check "$f" && ok "node --check $f" || bad "node --check $f"
done
N=$(node --input-type=module -e "import { loadPlayable } from './bot/lib/chart.js'; console.log(loadPlayable('bopeebo',0,'player').length)")
[ "$N" = "44" ] && ok "chart.js bopeebo player=44" || bad "chart.js bopeebo player=$N"

step "tests del motor (+ regresión del bot)"
python3 tests/test_engine.py && ok "test_engine" || { bad "test_engine"; }

if [ "${1:-}" = "--quick" ]; then
  [ "$FAILED" = 1 ] && { echo; echo "== fallos =="; exit 1; }
  echo; echo "== todo ok (quick) =="
  exit 0
fi

cleanup() {
  [ "$STARTED_ENGINE" = 1 ] && bash env/stop_engine.sh >/dev/null 2>&1
  [ "$STARTED_WEB" = 1 ] && bash web/stop_web.sh >/dev/null 2>&1
  rm -f env/run/engine.sock
}
trap cleanup EXIT

step "motor"
if [ ! -S env/run/engine.sock ]; then
  bash env/start_engine.sh >/dev/null 2>&1 || { bad "no arranca el motor"; exit 1; }
  STARTED_ENGINE=1
fi
ST=$(python3 env/client.py status 2>/dev/null)
echo "$ST" | grep -q "'place'" && ok "motor responde status" || bad "motor status"
python3 env/client.py list 2>/dev/null | grep -q "bopeebo" && ok "motor list" || bad "motor list"

step "visor web"
FNF_WEB_HOST=127.0.0.1 bash web/start_web.sh >/dev/null 2>&1 || true
STARTED_WEB=1
for _ in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/healthz 2>/dev/null)" = "200" ] && break
  sleep 0.25
done
for u in /healthz /api/charts /frame; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787$u" 2>/dev/null)
  [ "$code" = "200" ] && ok "GET $u -> 200" || bad "GET $u -> $code"
done
CH=$(curl -s http://127.0.0.1:8787/api/charts 2>/dev/null)
echo "$CH" | grep -q '"player"' && ok "charts incluyen player counts" || bad "charts player counts"

step "MCP"
OUT=$(timeout 30 node mcp/test-client.mjs 2>&1)
echo "$OUT" | grep -q "TOOLS:" && ok "tools MCP" || bad "tools MCP: $(echo "$OUT" | tail -1)"
echo "$OUT" | grep -q "song.list" && ok "tool song.list" || bad "tool song.list"
echo "$OUT" | grep -q "press: ok" && ok "game end-to-end" || bad "game end-to-end"
python3 env/client.py start tutorial 0 1 player >/dev/null 2>&1 || true

[ "$FAILED" = 1 ] && { echo; echo "== hay fallos =="; exit 1; }
echo; echo "== todo ok =="
exit 0
