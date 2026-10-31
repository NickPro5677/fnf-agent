// Parseo de charts FNF v2.0.0: d 0-3 jugador, d 4-7 oponente.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./engine.js";

export const CHARTS = process.env.FNF_CHARTS_DIR || path.join(ROOT, "env", "charts");
export const DIFF_KEYS = ["easy", "normal", "hard"];
export const LANES = ["left", "down", "up", "right"];

export function noteSide(d) {
  return (Number(d) % 8) < 4 ? "player" : "opponent";
}

export function parseNotes(chart, diff = 0, sides = "player") {
  const diffKey = DIFF_KEYS[Math.max(0, Math.min(2, Number(diff) || 0))];
  const raw = chart.notes?.[diffKey] || [];
  const allPlayable = String(sides).toLowerCase() === "both";
  return raw
    .map((n) => {
      const d = n.d ?? 0;
      const side = noteSide(d);
      return {
        t: n.t,
        lane: d % 4,
        l: n.l ?? 0,
        side,
        counts: allPlayable || side === "player",
      };
    })
    .filter((n) => n.t != null)
    .sort((a, b) => a.t - b.t);
}

export function loadChartFile(song) {
  const file = path.join(CHARTS, `${song}-chart.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`chart no existe: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadPlayable(song, diff = 0, sides = "player") {
  return parseNotes(loadChartFile(song), diff, sides).filter((n) => n.counts);
}

export function listCharts() {
  if (!fs.existsSync(CHARTS)) return [];
  return fs.readdirSync(CHARTS)
    .filter((f) => f.endsWith("-chart.json"))
    .sort()
    .map((f) => {
      const name = f.slice(0, -"-chart.json".length);
      const chart = JSON.parse(fs.readFileSync(path.join(CHARTS, f), "utf8"));
      const diffs = {};
      for (const key of DIFF_KEYS) {
        const raw = chart.notes?.[key];
        if (!Array.isArray(raw)) continue;
        const player = raw.filter((n) => noteSide(n.d ?? 0) === "player").length;
        diffs[key] = { total: raw.length, player, opponent: raw.length - player };
      }
      const scroll = chart.scrollSpeed || {};
      return {
        name,
        diffs,
        scroll: typeof scroll === "object" ? (scroll.easy || scroll.base || 1) : 1,
      };
    });
}
