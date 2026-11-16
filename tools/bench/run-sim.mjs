// Modo A: partida headless con JugadorBot vía simular() (sin browser ni relay).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerChart } from "../../web/motor/chart.js";
import { JugadorBot, PERFILES } from "../../web/jugadores/bot.js";
import { leerJSON, simular } from "../../tests/js/ayuda.mjs";
import { runDesdeResumen, aggregate } from "./collect.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PERFILES_OK = new Set([...Object.keys(PERFILES), "personalizado"]);

export function resolverChart(cancion, dificultad) {
  const rel = `web/canciones/${cancion}.json`;
  const raw = leerJSON(rel);
  return leerChart(raw, dificultad);
}

/**
 * @param {object} opts
 * @param {string} opts.perfil
 * @param {number} [opts.semilla]
 * @param {string} opts.song
 * @param {string} opts.difficulty
 * @param {number} [opts.runs]
 */
export async function runSim({
  perfil = "perfecto",
  semilla = 7,
  song = "luz-de-neon",
  difficulty = "hard",
  runs = 1,
} = {}) {
  if (!PERFILES_OK.has(perfil) && perfil !== "perfecto") {
    // perfecto está en PERFILES; personalizado también
  }
  if (!PERFILES_OK.has(perfil)) {
    throw Object.assign(new Error(`perfil desconocido: ${perfil} (válidos: ${[...PERFILES_OK].join(", ")})`), { code: 2 });
  }

  const chart = resolverChart(song, difficulty);
  const results = [];
  const configBase = {
    mode: "sim",
    song,
    difficulty,
    perfil,
    seed: semilla,
    delayMs: 0,
    agent: `bot:${perfil}`,
  };

  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    try {
      const seed = semilla + i;
      const { resumen, eventos } = simular(chart, new JugadorBot({ perfil, semilla: seed }));
      const offsets = eventos
        .filter((e) => e.tipo === "juicio" && e.desfase != null)
        .map((e) => e.desfase);
      results.push(runDesdeResumen(resumen, {
        offsets,
        durationMsWall: Date.now() - t0,
        config: { ...configBase, seed, run: i + 1 },
      }));
    } catch (e) {
      results.push(runDesdeResumen(null, {
        durationMsWall: Date.now() - t0,
        config: { ...configBase, seed: semilla + i, run: i + 1 },
        infraError: String(e?.message || e),
      }));
    }
  }

  return {
    results,
    aggregate: aggregate(results, { config: configBase }),
  };
}

export { RAIZ, PERFILES_OK };
