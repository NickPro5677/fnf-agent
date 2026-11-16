# Cápsula de escritorio (Tauri 2)

App de un clic que **sirve `web/`** en `http://127.0.0.1:<puerto>` y arranca el **relay** (`agente/relay.py`) con token y puerto cableados en el juego. No reescribe el motor: envuelve lo que ya hay.

[English](#english) · [README principal](../README.md)

## Qué hace (MVP)

1. Mini HTTP en Rust → sirve el juego (Origin válido para el relay).
2. Spawnea `python3 -u agente/relay.py --host 127.0.0.1 --port … --token …`.
3. Abre el WebView en `http://127.0.0.1:…/?fnf_token=…&fnf_port=…&fnf_host=ws://127.0.0.1&jugador=remoto`.
4. Al cerrar la ventana, mata el relay y libera puertos.

Agentes externos (`python agente/agente_autoajuste.py`, MCP, etc.) siguen funcionando: leen `~/.fnf-agent/token` o `FNF_TOKEN`.

**No sustituye Termux / el flujo móvil.** En el teléfono sigue valiendo `python -m http.server` + relay a mano. Esta cápsula es PC/escritorio (Windows / macOS / Linux).

## Requisitos

| Pieza | Notas |
|---|---|
| **Rust** (rustup) | Stable reciente |
| **Tauri CLI 2** | `cargo install tauri-cli --version "^2"` |
| **Python 3** en PATH | MVP usa el Python del sistema para el relay (`FNF_PYTHON` para forzar otro) |
| **Deps WebView del SO** | Linux: `libwebkit2gtk-4.1-dev` y las [deps oficiales de Tauri](https://v2.tauri.app/start/prerequisites/) |

## Desarrollo

Desde la raíz del repo:

```sh
cd desktop/src-tauri
cargo tauri dev
```

Esperado: ventana con el menú del juego; modo **IA externa** ya elegido; token y puerto rellenados; relay escuchando (por defecto intenta `8765`).

Smoke headless (sin depender del GUI completo; útil en CI / cloud):

```sh
cd desktop/src-tauri
FNF_CAPSULE_SMOKE=1 cargo tauri dev
# o, con el binario ya compilado:
FNF_CAPSULE_SMOKE=1 cargo run
```

Debe imprimir `[capsula] smoke OK` y salir 0 tras comprobar HTTP del juego + salud del relay.

Tests unitarios del crate:

```sh
cd desktop/src-tauri && cargo test
```

## Release (Linux ejemplo)

```sh
cd desktop/src-tauri
cargo tauri build
# Artefactos en target/release/bundle/…
```

El bundle incluye `web/` y `agente/` como recursos. Sigue haciendo falta **Python 3** en la máquina del usuario para el relay (sidecar embebido = fase posterior).

## Troubleshooting

| Síntoma | Qué mirar |
|---|---|
| `no encuentro Python` | Instala Python 3 o exporta `FNF_PYTHON=/ruta/a/python` |
| Puerto 8765 ocupado | La cápsula elige otro puerto libre y lo inyecta en la UI |
| IA externa no conecta | La URL debe ser `http://127.0.0.1:…` (no `asset://` / `tauri://`); Origin del relay |
| Ventana en blanco en cloud/SSH | Hace falta display / WebView; usa `FNF_CAPSULE_SMOKE=1` para verificar el ciclo de vida |
| Service worker raro | El HTTP de la cápsula manda `Cache-Control: no-cache` |

## Alcance (no-objetivos del MVP)

- No Electron, no APK / Termux capsule.
- No empaqueta MCP ni arranca `agente_autoajuste` (fase 1.1).
- No WSS / túnel / auto-update / tienda.

---

## English

One-click **desktop capsule** (Tauri 2) that serves `web/` on localhost and starts `agente/relay.py`, wiring token/port into the game via query params. System Python is required for the MVP relay. Does **not** replace the Termux/mobile flow.

```sh
cd desktop/src-tauri
cargo tauri dev          # GUI
FNF_CAPSULE_SMOKE=1 cargo run   # headless smoke
cargo tauri build        # release bundle
```
