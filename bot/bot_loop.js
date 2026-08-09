// ============================================================
// fnf-agent/bot/bot_loop.js
// Agente mínimo que JUEGA FNF usando el modelo fnf-agent de
// Ollama y las herramientas del servidor MCP (fnf-mcp).
//
// Estrategia (por la latencia del teléfono, Ollama tarda varios
// segundos por decisión): el agente mide la latencia, ajusta la
// escala de tiempo para que la separacion entre notas quepa en
// la decision, decide cada nota pendiente con UNA llamadilla y
// usa las herramientas => tool("song.chart"), tool("observe"),
// tool("input.press").
// ============================================================
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MCP_SERVER = process.env.FNF_MCP || path.join(ROOT, "mcp", "fnf-mcp.js");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "127.0.0.1:11434";
const OLLAMA = (OLLAMA_HOST.startsWith("http") ? OLLAMA_HOST : `http://${OLLAMA_HOST}`).replace(/\/$/, "") + "/api/generate";
const MODEL = process.env.FNF_MODEL || "fnf-agent";
const SONG = process.env.FNF_SONG || "tutorial";
const DIFF = Number(process.env.FNF_DIFF || 0); // 0 easy
const LANES = ["left", "down", "up", "right"];

const log = (m) => console.log(`[bot] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function decideKey(notesIdx) {
  const target = LANES[notesIdx];
  const text = `Objetivo = ${target}. Contesta solo el nombre del objetivo.`;
  const resp = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: text, stream: false, num_predict: 1 }),
  });
  const data = await resp.json();
  const raw = (data.response || "").trim().toLowerCase();
  const key = raw.split(/[^a-z]+/)[0];
  return LANES.includes(key) ? key : "none";
}

async function main() {
  const transport = new StdioClientTransport({ command: "node", args: [MCP_SERVER] });
  const client = new Client({ name: "fnf-bot", version: "1.0.0" });
  await client.connect(transport);

  const chartRes = await client.callTool({ name: "song.chart", arguments: { song: SONG, diff: DIFF, limit: 400 } });
  const notes = JSON.parse(chartRes.content[0].text); // [[t_ms, laneIdx]]
  log(`chart ${SONG}: ${notes.length} notas`);

  let minGap = Infinity;
  for (let i = 1; i < notes.length; i++) minGap = Math.min(minGap, notes[i][0] - notes[i - 1][0]);
  minGap = Number.isFinite(minGap) ? minGap : 500;

  // medir latencia real (una decisión de prueba, sin nota real)
  const t0 = Date.now();
  await decideKey(notes[0][1]);
  const latencyMs = Math.max(500, Date.now() - t0);
  log(`latencia del modelo: ${latencyMs}ms`);

  const scale = Math.max(0.05, Math.min(0.6, minGap / (latencyMs * 1.5)));
  log(`escala de tiempo: ${scale.toFixed(3)} (separacion de notas ${minGap}ms) -> wall/nota ~${(minGap / scale).toFixed(0)}ms`);

  const startRes = await client.callTool({ name: "game.start", arguments: { song: SONG, diff: DIFF, scale } });
  log(`start: ${startRes.content[0].text}`);

  const decided = {};
  const pressed = {};
  const decisionPromises = {};
  let failures = 0;

  while (true) {
    const obsRes = await client.callTool({ name: "observe", arguments: {} });
    const st = JSON.parse(obsRes.content[0].text);
    const songTime = st.song_time_ms;

    if (st.place === "result") {
      log(`=== fin: ${st.result} ===`);
      break;
    }

    // 1) Programar decisiones en segundo plano (no bloquear el juego).
    for (let i = 0; i < notes.length; i++) {
      if (decided[i] || pressed[i] || decisionPromises[i]) continue;
      const waitGame = notes[i][0] - songTime;
      if (waitGame < 2000) break;   // ya muy cerca, no da tiempo a decidir
      if (waitGame > 20000) break;  // aun demasiado lejos
      decisionPromises[i] = decideKey(notes[i][1])
        .then((k) => { decided[i] = k; delete decisionPromises[i]; })
        .catch(() => { delete decisionPromises[i]; });
      log(`programada decision nota ${i} (${LANES[notes[i][1]]}) gap=${Math.round(waitGame)}ms`);
    }

    // 2) presionar notas que llegan ahora (+-100ms game)
    for (let i = 0; i < notes.length; i++) {
      if (pressed[i]) continue;
      const lag = notes[i][0] - songTime;
      if (lag > 320 || lag < -40) continue;
      pressed[i] = true;
      let key = decided[i];
      if (key && key !== "none") {
        const obs2 = JSON.parse((await client.callTool({ name: "observe", arguments: {} })).content[0].text);
        const dist = obs2.lanes && obs2.lanes[key] && obs2.lanes[key].dist;
        if (dist >= 0) {
          await client.callTool({ name: "input.press", arguments: { key, duration_ms: Math.round(320/scale) } });
          log(`presiona ${key} (nota ${i}) dist=${dist}`);
        } else {
          failures++;
        }
      } else {
        failures++;
      }
    }

    await sleep(300);
  }

  log(`notas no acertadas: ${failures}`);
  const fin = await client.callTool({ name: "game.status", arguments: {} });
  log("resultado final: " + JSON.parse(fin.content[0].text).result);
  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[bot] error:", e);
  process.exit(1);
});