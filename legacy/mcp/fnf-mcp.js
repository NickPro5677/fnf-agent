// Servidor MCP (stdio). Clientes externos; el bot local usa el socket directo.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { engineCall, sleep } from "../bot/lib/engine.js";
import { loadChartFile, parseNotes, listCharts } from "../bot/lib/chart.js";

const server = new McpServer({
  name: "fnf-mcp",
  version: "3.0.0",
});

function text(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] };
}

function err(e) {
  return text(`error: ${e.message}`);
}

server.tool(
  "observe",
  "Estado del motor: tiempo, juicios, lanes (ms), holds (ms de sustain restante), health, sides.",
  {},
  async () => {
    try { return text(await engineCall({ cmd: "status" })); } catch (e) { return err(e); }
  },
);

server.tool(
  "game.status",
  "Alias de observe. Estado completo del motor.",
  {},
  async () => {
    try { return text(await engineCall({ cmd: "status" })); } catch (e) { return err(e); }
  },
);

server.tool(
  "input.press",
  "Pulsa una tecla durante duration_ms. key: left|down|up|right",
  { key: z.string(), duration_ms: z.number().optional() },
  async ({ key, duration_ms = 120 }) => {
    try {
      await engineCall({ cmd: "key", key, down: true });
      await sleep(Math.max(20, Number(duration_ms)));
      await engineCall({ cmd: "key", key, down: false });
      return text({ ok: true, key, duration_ms });
    } catch (e) { return err(e); }
  },
);

server.tool(
  "input.key",
  "Suelta o mantiene una tecla. down: true|false. Control fino de sustains.",
  { key: z.string(), down: z.boolean() },
  async ({ key, down }) => {
    try {
      await engineCall({ cmd: "key", key, down });
      return text({ ok: true, key, down });
    } catch (e) { return err(e); }
  },
);

server.tool(
  "game.start",
  "Inicia sesión. song, diff 0-2, scale, sides=player|both.",
  {
    song: z.string(),
    diff: z.number().optional(),
    scale: z.number().optional(),
    sides: z.string().optional(),
  },
  async ({ song, diff = 0, scale = 0.25, sides = "player" }) => {
    try {
      return text(await engineCall({ cmd: "start", song, diff, scale, sides }));
    } catch (e) { return err(e); }
  },
);

server.tool(
  "song.list",
  "Lista charts disponibles con recuentos player/opponent por dificultad.",
  {},
  async () => {
    try { return text({ charts: listCharts() }); } catch (e) { return err(e); }
  },
);

server.tool(
  "song.chart",
  "Notas del chart: {t,lane,l,side}. side=player|opponent|all (default player).",
  {
    song: z.string(),
    diff: z.number().optional(),
    side: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ song, diff = 0, side = "player", limit = 10 }) => {
    try {
      const chart = loadChartFile(song);
      const parseSides = side === "player" ? "player" : "both";
      let notes = parseNotes(chart, diff, parseSides);
      if (side === "opponent") notes = notes.filter((n) => n.side === "opponent");
      if (side === "player") notes = notes.filter((n) => n.side === "player");
      return text(notes.slice(0, limit));
    } catch (e) { return err(e); }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[fnf-mcp] listo y conectado.");
