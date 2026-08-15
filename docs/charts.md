# Charts

Formato **Friday Night Funkin' v2.0.0** (exportados de FNF 0.8.1).

```
env/charts/<nombre>-chart.json
```

Campos que usa el motor:

| Campo | Uso |
|---|---|
| `notes.easy\|normal\|hard` | Lista `{ t, d, l? }` |
| `t` | Tiempo de la nota (ms) |
| `d` | Dirección: 0–3 jugador, 4–7 oponente. `lane = d % 4` |
| `l` | Sustain en ms (opcional) |
| `scrollSpeed.<diff>` | Velocidad visual |
| `events` | Ignorados (se cuentan) |

Incluidos:

| Nombre | Easy jugador | Easy oponente | Notas |
|---|---|---|---|
| tutorial | 32 | 23 | 1 sustain jugador |
| bopeebo | 44 | 44 | 33 sustains jugador |
| test | 10 | 0 | sintético, huecos de 1.2 s |

## Añadir una canción

1. Exporta o copia un chart v2.0.0 a `env/charts/mi-tema-chart.json`.
2. Reinicia el visor o recarga: `GET /api/charts` lo descubre.
3. `FNF_SONG=mi-tema` o el selector del visor.

No hace falta registrar la canción en ningún otro sitio.

Los charts oficiales de Newgrounds **no** incluyen audio en este repo.
El motor no reproduce música.

Detalle de `sides` y recuentos: [motor.md](motor.md).
