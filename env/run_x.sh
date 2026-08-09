#!/usr/bin/env bash
# ============================================================
# fnf-agent/env/run_x.sh
# Levanta Xvfb en :99 con una resolución móvil y guarda el PID.
# Se ejecuta dentro de proot (alpine).
# ============================================================
set -euo pipefail

DISPLAY_NUM="${1:-:99}"
XRFILE="/tmp/.X99-lock"

if proot-distro login alpine -- sh -lc "pgrep -f 'Xvfb ${DISPLAY_NUM}' >/dev/null"; then
  echo "[x] Xvfb ${DISPLAY_NUM} ya está corriendo."
  exit 0
fi

rm -f "${XRFILE}" 2>/dev/null || true

proot-distro login alpine -- sh -lc "Xvfb ${DISPLAY_NUM} -screen 0 640x800x24 -nolisten tcp &"
sleep 2

proot-distro login alpine -- sh -lc "DISPLAY=${DISPLAY_NUM} xdotool getdisplaygeometry"
echo "[x] Xvfb ${DISPLAY_NUM} listo (640x800)."