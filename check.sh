#!/usr/bin/env bash
# Corre todas las pruebas. Uso: ./check.sh [--quick]  (--quick salta e2e)
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
echo "== JS (node --test)"; node --test tests/js/*.test.mjs
echo "== Python (pytest)"; "$PY" -m pytest -q tests/py
echo "== legacy"; bash legacy/check.sh --quick
if [ "${1:-}" != "--quick" ]; then
  echo "== e2e (Playwright)"; node --test --test-concurrency=1 tests/e2e/*.test.mjs
fi
echo "OK"
