import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RAIZ } from "./ayuda.mjs";

const PUERTO = 8700 + Math.floor(Math.random() * 200);
const URL_RELAY = `ws://127.0.0.1:${PUERTO}`;

function esperarMensaje(ws, tipo) {
  return new Promise((ok) => ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === tipo) ok(m); }));
}

test("MCP: un cliente MCP habla con el juego a través del relay", async (t) => {
  const relay = spawn("python3", [path.join(RAIZ, "agente/relay.py"), "--port", String(PUERTO)], { stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => relay.kill());
  await new Promise((ok) => relay.stdout.on("data", (d) => String(d).includes("listo") && ok()));

  const juego = new WebSocket(URL_RELAY);
  await new Promise((ok) => { juego.onopen = ok; });
  juego.send(JSON.stringify({ type: "hello", role: "game", name: "test" }));
  await esperarMensaje(juego, "welcome");

  const cliente = new Client({ name: "test", version: "1.0.0" });
  await cliente.connect(new StdioClientTransport({ command: "node", args: [path.join(RAIZ, "mcp/fnf-mcp.js")], env: { ...process.env, FNF_RELAY: URL_RELAY } }));
  t.after(() => cliente.close());

  const { tools } = await cliente.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ["juego_chart", "juego_estado", "juego_pensar", "juego_tecla"]);

  const llegaTecla = esperarMensaje(juego, "key");
  await cliente.callTool({ name: "juego_tecla", arguments: { lane: 1, down: true, why: "prueba" } });
  const k = await llegaTecla;
  assert.equal(k.lane, 1);
  assert.equal(k.from, "MCP");

  juego.send(JSON.stringify({ type: "state", t: 42, playing: true }));
  await new Promise((r) => setTimeout(r, 150));
  const r = await cliente.callTool({ name: "juego_estado", arguments: {} });
  assert.equal(JSON.parse(r.content[0].text).estado.t, 42);
  juego.close();
});
