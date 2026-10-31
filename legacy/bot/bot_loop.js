#!/usr/bin/env node
// Dispatcher de agentes. FNF_AGENT=chart|observe
import { engineCall } from "./lib/engine.js";

const AGENTS = new Set(["chart", "observe"]);
const AGENT = (process.env.FNF_AGENT || "chart").toLowerCase();
const SONG = process.env.FNF_SONG || "primer-paso";
const DIFF = Math.max(0, Math.min(2, Number(process.env.FNF_DIFF || 0)));
const SIDES = (process.env.FNF_SIDES || "player").toLowerCase() === "both" ? "both" : "player";
const SCALE_RAW = process.env.FNF_SCALE;
const scale = SCALE_RAW === undefined || SCALE_RAW === "" ? null : Math.max(0.05, Number(SCALE_RAW));

const log = (m) => console.log(`[bot:${AGENT}] ${m}`);

if (!AGENTS.has(AGENT)) {
  console.error(`[bot] agente desconocido: ${AGENT} (chart|observe)`);
  process.exit(1);
}

const ctx = {
  engine: { call: engineCall },
  log,
  env: { song: SONG, diff: DIFF, sides: SIDES, scale, agent: AGENT },
};

const mod = await import(`./agents/${AGENT}.js`);
try {
  await mod.run(ctx);
  process.exit(0);
} catch (e) {
  console.error("[bot] fatal:", e);
  process.exit(1);
}
