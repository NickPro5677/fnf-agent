# MCP

Servidor stdio para clientes externos. El bot local **no** lo usa.

```sh
bash env/start_engine.sh
node mcp/fnf-mcp.js
# o
node mcp/test-client.mjs
```

Implementación: `mcp/fnf-mcp.js` importa `bot/lib/engine.js` y
`bot/lib/chart.js`.

## Tools

| Tool | Qué hace |
|---|---|
| `observe` | `status` del motor (lanes, holds, judge, sides) |
| `game.status` | Alias de `observe` |
| `input.press` | down → espera → up |
| `input.key` | down/up fino |
| `game.start` | `{song, diff, scale, sides}` |
| `song.list` | Charts con counts player/opponent |
| `song.chart` | `[{t,lane,l,side}, …]`. `side`: `player` (default), `opponent`, `all` |

Errores: texto `error: …`. Un cliente debe comprobar el prefijo.

`game.status` y `observe` devuelven el mismo objeto. Se mantienen dos
nombres para no romper clientes viejos.
