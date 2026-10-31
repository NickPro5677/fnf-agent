# Protocolo v2 (WebSocket)

Mensajes **JSON de texto**, igual que la [v1](protocolo.md). La v2 **añade** cosas; un agente v1 sigue funcionando sin cambios.

```
navegador (game) ──► relay ──► agente (agent)
                 ◄──       ◄──
                       └────► espectador (spectator, solo mira)
```

## 0. Token (obligatorio)

Al arrancar, `python agente/relay.py` genera un token y lo muestra en Termux:

```
[relay] listo en ws://127.0.0.1:8765  (Ctrl+C para salir)
[relay] 🔑 token: abcd-efgh-ijkl   (guardado en ~/.fnf-agent/token)
```

- Escríbelo en el juego: **IA externa → Ajustes → Token**.
- Los agentes lo leen solos: `--token`, la variable `FNF_TOKEN` o el archivo `~/.fnf-agent/token` (en ese orden).
- Para fijar uno: `python agente/relay.py --token mi-token-largo` (mínimo 8 caracteres).
- **No subas el token al repositorio** ni lo compartas.

Sin token o con uno incorrecto el relay contesta `{"type":"error","error":"token_requerido"|"token_invalido"}` y cierra con el código **4001**.
Mandar cualquier otra cosa antes del `hello` también cierra la conexión.

**Origin:** el relay solo acepta páginas servidas desde `127.0.0.1`, `localhost` o `[::1]` (cualquier puerto).
Otra web recibe **403**. Si sirves el juego desde otra dirección: `--origen http://192.168.1.5:8000`.
Los programas sin `Origin` (agentes en Python/Node) entran solo con el token.

## 1. Saludo con capacidades

```json
{"type": "hello", "role": "agent", "name": "mi-ia", "token": "abcd-efgh-ijkl", "v": 2, "caps": ["at", "ping"]}
```

- `role`: `"game"`, `"agent"` o `"spectator"`.
- El token también puede ir en la URL: `ws://127.0.0.1:8765/?token=...`.

Respuesta:

```json
{"type": "welcome", "v": 2, "caps": ["at", "ping", "lookahead", "spectator"],
 "games": 1, "agents": 1, "spectators": 0, "names": ["mi-ia"],
 "game": {"caps": ["at", "ping", "lookahead"], "lookahead": 1500, "hz": 30, "mode": "v2"}}
```

`game` dice qué sabe hacer el juego conectado. **Usa `at` solo si `game.caps` lo trae.** Cuando entra o sale alguien llega `peers` con los mismos campos.

## 2. Teclas con `at`

```json
{"type": "key", "lane": 2, "down": true, "at": 15230, "why": "nota 41"}
```

`at` es el tiempo de la canción (ms) en el que quieres que cuente la tecla. El juego la guarda y la aplica justo en ese momento.
Si llega tarde, cuenta en su `at` (como mucho 150 ms atrás). Sin `at`, cuenta al llegar (v1), menos la compensación que elijas en Ajustes.

Manda la tecla **antes** de tiempo: `rtt/2 + margen` (ver ping). Así la latencia no importa.

## 3. Ping / pong y latencia

```json
{"type": "ping", "id": 7, "sent": 123.4}                      // al juego
{"type": "pong", "id": 7, "sent": 123.4, "t": 15012.5}         // respuesta: t = tiempo de canción
{"type": "ping", "id": 8, "sent": 130.0, "target": "relay"}   // lo contesta el relay (from: "relay")
```

- `rtt = ahora − sent`. Tiempo de canción ahora ≈ `t + rtt/2`.
- Quédate con las muestras de rtt más bajo (los agentes de ejemplo usan las 5 mejores).
- El juego también te manda pings: contesta con `pong` copiando `id` y `sent`.

## 4. Estado con lookahead

Con v2, `state` trae `"v": 2`, `"lookahead": 1500` y en `next` **todas** las notas de los próximos `lookahead` ms (hasta 64):

```json
{"type": "state", "v": 2, "lookahead": 1500, "t": 15000, "next": [{"id": 41, "lane": 2, "t": 15230, "dt": 230, "l": 0}], ...}
```

El juego manda `state` a la frecuencia de **Hz** (Ajustes). El resto de campos es igual que en v1.
`judgement` trae `offset` (ms, + = tarde): úsalo para corregirte.

## 5. Espectador

`role: "spectator"` recibe lo del juego y las teclas/pensamientos de los agentes, pero **no puede** mandar teclas (`error: no_permitido`).

## Errores

| `error` | Por qué |
|---|---|
| `token_requerido` | Falta el token. |
| `token_invalido` | El token no es el del relay. |
| `no_permitido` | Un espectador intentó mandar algo. |
| `rol_invalido` | `role` no es game/agent/spectator. |

## Qué no hay (a propósito)

Varias IAs a la vez contra el juego, IA contra IA y túneles a internet. El relay escucha en `127.0.0.1` por defecto.
