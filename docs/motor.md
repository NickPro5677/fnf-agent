# Motor

`env/fnf_engine.py` simula una highway de 4 carriles y valida cada golpe.
Es la fuente de verdad: el agente no se puntúa a sí mismo.

Estados: `menu` → `playing` → `result`.

## Sides

Al cargar un chart v2.0.0:

```
side = "player"    si (d % 8) < 4
side = "opponent"  si (d % 8) >= 4
lane = d % 4
```

| `sides` | Qué se juega |
|---|---|
| `player` (default) | Solo boyfriend. El oponente hace auto-hit al llegar a la línea: no puntúa, no drena health, se dibuja tenue. |
| `both` | Todas las notas son jugables (comportamiento 2.x). |

`notes_total` / `notes_left` en `status` cuentan solo las jugables.
`notes_opponent` son las visuales (0 si `both`).

## Ventanas (ms de canción)

Aproximación FNF, no clon oficial:

| Juicio | Ventana | Puntos | Health |
|---|---|---|---|
| sick | ≤ 45 | +350 + 10×combo | +0.023 |
| good | ≤ 90 | +200 + 10×combo | +0.016 |
| bad | ≤ 135 | +100 + 5×combo | +0.008 |
| miss | > 135 con tecla, o > 180 sin pulsar | 0 | −0.047 |

Sustain: hay que mantener la tecla hasta `t + l`. Soltar antes = miss y
combo a 0 (−0.055 health). Completar el sustain da +50.

Health inicial 0.5. `health ≤ 0` → `DEFEAT`. Pasar `song_len + 5 s` → `WIN`.

Accuracy (sobre notas ya juzgadas):

```
(sick + 0.75×good + 0.37×bad) / (sick+good+bad+miss)
```

Events del chart (`FocusCamera`, etc.) se ignoran; `events_ignored` los cuenta.

## Render

640×800 PNG atómico en `env/render/latest.png`. 15 FPS por defecto
(`FNF_FPS` 8–30). `scrollSpeed` del chart solo cambia el viaje visual
(`1500 / scrollSpeed` ms de TOP a HIT).

## Socket

Comandos: `start`, `key`, `status`, `list`, `quit`. Ejemplo de `status`:

```json
{
  "place": "playing",
  "song": "bopeebo",
  "diff": 0,
  "sides": "player",
  "song_time_ms": 1234.5,
  "scale": 0.67,
  "combo": 12,
  "score": 4200,
  "health": 0.62,
  "accuracy": 0.981,
  "judge": {"sick": 10, "good": 2, "bad": 0, "miss": 0},
  "notes_total": 44,
  "notes_left": 32,
  "notes_opponent": 44,
  "lanes": {"left": 80.0, "down": -1, "up": -1, "right": 210.5},
  "holds": {"left": -1, "down": 400.0, "up": -1, "right": -1},
  "events_ignored": 49,
  "result": "",
  "frame_seq": 90
}
```

- `lanes`: ms hasta la nota **jugable** `wait` más cercana (−1 si no hay).
- `holds`: ms restantes del sustain en curso por carril (−1 si no hay).
  El agente `observe` lo necesita; sin esto rompe bopeebo.

`list` devuelve los charts con recuentos player/opponent.

CLI: `python3 env/client.py status|start|list|press|quit`.
