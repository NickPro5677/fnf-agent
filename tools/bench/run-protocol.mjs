// Modo B: HTTP + relay + agente + Playwright (cliente game real).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  servirWeb, arrancarRelay, TOKEN, preparar, conectarIA, esperarResultado, RAIZ as RAIZ_E2E,
} from "../../tests/e2e/servidor.mjs";
import { runDesdeResumen, aggregate } from "./collect.mjs";
import { conectarSpectator } from "./trace.mjs";

const RAIZ = RAIZ_E2E || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRESETS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "presets.json"), "utf8"));

export function cargarPresets() {
  return { ...PRESETS };
}

/** Resuelve preset o --agent-script a { scriptPath, name, v }. */
export function resolverAgente({ agent, agentScript } = {}) {
  if (agentScript) {
    const scriptPath = path.isAbsolute(agentScript) ? agentScript : path.resolve(process.cwd(), agentScript);
    if (!fs.existsSync(scriptPath)) {
      throw Object.assign(new Error(`agente no encontrado: ${scriptPath}`), { code: 2 });
    }
    return { scriptPath, name: path.basename(scriptPath), v: scriptPath.includes("chart") ? 1 : 2 };
  }
  const key = agent || "autoajuste";
  const p = PRESETS[key];
  if (!p) {
    throw Object.assign(new Error(`preset desconocido: ${key} (válidos: ${Object.keys(PRESETS).join(", ")})`), { code: 2 });
  }
  const scriptPath = path.join(RAIZ, p.script);
  if (!fs.existsSync(scriptPath)) {
    throw Object.assign(new Error(`preset ${key}: falta ${p.script}`), { code: 2 });
  }
  return { scriptPath, name: key, v: p.v ?? 2 };
}

function puertoAzar() {
  return 9600 + Math.floor(Math.random() * 1500);
}

function arrancarAgenteLibre(scriptPath, puerto) {
  const cmd = scriptPath.endsWith(".mjs") || scriptPath.endsWith(".js") ? process.execPath : "python3";
  // Reusa HOME/FNF_TOKEN del proceso (servidor.mjs ya fijó ENV al importar arrancarRelay).
  const env = { ...process.env, FNF_TOKEN: process.env.FNF_TOKEN || TOKEN };
  const p = spawn(cmd, [scriptPath, "--relay", `ws://127.0.0.1:${puerto}`], {
    stdio: ["ignore", "pipe", "inherit"],
    env,
  });
  p.salida = "";
  p.stdout.on("data", (d) => { p.salida += d; });
  return p;
}

function matar(proc) {
  if (!proc || proc.killed) return;
  try { proc.kill("SIGTERM"); } catch { /* ok */ }
  setTimeout(() => { try { if (!proc.killed) proc.kill("SIGKILL"); } catch { /* ok */ } }, 1500);
}

/**
 * Una partida de protocolo. Levanta relay+agente por run (aisla estado).
 */
async function unaPartida(browser, web, {
  scriptPath, agentName, song, difficulty, delayMs, trace, outDir, runIndex, modo,
}) {
  const puerto = puertoAzar();
  let relay, agente, page, spectator;
  const t0 = Date.now();
  const config = {
    mode: "protocol",
    song,
    difficulty,
    delayMs,
    agent: agentName,
    script: path.relative(RAIZ, scriptPath),
    protocol: modo === "v1" ? 1 : 2,
    run: runIndex,
  };

  try {
    relay = await arrancarRelay(puerto, { retraso: delayMs });
    agente = arrancarAgenteLibre(scriptPath, puerto);

    // Spectator siempre (offsets / RTT); JSONL solo si --trace.
    try {
      spectator = conectarSpectator(`ws://127.0.0.1:${puerto}`, TOKEN, { name: `bench-run-${runIndex}` });
      await spectator.listo;
    } catch (e) {
      console.error(`[bench] spectator omitido: ${e.message || e}`);
      spectator = null;
    }

    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${web.url}?nosw`);
    await preparar(page, { cancion: song, dificultad: difficulty, jugador: "remoto" });
    await conectarIA(page, puerto, { modo: modo === "v1" ? "v1" : undefined });
    await page.waitForFunction(
      () => /[1-9] (agente|agent)/.test(document.querySelector("#estado-relay")?.textContent || ""),
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(1200);
    await page.click("#btn-jugar");
    const resumen = await esperarResultado(page, 180000);
    await page.waitForTimeout(300);

    const offsets = spectator ? [...spectator.offsets] : [];
    const rttSamples = spectator ? [...spectator.rttSamples] : [];

    if (trace && outDir && spectator) {
      const file = path.join(outDir, `run-${String(runIndex).padStart(3, "0")}.jsonl`);
      spectator.writeJsonl(file);
    }

    return runDesdeResumen(resumen, {
      offsets,
      rttSamples,
      durationMsWall: Date.now() - t0,
      config,
    });
  } catch (e) {
    return runDesdeResumen(null, {
      durationMsWall: Date.now() - t0,
      config,
      infraError: String(e?.message || e),
    });
  } finally {
    try { await page?.close(); } catch { /* ok */ }
    spectator?.close();
    matar(agente);
    matar(relay);
  }
}

/**
 * @param {object} opts
 */
export async function runProtocol({
  agent = "autoajuste",
  agentScript,
  song = "luz-de-neon",
  difficulty = "hard",
  runs = 3,
  delayMs = 0,
  trace = false,
  outDir = null,
  headless = true,
} = {}) {
  const { scriptPath, name, v } = resolverAgente({ agent, agentScript });
  const modo = v === 1 ? "v1" : "v2";
  const configBase = {
    mode: "protocol",
    song,
    difficulty,
    delayMs,
    agent: name,
    script: path.relative(RAIZ, scriptPath),
    protocol: v,
  };

  let web, browser;
  const limpia = async () => {
    try { await browser?.close(); } catch { /* ok */ }
    try { web?.cerrar(); } catch { /* ok */ }
  };

  // Ctrl+C: no dejar Chromium/relay huérfanos.
  const onSig = () => { limpia().finally(() => process.exit(2)); };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  try {
    web = await servirWeb();
    browser = await chromium.launch({ headless });
    const results = [];
    for (let i = 0; i < runs; i++) {
      const r = await unaPartida(browser, web, {
        scriptPath,
        agentName: name,
        song,
        difficulty,
        delayMs,
        trace,
        outDir,
        runIndex: i + 1,
        modo,
      });
      results.push(r);
      if (r.infraError) {
        // Seguir con las demás runs; el agregador cuenta infraFailures.
      }
    }
    return {
      results,
      aggregate: aggregate(results, { config: configBase }),
    };
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
    await limpia();
  }
}
