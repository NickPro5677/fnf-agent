#!/usr/bin/env bash
# ============================================================
# fnf-agent/env/setup_env.sh
# Instala paquetería del entorno headless en Alpine (proot).
#   Xvfb (display virtual), xdotool (inyección de teclas),
#   ImageMagick (capturas), fuentes para los textos del juego.
# ============================================================
set -euo pipefail

echo "[env] Actualizando Alpine..."
proot-distro login alpine -- apk update

echo "[env] Instalando paquetes base del entorno FNF..."
proot-distro login alpine -- apk add --no-cache \
  xvfb \
  xdotool \
  imagemagick \
  xauth \
  fontconfig \
  ttf-dejavu \
  tini

echo "[env] Verificando binarios..."
proot-distro login alpine -- sh -lc '
  command -v Xvfb  && echo "Xvfb  OK"
  command -v xdotool && echo "xdotool OK"
'
echo "[env] Listo."