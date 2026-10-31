#!/usr/bin/env node
// Servidor MCP opcional: deja que un cliente MCP (por ejemplo un asistente de IA) juegue
// conectándose al relay como un agente más. Necesita Node 22+ (WebSocket incluido).
//   python agente/relay.py &
//   node mcp/fnf-mcp.js            (lo arranca tu cliente MCP por stdio)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const URL_RELAY = process.env.FNF_RELAY || "ws://127.0.0.1:8765";
let ws = null;
let ultimoEstado = null;
let ultimoChart = null;
let ultimoResultado = null;

function conectar() {
  return new Promise((ok, mal) => {
    if (ws && ws.readyState === 1) return ok();
    ws = new WebSocket(URL_RELAY);
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", role: "agent", name: "MCP" }));
    ws.onerror = () => mal(new Error(`No pude conectar a ${URL_RELAY}. ¿Corre agente/relay.py?`));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "welcome") ok();
      if (m.type === "state") ultimoEstado = m;
      if (m.type === "chart") { ultimoChart = m; ultimoResultado = null; }
      if (m.type === "result") ultimoResultado = m;
    };
  });
}

const texto = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] });
const server = new McpServer({ name: "fnf-agent", version: "4.0.0" });

server.tool("juego_estado", "Último estado del juego: tiempo, próximas notas, vida, puntos y resultado.", {}, async () => {
  await conectar();
  return texto({ estado: ultimoEstado, resultado: ultimoResultado, hayChart: !!ultimoChart });
});

server.tool("juego_chart", "Notas que debe tocar el jugador en la canción actual (t en ms, lane 0-3, l = duración de nota larga).", {}, async () => {
  await conectar();
  return texto(ultimoChart || "Todavía no empezó ninguna canción con 'IA externa'.");
});

server.tool("juego_tecla", "Pulsar o soltar un carril (0 izquierda, 1 abajo, 2 arriba, 3 derecha).",
  { lane: z.number().int().min(0).max(3), down: z.boolean(), why: z.string().max(120).optional() },
  async ({ lane, down, why }) => {
    await conectar();
    ws.send(JSON.stringify({ type: "key", lane, down, why: why || "MCP" }));
    return texto("ok");
  });

server.tool("juego_pensar", "Mostrar un pensamiento en el panel de la IA del juego.", { texto: z.string().max(200) }, async ({ texto: t }) => {
  await conectar();
  ws.send(JSON.stringify({ type: "think", text: t }));
  return texto("ok");
});

await server.connect(new StdioServerTransport());
