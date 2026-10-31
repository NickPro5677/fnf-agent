# Cambios

## Sin publicar

- La demo web (https) avisa que una IA externa necesita el juego servido en local (el navegador bloquea `ws://127.0.0.1`). README y docs enlazan la demo.
- El pad táctil ya no se rompe si el navegador no permite capturar el puntero.
- Prueba e2e del pad estable: espera a que la partida esté lista en vez de asumir tiempos.
- Caché del service worker renovada para que se vean los cambios.

## 4.0.0 — 2026-10-31

Rediseño completo: el juego ahora corre en el navegador.

### Nuevo
- Juego web sin compilar (módulos ES + canvas): notas, holds, vida, puntos, precisión, combo, calificaciones y resultados.
- Teléfono (flechas táctiles) y PC (teclado ← ↓ ↑ → / WASD). Sin desborde a 390 px; bien a 1920 px.
- Jugadores: humano, bot perfecto, bot humanizado y **IA externa por WebSocket**, con panel de decisiones en vivo.
- Relay en Python solo con librería estándar (`agente/relay.py`), corre en Termux.
- Agentes `agente_chart.py`, `agente_observe.py` y `ejemplo_llm.py`. Protocolo documentado en `docs/protocolo.md`.
- Servidor MCP actualizado (`mcp/fnf-mcp.js`): `juego_estado`, `juego_chart`, `juego_tecla`, `juego_pensar`.
- 3 canciones originales CC0 con audio sintetizado; carga de charts (clásico, Psych, v2) y audio propios.
- Modo sin conexión (service worker), manifest instalable, español/inglés, accesibilidad revisada con axe.
- Pruebas: `node --test`, `pytest` y e2e con Playwright; CI las corre todas. Workflow de Pages incluido (desactivado).

### Cambiado
- Mismas ventanas de juicio que la v3 (45/90/135/180 ms) y la misma puntuación y vida.
- Tocar sin nota ya no castiga (ghost tapping).

### Quitado
- Charts oficiales de FNF (bopeebo, tutorial). Reemplazados por canciones originales.

### Migrar desde la v3
- El motor Python, el visor y los agentes Node viejos están en `legacy/` y siguen funcionando: `bash legacy/check.sh`.
  Las rutas cambian de `env/…` a `legacy/env/…`, etc. Los ejemplos usan `primer-paso` y `luz-de-neon` en vez de `tutorial`/`bopeebo`.
- Agentes nuevos: en vez de leer frames y archivos, conéctate al relay y usa los mensajes `chart`/`state` y manda `key`.
  La lógica de un agente v3 de "chart" se traduce directo: notas con `t` en ms → `key down` en `t`, `key up` al terminar.
- `npm test` ahora corre `check.sh --quick`; `npm run test:all` incluye e2e. Requiere Node 22 o más.

## 3.0.0
Motor Python con render PIL, visor HTTP y agentes Node (ver `legacy/`).
