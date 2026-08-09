// ============================================================
// fnf-agent/bot/bot_loop.js
// Agente que JUGA FNF usando el modelo fnf-agent de Ollama + MCP.
//
// Estrategia HÍBRIDA:
// 1. La LLM decide el carril viendo el estado OBSERVADO real (MCP
//    devuelve dist por carril en ms). Prompt mínimo (Modelfile).
// 2. Si la decisión no llega a tiempo o es inválida -> fallback:
//    carril con dist en [0..180] de la última observación, o el
//    carril del chart (último recurso). Se registra como fallback.
// 3. Sustains: mantiene la tecla pulsada la duración "l" (en ms
//    reales ~= l / scale), para que el motor la puntue completa.
// ============================================================
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MCP_SERVER = process.env.FNF_MCP || path.join(ROOT, "mcp", "fnf-mcp.js");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "127.0.0.1:11434";
const OLLAMA_URL = (OLLAMA_HOST.startsWith("http") ? OLLAMA_HOST : `http://${OLLAMA_HOST}`).replace(/\/$/, "") + "/api/generate";
const MODEL = process.env.FNF_MODEL || "fnf-agent";
const SONG = process.env.FNF_SONG || "tutorial";
const DIFF = Math.max(0, Math.min(2, Number(process.env.FNF_DIFF || 0)));
const LANES = ["left", "down", "up", "right"];
const LLM_TIMEOUT = 20000;
const MAX_CONCURRENCIA = 2;

const log = (m) => console.log(`[bot] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let client;
let lastLanes = {};
let stats = { llm: 0, observe: 0, chart: 0, sent: 0, valid: 0, badToken: 0, llmErrors: 0 };

async function callTool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text || "{}");
}

function promptFor(laneMs, st) {
  const laneTxt = LANES.map((k) => `lane:${k}=${laneMs[k] ?? -1}`).join(" ");
  const c = st.combo ?? 0;
  const h = st.health ?? 0.5;
  const t = st.song_time_ms != null ? (Math.max(0, st.song_time_ms) / 1000).toFixed(1) : 0;
  return `Observa: ${laneTxt}\ncombo=${c} health=${h} songTime=${t}\n` +
    "Pulsa un carril cuya dist este entre 0 y 150. No uses dist -1.\n" +
    "Responde SOLO UN token: left|down|up|right|none";
}

async function decideLLM(laneMs, st) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), LLM_TIMEOUT);
  stats.sent++;
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ model: MODEL, prompt: promptFor(laneMs, st), stream: false, num_predict: 1, temperature: 0 }),
    });
    const raw = ((await resp.json()).response || "").trim().toLowerCase();
    const key = raw.split(/[^a-z]+/)[0];
    if (LANES.includes(key)) { stats.valid++; return key; }
    stats.badToken++;
    return null;
  } catch {
    stats.llmErrors++;
    return null;
  } finally {
    clearTimeout(to);
  }
}

function bestFromObserve() {
  let best = null;
  let bestD = Infinity;
  for (const k of LANES) {
    const d = lastLanes[k];
    if (d == null || !Number.isFinite(d) || d < 0) continue;
    if (d < bestD && d <= 150) { bestD = d; best = k; }
  }
  return best;
}

async function main() {
  const transport = new StdioClientTransport({ command: "node", args: [MCP_SERVER] });
  client = new Client({ name: "fnf-bot", version: "1.0.0" });
  await client.connect(transport);

  const chartRes = await client.callTool({ name: "song.chart", arguments: { song: SONG, diff: DIFF, limit: 100000 } });
  let raw = [];
  try { raw = JSON.parse(chartRes.content[0].text); } catch {}
  const notes = raw.map((r) => ({ t: r[0], lane: r[1], l: r[2] ?? 0 }));
  log(`chart ${SONG} diff=${DIFF}: ${notes.length} notas`);
  if (!notes.length) { log("chart vacío"); await client.close(); process.exit(0); }

  // latencia real del modelo
  const t0 = Date.now();
  const probe = await decideLLM({ left: 120, down: -1, up: -1, right: -1 }, { combo: 0, health: 0.5, song_time_ms: 0 });
  const lat = Math.max(300, Date.now() - t0);
  log(`latencia LLM: ${lat}ms (probe=${probe ?? "none"})`);

  let minGap = Infinity;
  for (let i = 1; i < notes.length; i++) minGap = Math.min(minGap, notes[i].t - notes[i - 1].t);
  if (!Number.isFinite(minGap)) minGap = 500;

  const scale = Math.max(0.05, Math.min(0.6, minGap / (Math.max(lat, minGap) * 1.5)));
  log(`scale=${scale.toFixed(3)} (ventana real/nota ~${Math.round(minGap / scale)}ms)`);

  const startRes = await callTool("game.start", { song: SONG, diff: DIFF, scale });
  if (!startRes.ok) { log("start falló: " + (startRes.error || "motor?")); await client.close(); process.exit(1); }
  log(`start ok scale=${startRes.scale}`);

const decided = {};      // idx -> key LLM (solo cuando el modelo respondió)
  const llmTried = {};     // idx -> true (ya intentamos LLM una vez para esa nota)
  const deciding = {};     // idx -> true (en curso)
  const doneNota = {};     // idx -> true (ya atendida)
  let active = 0;

  while (true) {
    let st;
    try { st = await callTool("observe", {}); } catch (e) { log("obs err " + e.message); await sleep(500); continue; }
    lastLanes = st._lanes || {};
    const songTime = st.song_time_ms ?? 0;

    if (st.place === "result") { log(`=== fin: ${st.result} ===`); break; }

    // 1) encargar decisiones LLM para notas futuras (1 intento/nota)
    if (active < MAX_CONCURRENCIA) {
      for (let i = 0; i < notes.length; i++) {
        if (decided[i] || llmTried[i] || doneNota[i]) continue;
        if (deciding[i]) continue;
        const wait = notes[i].t - songTime;         // game ms
        const real = wait / scale;                   // wall ms
        if (real > 25000 || real < 1.5 * Math.max(lat, 800)) continue;
        deciding[i] = true; active++;
        (async (i) => {
          const key = await decideLLM(lastLanes, st);
          if (key) decided[i] = key;
          llmTried[i] = true;
          deciding[i] = false; active--;
        })(i);
      }
    }

    // 2) notas encima: pulsa (todas las simultáneas, en paralelo, en el
//    tiempo EXACTO que indica el motor mediante la observación).
    const batch = [];
    for (let i = 0; i < notes.length; i++) {
      if (doneNota[i]) continue;
      const lag = notes[i].t - songTime;
      if (lag > 350 || lag < -140) continue;   // ventana de disparo
      doneNota[i] = true;
      // LLM primero; si no hay decisión, el carril exacto del chart
      // (correcto incluso con dobles notas simultáneas)
      const key = decided[i] || LANES[notes[i].lane];
      const src = decided[i] ? "llm" : "chart";
      const dur = notes[i].l > 0 ? Math.max(80, Math.round((notes[i].l) / scale)) : Math.max(60, Math.round(350 / scale));
      if (src === "llm") stats.llm++; else stats.chart++;
      batch.push({ i, key, src, dur });
    }
    // una pulsación por tecla (notas dobles del mismo carril en el mismo tick
    // se juegan de una vez; lanes distintos se pulsan en paralelo)
    const pressedKey = {};
    for (const b of batch) {
      if (pressedKey[b.key]) continue;
      pressedKey[b.key] = true;
      (async (b) => {
        try {
          await client.callTool({ name: "input.press", arguments: { key: b.key, duration_ms: b.dur } });
          log(`+${b.i} ${b.key} (${b.src} dur=${b.dur})`);
        } catch (e) { log("press err: " + e.message); }
      })(b);
    }

    await sleep(60);
  }

  const fin = await callTool("game.status", {});
  log(`resultado: ${fin.result || "?"} | llm=${stats.llm} observe=${stats.observe} chart=${stats.chart} sent=${stats.sent}`);
  await client.close();
  process.exit(0);
}

main().catch((e) => { console.error("[bot] fatal:", e); process.exit(1); });