# Agentes

`bot/bot_loop.js` lee `FNF_AGENT` e importa `bot/agents/<nombre>.js`.
Cada agente exporta `run(ctx)`:

```js
export async function run(ctx) {
  // ctx.engine.call({ cmd, ... })
  // ctx.log(msg)
  // ctx.env = { song, diff, sides, scale, agent }
}
```

`scale` es `null` si no hay `FNF_SCALE` (el agente `chart` calcula auto).

## chart (default)

Lee el JSON oficial (`bot/lib/chart.js`) y pulsa sincronizado con
`song_time_ms`.

- `LEAD = 40` ms (dentro de sick si el hold llega a tiempo).
- `RELEASE_SLACK = 80` ms después de `t + l`.
- Engagement por carril: notas seguidas **extienden** el hold (no tap-off-tap).
- `autoScale = clamp(minGap / 450, 0.25, 1)` sobre notas jugables.

No adivina: el motor sigue validando ventanas. Tarde o soltar un sustain = miss.

## observe

No abre el chart. Cada ~25 ms mira `lanes` y `holds`:

- Baja la tecla si `0 ≤ lanes[k] ≤ FNF_PRESS_MS` (default 50).
- La mantiene si `holds[k] ≥ 0`.
- La suelta si no hay hold ni nota en ventana.

Es peor que `chart` en canciones densas (luz-de-neon): no planifica, reacciona.
En `test` (huecos de 1.2 s) debe ganar. Eso es esperado, no un bug.

## Cómo añadir uno

1. Crea `bot/agents/miagente.js` con `export async function run(ctx)`.
2. Añade el nombre al set `AGENTS` en `bot/bot_loop.js`.
3. Lanza con `FNF_AGENT=miagente`.
4. Si el visor debe listarlo, añade un `<option>` en `web/index.html`.

No pongas un LLM en el bucle de cada nota. Si quieres política de alto
nivel, que elija canción / scale / agente y delegue en `chart` u `observe`.

## Variables

Ver [.env.example](../.env.example): `FNF_SONG`, `FNF_DIFF`, `FNF_SCALE`,
`FNF_SIDES`, `FNF_AGENT`, `FNF_PRESS_MS`.
