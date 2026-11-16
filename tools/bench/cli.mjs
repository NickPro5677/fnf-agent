#!/usr/bin/env node
/**
 * Banco de pruebas de agentes (fnf-bench).
 *
 *   node tools/bench/cli.mjs protocol --agent autoajuste --retraso 80 --runs 3
 *   node tools/bench/cli.mjs sim --perfil perfecto --cancion luz-de-neon --dificultad hard
 *   node tools/bench/cli.mjs compare runs/a/summary.json runs/b/summary.json
 *   node tools/bench/cli.mjs replay runs/x/run-001.jsonl
 *
 * Exit: 0 ok · 1 umbral fallido · 2 error de infra / uso
 */
import fs from "node:fs";
import path from "node:path";
import { aggregate, assertThresholds, tablaResumen, runDesdeResumen } from "./collect.mjs";
import { runSim } from "./run-sim.mjs";
import { runProtocol, cargarPresets } from "./run-protocol.mjs";
import { compareSummaries, leerSummary } from "./compare.mjs";
import { metricasDesdeTrace } from "./trace.mjs";
import { precision as precisionJuego } from "../../web/motor/juego.js";

function usage(code = 2) {
  const presets = Object.keys(cargarPresets()).join(", ");
  console.error(`Uso:
  node tools/bench/cli.mjs protocol [opts]
  node tools/bench/cli.mjs sim [opts]
  node tools/bench/cli.mjs compare <summaryA.json> <summaryB.json>
  node tools/bench/cli.mjs replay <trace.jsonl>

protocol:
  --agent <preset>        ${presets} (default: autoajuste)
  --agent-script <path>   script libre (.py / .mjs)
  --cancion <id>          default: luz-de-neon
  --dificultad <d>        easy|normal|hard (default: hard)
  --retraso <ms>          latencia simulada en el relay (default: 0)
  --runs <n>              default: 3
  --out <dir>             escribe summary.json (y run-*.jsonl con --trace)
  --trace                 spectator → JSONL por run
  --min-sick <0..1>       exit 1 si la media de sickRate no llega
  --headed                Playwright con ventana (debug)

sim:
  --perfil <nombre>       perfecto|pro|bueno|novato|nervioso|cansado (default: perfecto)
  --semilla <n>           default: 7
  --cancion --dificultad --runs --out --min-sick
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--trace") out.trace = true;
    else if (a === "--headed") out.headed = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[++i];
      if (val == null || val.startsWith("--")) {
        console.error(`Falta valor para --${key}`);
        usage(2);
      }
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

function num(v, def) {
  if (v == null) return def;
  const n = Number(v);
  if (Number.isNaN(n)) throw Object.assign(new Error(`número inválido: ${v}`), { code: 2 });
  return n;
}

function escribirSalida(dir, summary) {
  if (!dir) return null;
  const abs = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  fs.mkdirSync(abs, { recursive: true });
  const file = path.join(abs, "summary.json");
  fs.writeFileSync(file, JSON.stringify(summary, null, 2) + "\n");
  return file;
}

async function cmdProtocol(args) {
  const runs = Math.max(1, num(args.runs, 3));
  const delayMs = Math.max(0, num(args.retraso, 0));
  const outDir = args.out ? (path.isAbsolute(args.out) ? args.out : path.resolve(process.cwd(), args.out)) : null;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const { aggregate: summary } = await runProtocol({
    agent: args.agent,
    agentScript: args["agent-script"],
    song: args.cancion || "luz-de-neon",
    difficulty: args.dificultad || "hard",
    runs,
    delayMs,
    trace: !!args.trace,
    outDir,
    headless: !args.headed,
  });

  return finalizar(summary, args, outDir);
}

async function cmdSim(args) {
  const runs = Math.max(1, num(args.runs, 1));
  const outDir = args.out ? (path.isAbsolute(args.out) ? args.out : path.resolve(process.cwd(), args.out)) : null;

  const { aggregate: summary } = await runSim({
    perfil: args.perfil || "perfecto",
    semilla: num(args.semilla, 7),
    song: args.cancion || "luz-de-neon",
    difficulty: args.dificultad || "hard",
    runs,
  });

  return finalizar(summary, args, outDir);
}

function finalizar(summary, args, outDir) {
  const file = escribirSalida(outDir, summary);
  console.log(tablaResumen(summary));
  if (file) console.log(`wrote ${path.relative(process.cwd(), file) || file}`);

  if (summary.infraFailures > 0 && summary.ok === 0) {
    console.error("infra: todas las runs fallaron");
    return 2;
  }

  const thresholds = {};
  if (args["min-sick"] != null) thresholds.minSick = num(args["min-sick"]);
  const fails = assertThresholds(summary, thresholds);
  if (fails.length) {
    console.error("umbral:\n  " + fails.join("\n  "));
    return 1;
  }
  return summary.infraFailures ? 1 : 0;
}

function cmdCompare(args) {
  const [aPath, bPath] = args._;
  if (!aPath || !bPath) usage(2);
  const a = leerSummary(aPath);
  const b = leerSummary(bPath);
  console.log(compareSummaries(a, b, {
    labelA: path.basename(path.dirname(aPath)) || "A",
    labelB: path.basename(path.dirname(bPath)) || "B",
  }));
  return 0;
}

function cmdReplay(args) {
  const [tracePath] = args._;
  if (!tracePath) usage(2);
  const { offsets, result, juicios } = metricasDesdeTrace(tracePath);
  const j = juicios || { sick: 0, good: 0, bad: 0, miss: 0 };
  // Si el JSONL no trae juicios agregados, reconstruye conteos mínimos desde eventos sys.
  if (!juicios) {
    const texto = fs.readFileSync(tracePath, "utf8");
    for (const line of texto.split("\n")) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.juicio?.kind && j[e.juicio.kind] != null) j[e.juicio.kind]++;
      else if (e.msg?.type === "judgement" && e.msg.kind && j[e.msg.kind] != null) j[e.msg.kind]++;
    }
  }
  const resumen = {
    resultado: result,
    juicios: j,
    precision: precisionJuego(j),
    puntos: 0,
    comboMax: 0,
    fullCombo: j.miss === 0,
    letra: null,
  };
  const run = runDesdeResumen(resumen, { offsets, config: { mode: "replay", trace: path.resolve(tracePath) } });
  const summary = aggregate([run], { config: run.config });
  console.log(tablaResumen(summary));
  if (args.out) escribirSalida(args.out, summary);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._.length) usage(args.help ? 0 : 2);
  const cmd = args._.shift();

  let code = 0;
  try {
    if (cmd === "protocol") code = await cmdProtocol(args);
    else if (cmd === "sim") code = await cmdSim(args);
    else if (cmd === "compare") code = cmdCompare(args);
    else if (cmd === "replay") code = cmdReplay(args);
    else {
      console.error(`comando desconocido: ${cmd}`);
      usage(2);
    }
  } catch (e) {
    console.error(String(e?.stack || e));
    code = e?.code === 1 ? 1 : 2;
  }
  process.exit(code);
}

main();
