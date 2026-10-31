// Autoplayer con memoria del chart. Pulsa en ventana y mantiene sustains.
import { loadPlayable, LANES } from "../lib/chart.js";
import { sleep } from "../lib/engine.js";

const LEAD = 40;
const RELEASE_SLACK = 80;
const MISS_EDGE = -135;
const LOOP_MS = 40;

export async function run(ctx) {
  const { engine, log, env } = ctx;
  const notes = loadPlayable(env.song, env.diff, env.sides);
  log(`chart ${env.song} diff=${env.diff} sides=${env.sides}: ${notes.length} notas`);
  if (!notes.length) {
    log("chart vacío");
    process.exit(1);
  }

  let minGap = Infinity;
  for (let i = 1; i < notes.length; i++) {
    minGap = Math.min(minGap, notes[i].t - notes[i - 1].t);
  }
  if (!Number.isFinite(minGap)) minGap = 450;

  const autoScale = Math.max(0.25, Math.min(1.0, minGap / 450));
  const scale = env.scale != null ? env.scale : autoScale;
  log(`scale=${scale.toFixed(3)} (auto=${autoScale.toFixed(3)} minGap=${minGap}ms)`);

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
  log(`start ok (${env.song} diff=${env.diff} sides=${env.sides} scale=${scale})`);

  const lane = Object.fromEntries(LANES.map((k) => [k, { down: false, releaseAt: 0 }]));
  const done = new Array(notes.length).fill(false);
  const stats = { played: 0, sustained: 0 };
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

    const songTime = st.song_time_ms ?? 0;
    if (st.place === "result") {
      result = st.result || "result";
      break;
    }
    if (st.place !== "playing") {
      await sleep(100);
      continue;
    }

    const now = Date.now();
    for (const key of LANES) {
      const L = lane[key];
      if (L.down && L.releaseAt > 0 && now >= L.releaseAt) {
        L.down = false;
        L.releaseAt = 0;
        try { await engine.call({ cmd: "key", key, down: false }); } catch (e) { log(`keyUp: ${e.message}`); }
      }
    }

    for (let i = 0; i < notes.length; i++) {
      if (done[i]) continue;
      const note = notes[i];
      const lag = note.t - songTime;
      const keyName = LANES[note.lane];
      if (lag > LEAD) continue;
      if (lag < MISS_EDGE) {
        done[i] = true;
        continue;
      }
      const releaseAt = now + Math.max(10, (note.t + note.l + RELEASE_SLACK - songTime) / scale);
      const L = lane[keyName];
      if (L.down) {
        if (releaseAt > L.releaseAt) L.releaseAt = releaseAt;
      } else {
        L.down = true;
        L.releaseAt = releaseAt;
        try { await engine.call({ cmd: "key", key: keyName, down: true }); } catch (e) { log(`keyDown: ${e.message}`); }
      }
      if (note.l > 0) stats.sustained++;
      stats.played++;
      done[i] = true;
    }

    await sleep(LOOP_MS);
  }

  const fin = await engine.call({ cmd: "status" });
  const kp = (Date.now() - t0) / 60000;
  log(`=== ${result} ===`);
  log(`resultado: ${fin.result || result} | notas=${stats.played} sustains=${stats.sustained} | ${kp.toFixed(1)} min`);
}
