#!/usr/bin/env node
// Servidor MCP opcional: deja que un cliente MCP (por ejemplo un asistente de IA) juegue
// conectándose al relay como un agente más (protocolo v2). Necesita Node 22+ (WebSocket incluido).
//   python agente/relay.py &
//   node mcp/fnf-mcp.js            (lo arranca tu cliente MCP por stdio)
// Token: variable FNF_TOKEN o el archivo ~/.fnf-agent/token que deja el relay. Nunca lo pongas en la config del repo.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_RELAY = process.env.FNF_RELAY || "ws://127.0.0.1:8765";
let ws = null;
let ultimoEstado = null;
let ultimoChart = null;
let ultimoResultado = null;
let capsJuego = [];
let ultimoError = null;
let rtt = null;
const pings = new Map();

function leerToken() {
  if (process.env.FNF_TOKEN) return process.env.FNF_TOKEN;
  try { return fs.readFileSync(path.join(os.homedir(), ".fnf-agent", "token"), "utf8").trim(); } catch { return null; }
}

function conectar() {
  return new Promise((ok, mal) => {
    if (ws && ws.readyState === 1) return ok();
    const token = leerToken();
    if (!token) return mal(new Error("Falta el token del relay: define FNF_TOKEN o arranca agente/relay.py en este equipo."));
    ws = new WebSocket(URL_RELAY);
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", role: "agent", name: "MCP", token, v: 2, caps: ["at", "ping"] }));
    ws.onerror = () => mal(new Error(`No pude conectar a ${URL_RELAY}. ¿Corre agente/relay.py?`));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "welcome" || m.type === "peers") capsJuego = m.game?.caps || [];
      if (m.type === "welcome") ok();
      if (m.type === "error") { ultimoError = m.error; mal(new Error(`El relay dijo: ${m.error}`)); }
      if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", id: m.id, sent: m.sent, to_id: m.from_id }));
      if (m.type === "pong" && pings.has(m.id)) { rtt = performance.now() - pings.get(m.id); pings.delete(m.id); }
      if (m.type === "state") ultimoEstado = m;
      if (m.type === "chart") { ultimoChart = m; ultimoResultado = null; }
      if (m.type === "result") ultimoResultado = m;
    };
  });
}

const texto = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] });
const server = new McpServer({ name: "fnf-agent", version: "4.1.0" });

server.tool("juego_estado", "Último estado del juego: tiempo, próximas notas, vida, puntos y resultado.", {}, async () => {
  await conectar();
  return texto({ estado: ultimoEstado, resultado: ultimoResultado, hayChart: !!ultimoChart, capsJuego, latenciaMs: rtt });
});

server.tool("juego_chart", "Notas que debe tocar el jugador en la canción actual (t en ms, lane 0-3, l = duración de nota larga).", {}, async () => {
  await conectar();
  return texto(ultimoChart || "Todavía no empezó ninguna canción con 'IA externa'.");
});

server.tool("juego_tecla", "Pulsar o soltar un carril (0 izquierda, 1 abajo, 2 arriba, 3 derecha). Con `at` (ms de la canción) la tecla cuenta en ese instante exacto aunque llegue antes.",
  { lane: z.number().int().min(0).max(3), down: z.boolean(), at: z.number().optional(), why: z.string().max(120).optional() },
  async ({ lane, down, at, why }) => {
    await conectar();
    ws.send(JSON.stringify({ type: "key", lane, down, ...(at != null && capsJuego.includes("at") ? { at } : {}), why: why || "MCP" }));
    return texto(at != null && !capsJuego.includes("at") ? "ok (el juego es v1: se ignoró at)" : "ok");
  });

server.tool("juego_latencia", "Mide la ida y vuelta (ms) con el juego mediante ping/pong.", {}, async () => {
  await conectar();
  const id = `mcp${Date.now()}`;
  pings.set(id, performance.now());
  ws.send(JSON.stringify({ type: "ping", id, sent: performance.now() }));
  await new Promise((r) => setTimeout(r, 1500));
  return texto(pings.has(id) ? "Sin respuesta del juego (¿hay una partida con IA externa?)" : { latenciaMs: Math.round(rtt) });
});

server.tool("juego_pensar", "Mostrar un pensamiento en el panel de la IA del juego.", { texto: z.string().max(200) }, async ({ texto: t }) => {
  await conectar();
  ws.send(JSON.stringify({ type: "think", text: t }));
  return texto("ok");
});

await server.connect(new StdioServerTransport());
