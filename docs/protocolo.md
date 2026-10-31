# Protocolo v1 (WebSocket)

Todo son mensajes **JSON de texto**. El juego (navegador) y las IAs se conectan al mismo relay
(`python agente/relay.py`, por defecto `ws://127.0.0.1:8765`). El relay reenvía lo del juego a las IAs y lo de las IAs al juego.

```
navegador (game) ──► relay ──► agente(s) (agent)
                 ◄──       ◄──
```

## 1. Saludo (todos)

Lo primero que manda cada cliente:

```json
{"type": "hello", "role": "agent", "name": "mi-ia"}
```

`role` es `"game"` o `"agent"`. El relay responde `{"type":"welcome", ...}` y avisa a todos cuando alguien entra o sale:

```json
{"type": "peers", "games": 1, "agents": 1, "names": ["mi-ia"]}
```

## 2. Del juego a la IA

| type | Cuándo | Campos |
|---|---|---|
| `chart` | Al empezar la canción | `song`, `bpm`, `notes: [{id, t, lane, l}]`, `windows: {sick, good, bad, miss}` |
| `state` | ~30 veces por segundo | ver abajo |
| `judgement` | Cada acierto o fallo | `lane`, `kind` (`sick`/`good`/`bad`/`miss`), `offset` (ms, + = tarde), `note` |
| `result` | Al terminar | `resultado` (`victoria`/`derrota`), `puntos`, `precision`, `comboMax`, `juicios`, `total`, `letra`, `fullCombo` |

Tiempos en **milisegundos** desde el inicio de la canción. `lane`: 0 = ←, 1 = ↓, 2 = ↑, 3 = →. `l` = largo del hold (0 si es nota normal).

`state`:

```json
{"type":"state","v":1,"t":5230,"playing":true,
 "next":[{"id":12,"lane":2,"t":5300,"dt":70,"l":0}],
 "lanes":[410,null,70,890], "holds":[null,null,null,null], "keys":[false,false,false,false],
 "health":0.62,"score":4200,"combo":14,"accuracy":0.97,
 "judgements":{"sick":13,"good":1,"bad":0,"miss":0}}
```

- `lanes[i]`: ms hasta la próxima nota en ese carril (`null` = ninguna).
- `holds[i]`: ms que faltan para soltar un hold que estás manteniendo.

## 3. De la IA al juego

```json
{"type": "key", "lane": 2, "down": true, "why": "nota ↑ en 3 ms"}
{"type": "key", "lane": "up", "down": false}
{"type": "think", "text": "voy a esperar el hold"}
```

- `lane`: 0–3 o `"left" | "down" | "up" | "right"`. `down`: `true` = pulsar, `false` = soltar.
- `why` (opcional, ≤120 caracteres) y `think` (≤200) se ven en el panel de IA.
- El relay añade `"from": "<name>"`.

## 4. Errores

`{"type":"error","error":"no_permitido"}` si un agente manda un tipo de juego (o al revés).
Mensajes inválidos de una IA (`lane_invalido`, `down_debe_ser_booleano`, `tipo_desconocido`) se ignoran en el juego.

## Reglas de juicio

Sick ≤ 45 ms · Good ≤ 90 · Bad ≤ 135 · más tarde de 135 (hasta 180) = Miss. Pulsar antes de −135 ms no hace nada.
Soltar un hold hasta 90 ms antes de su fin cuenta como completo.
