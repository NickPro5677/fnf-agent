// ============================================================
// fnf-agent/bot/bot_loop.js
// Autoplayer de reglas. Lee el chart oficial (su memoria) y pulsa
// cada nota en su ventana usando el reloj del motor (observe).
//
// Sin LLM: la decisión es determinista y exacta (carril + tiempo del
// chart sincronizado con song_time del motor). El motor valida cada
// golpe con sus ventanas: tardío/temprano = miss, en ventana = hit.
//
// Mecánica de pulsación por carril:
//   - engagement: tecla baja cuando la nota llega a `LEAD` ms; sube
//     cuando la última nota del engagement termina (+slack).
//   - Los sustains se mantienen hasta t + l (+slack): el motor puntúa
//     el sustain completo.
//   - Notas consecutivas del mismo carril comparten el hold (el motor
//     puntúa cada ventana con la tecla abajo) -> no se pierden.
// ============================================================
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MCP_SERVER = process.env.FNF_MCP || path.join(ROOT, "mcp", "fnf-mcp.js");
const SONG = process.env.FNF_SONG || "tutorial";
const DIFF = Math.max(0, Math.min(2, Number(process.env.FNF_DIFF || 0)));
const LANES = ["left", "down", "up", "right"];
const LANE_INDEX = Object.fromEntries(LANES.map((k, i) => [k, i]));

// --- parámetros de timing (ms del juego) ---
const LEAD = 200;            // cuánto antes pulsar la nota (está dentro de ventana buena ±150)
const RELEASE_SLACK = 120;   // cuánto pasar del final de la nota antes de soltar
const MISS_EDGE = -150;      // por debajo de esto la nota ya murió (ventana de miss del motor)
const LOOP_MS = 40;          // cadencia del bucle (real)

const log = (m) => console.log(`[bot] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let client;
const stats = { played: 0, sustained: 0 };
// por carril: { down, releaseAt }  (releaseAt = ms real del reloj del bot)
const lane = Object.fromEntries(LANES.map((k) => [k, { down: false, releaseAt: 0 }]));

async function callTool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text || "{}";
  if (text.startsWith("error:")) throw new Error(text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`respuesta no JSON de ${name}: ${text.slice(0, 120)}`);
  }
}

async function keyDown(key) {
  try { await callTool("input.key", { key, down: true }); } catch (e) { log(`keyDown err: ${e.message}`); }
}

async function keyUp(key) {
  try { await callTool("input.key", { key, down: false }); } catch (e) { log(`keyUp err: ${e.message}`); }
}

function endGameMs(t, l) {
  return t + l + RELEASE_SLACK;
}

async function main() {
  const transport = new StdioClientTransport({ command: "node", args: [MCP_SERVER] });
  client = new Client({ name: "fnf-bot", version: "2.0.0" });
  await client.connect(transport);

  const chartRes = await client.callTool({ name: "song.chart", arguments: { song: SONG, diff: DIFF, limit: 100000 } });
  let raw = [];
  try { raw = JSON.parse(chartRes.content[0].text); } catch {}
  if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) {
    raw = raw.map((r) => ({ t: r[0], lane: r[1], l: r[2] ?? 0 }));
  }
  const notes = raw
    .filter((n) => n.t != null && n.lane != null)
    .sort((a, b) => a.t - b.t)
    .map((n) => ({ t: n.t, lane: n.lane % LANES.length, l: n.l || 0 }));
  log(`chart ${SONG} diff=${DIFF}: ${notes.length} notas`);
  if (!notes.length) { log("chart vacío"); await client.close(); process.exit(1); }

  let minGap = Infinity;
  for (let i = 1; i < notes.length; i++) minGap = Math.min(minGap, notes[i].t - notes[i - 1].t);
  if (!Number.isFinite(minGap)) minGap = 450;

  const autoScale = Math.max(0.25, Math.min(1.0, minGap / 450));
  const scale = Math.max(0.05, Number(process.env.FNF_SCALE || autoScale));
  log(`scale=${scale.toFixed(3)} (⌥ auto=${autoScale.toFixed(3)} por minGap ${minGap}ms)`);

  const startRes = await callTool("game.start", { song: SONG, diff: DIFF, scale });
  if (!startRes.ok) { log(`start falló: ${startRes.error || "motor?"}`); await client.close(); process.exit(1); }
  log(`start ok (${SONG} diff=${DIFF} scale=${scale})`);

  const done = new Array(notes.length).fill(false);
  let result = "";
  const t0 = Date.now();

  while (true) {
    let st;
    try { st = await callTool("observe", {}); }
    catch (e) { log(`obs err: ${e.message}`); await sleep(500); continue; }

    const songTime = (st.song_time_ms ?? 0);
    if (st.place === "result") { result = st.result || "result"; break; }
    if (st.place !== "playing") { await sleep(100); continue; }

    const now = Date.now();

    // 1) soltar teclas cuyo engagement terminó
    for (const key of LANES) {
      const L = lane[key];
      if (L.down && L.releaseAt > 0 && now >= L.releaseAt) {
        L.down = false; L.releaseAt = 0;
        await keyUp(key);
      }
    }

    // 2) programar pulsaciones para notas pendientes
    for (let i = 0; i < notes.length; i++) {
      if (done[i]) continue;
      const note = notes[i];
      const lag = note.t - songTime;
      const keyName = LANES[note.lane];
      if (lag > LEAD) continue;
      if (lag < MISS_EDGE) { done[i] = true; continue; }

      const releaseAt = now + Math.max(10, (endGameMs(note.t, note.l) - songTime) / scale);
      const L = lane[keyName];

      if (L.down) {
        if (releaseAt > L.releaseAt) L.releaseAt = releaseAt;  // extiende el hold
      } else {
        L.down = true; L.releaseAt = releaseAt;
        await keyDown(keyName);
      }
      if (note.l > 0) stats.sustained++;
      stats.played++;
      done[i] = true;
    }

    await sleep(LOOP_MS);
  }

  const fin = await callTool("game.status", {});
  const kp = (Date.now() - t0) / 60000;
  log(`=== ${result} ===`);
  log(`resultado: ${fin.result || result} | notas=${stats.played} sustains=${stats.sustained} | ${kp.toFixed(1)} min`);
  await client.close();
  process.exit(0);
}

main().catch((e) => { console.error("[bot] fatal:", e); process.exit(1); });