// ============================================================
// fnf-agent/mcp/fnf-mcp.js
// Servidor MCP (stdio). Expone las herramientas del agente:
//   - observe       : estado simbólico del motor (distancias por carril)
//   - input.press   : inyecta una tecla (flecha) con duración
//   - game.start    : inicia sesión (song, diff, scale)
//   - game.status   : estado completo del motor
//   - song.chart    : lista de notas desde el chart oficial
// Puente: motor FNF (unix socket).
// ============================================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FNF_ROOT || path.resolve(__dirname, "..");
const SOCKET = process.env.FNF_SOCK || path.join(ROOT, "env", "run", "engine.sock");
const CHARTS = process.env.FNF_CHARTS_DIR || path.join(ROOT, "env", "charts");

// ---------- puente al motor ----------
function engineCall(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET);
    let buf = "";
    const to = setTimeout(() => {
      sock.destroy();
      reject(new Error(`engine timeout (${payload.cmd})`));
    }, timeoutMs);
    sock.on("connect", () => sock.write(JSON.stringify(payload) + "\n"));
    sock.on("data", (d) => {
      buf += d.toString();
      if (buf.includes("\n")) {
        clearTimeout(to);
        sock.end();
        const line = buf.split("\n")[0];
        resolve(JSON.parse(line || "{}"));
      }
    });
    sock.on("error", (e) => {
      clearTimeout(to);
      reject(new Error(`engine socket: ${e.message}`));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const server = new McpServer({
  name: "fnf-mcp",
  version: "1.0.0",
});

// ---------- observe ----------
server.tool(
  "observe",
  "Devuelve el estado simbólico del motor: distancia de la flecha por carril (dist en ms, -1 = sin flecha), combo, salud, canción, tiempo y lugar.",
  { },
  async () => {
    try {
      const st = await engineCall({ cmd: "status" });
      return {
        content: [
          { type: "text", text: JSON.stringify({ ...st }) },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

// ---------- input.press ----------
server.tool(
  "input.press",
  "Pulsa una tecla durante `duration_ms` milisegundos. key: left|down|up|right",
  { key: z.string(), duration_ms: z.number().optional() },
  async ({ key, duration_ms = 120 }) => {
    try {
      await engineCall({ cmd: "key", key, down: true });
      await sleep(Math.max(20, Number(duration_ms)));
      await engineCall({ cmd: "key", key, down: false });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, key, duration_ms }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

// ---------- input.key ----------
server.tool(
  "input.key",
  "Suelta o mantiene una tecla (left|down|up|right). `down`: true = pulsada, false = soltada. Control fino para sustains.",
  { key: z.string(), down: z.boolean() },
  async ({ key, down }) => {
    try {
      await engineCall({ cmd: "key", key, down });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, key, down }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

// ---------- game.start ----------
server.tool(
  "game.start",
  "Inicia una sesión de juego. song: nombre del chart (tutorial, bopeebo). diff: 0 easy, 1 normal, 2 hard. scale: factor de tiempo (0.25 = modo lento).",
  { song: z.string(), diff: z.number().optional(), scale: z.number().optional() },
  async ({ song, diff = 0, scale = 0.25 }) => {
    try {
      const res = await engineCall({ cmd: "start", song, diff, scale });
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

// ---------- game.status ----------
server.tool(
  "game.status",
  "Estado actual del motor: canción, tiempo, combo, health, lugar (menu/playing/result).",
  {},
  async () => {
    try {
      const res = await engineCall({ cmd: "status" });
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

// ---------- song.chart ----------
server.tool(
  "song.chart",
  "Lista las notas próximas del chart oficial de la canción (hasta `limit`). Formato: [tiempo_ms, carril 0-3, longitud_sustain_ms].",
  { song: z.string(), diff: z.number().optional(), limit: z.number().optional() },
  async ({ song, diff = 2, limit = 10 }) => {
    try {
      const file = `${CHARTS}/${song}-chart.json`;
      if (!fs.existsSync(file)) {
        return { content: [{ type: "text", text: `chart no existe: ${file}` }] };
      }
      const chart = JSON.parse(fs.readFileSync(file, "utf8"));
      const diffKey = ["easy", "normal", "hard"][Math.min(diff, 2)];
      const notes = (chart.notes?.[diffKey] || []).map((n) => [n.t, n.d % 4, n.l ?? 0]);
      return {
        content: [{ type: "text", text: JSON.stringify(notes.slice(0, limit)) }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `error: ${e.message}` }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[fnf-mcp] listo y conectado.");