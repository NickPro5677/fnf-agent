// Agente reactivo: no lee el chart. Usa lanes + holds del motor.
import { LANES } from "../lib/chart.js";
import { sleep } from "../lib/engine.js";

const PRESS_MS = Number(process.env.FNF_PRESS_MS || 50);
const LOOP_MS = 25;

export async function run(ctx) {
  const { engine, log, env } = ctx;
  const scale = env.scale != null ? env.scale : 0.5;
  log(`observe ${env.song} diff=${env.diff} sides=${env.sides} scale=${scale} press≤${PRESS_MS}ms`);

  const startRes = await engine.call({
    cmd: "start",
    song: env.song,
    diff: env.diff,
    scale,
    sides: env.sides,
  });
  if (!startRes.ok) {
    log(`start falló: ${startRes.error || "motor?"}`);
    process.exit(1);
  }

  const down = Object.fromEntries(LANES.map((k) => [k, false]));
  const stats = { presses: 0 };
  const t0 = Date.now();
  let result = "";

  while (true) {
    let st;
    try {
      st = await engine.call({ cmd: "status" });
    } catch (e) {
      log(`obs err: ${e.message}`);
      await sleep(500);
      continue;
    }

    if (st.place === "result") {
      result = st.result || "result";
      break;
    }
    if (st.place !== "playing") {
      await sleep(100);
      continue;
    }

    const lanes = st.lanes || {};
    const holds = st.holds || {};

    for (const key of LANES) {
      const lag = Number(lanes[key]);
      const hold = Number(holds[key]);
      const inWindow = Number.isFinite(lag) && lag >= 0 && lag <= PRESS_MS;
      const holding = Number.isFinite(hold) && hold >= 0;

      if (!down[key] && inWindow) {
        down[key] = true;
        stats.presses++;
        try { await engine.call({ cmd: "key", key, down: true }); } catch (e) { log(`keyDown: ${e.message}`); }
        continue;
      }
      if (down[key] && !holding && !inWindow) {
        down[key] = false;
        try { await engine.call({ cmd: "key", key, down: false }); } catch (e) { log(`keyUp: ${e.message}`); }
      }
    }

    await sleep(LOOP_MS);
  }

  for (const key of LANES) {
    if (down[key]) {
      try { await engine.call({ cmd: "key", key, down: false }); } catch { /* */ }
    }
  }

  const fin = await engine.call({ cmd: "status" });
  const kp = (Date.now() - t0) / 60000;
  log(`=== ${result} ===`);
  log(`resultado: ${fin.result || result} | presses=${stats.presses} | ${kp.toFixed(1)} min`);
}
