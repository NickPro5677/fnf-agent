// IA externa (protocolo v2): token, Origin, latencia, agentes y ajustes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { servirWeb, arrancarRelay, arrancarAgente, conectarIA, preparar, esperarResultado } from "./servidor.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let web, browser;
test.before(async () => { web = await servirWeb(); browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); web?.cerrar(); });
const puertoAzar = () => 9600 + Math.floor(Math.random() * 1500);
const nueva = (viewport = { width: 1280, height: 800 }) => browser.newPage({ viewport });

async function partida(script, { retraso = 0, modo, cancion = "luz-de-neon", dificultad = "easy" } = {}, t) {
  const puerto = puertoAzar();
  const relay = await arrancarRelay(puerto, { retraso });
  const agente = arrancarAgente(script, puerto);
  t.after(() => { agente.kill(); relay.kill(); });
  const page = await nueva();
  await page.goto(`${web.url}?nosw`);
  await preparar(page, { cancion, dificultad, jugador: "remoto" });
  await conectarIA(page, puerto, { modo });
  await page.waitForFunction(() => /[1-9] (agente|agent)/.test(document.querySelector("#estado-relay").textContent), null, { timeout: 15000 });
  await page.waitForTimeout(1200); // el agente v2 mide su ping antes de empezar
  await page.click("#btn-jugar");
  const r = await esperarResultado(page);
  await page.waitForTimeout(300);
  await page.close();
  return { r, salida: agente.salida };
}

test("v2: el agente con autoajuste saca ≥95 % Sick con 80 ms de latencia simulada", async (t) => {
  const { r } = await partida("agente_autoajuste.py", { retraso: 80, dificultad: "hard" }, t);
  const total = Object.values(r.juicios).reduce((a, b) => a + b, 0);
  assert.equal(r.resultado, "victoria");
  assert.ok(r.juicios.sick / total >= 0.95, JSON.stringify(r.juicios));
});

test("v1: agente_chart.py (sin cambios) sigue ganando sin fallos", async (t) => {
  const { r, salida } = await partida("agente_chart.py", {}, t);
  assert.equal(r.resultado, "victoria");
  assert.equal(r.juicios.miss, 0, JSON.stringify(r.juicios));
  assert.match(salida, /resultado: victoria/);
});

test("agente en JavaScript sin dependencias gana sin fallos", async (t) => {
  const { r } = await partida("agente.mjs", {}, t);
  assert.equal(r.resultado, "victoria");
  assert.equal(r.juicios.miss, 0, JSON.stringify(r.juicios));
});

test("sin token o con token incorrecto no conecta y el registro lo explica", async (t) => {
  const puerto = puertoAzar();
  const relay = await arrancarRelay(puerto);
  t.after(() => relay.kill());
  const page = await nueva();
  await page.goto(`${web.url}?nosw`);
  await preparar(page, { cancion: "luz-de-neon", jugador: "remoto" });
  await conectarIA(page, puerto, { token: "" });
  await page.waitForFunction(() => document.querySelector("#ia-log").textContent.includes("⚠"));
  await conectarIA(page, puerto, { token: "esto-no-es" });
  await page.waitForFunction(() => /token/i.test(document.querySelector("#estado-relay").textContent));
  assert.match(await page.textContent("#ia-log"), /token/i);
  assert.doesNotMatch(await page.textContent("#estado-relay"), /^Conectado|^Connected/);
  await page.close();
});

test("Probar conexión mide el ping; ajustes sin desborde y sin fallos graves de accesibilidad", async (t) => {
  const puerto = puertoAzar();
  const relay = await arrancarRelay(puerto);
  t.after(() => relay.kill());
  const page = await nueva({ width: 390, height: 844 });
  await page.goto(`${web.url}?nosw`);
  await preparar(page, { cancion: "luz-de-neon", jugador: "remoto" });
  await page.fill("#url-relay", "127.0.0.1");
  await page.fill("#puerto-relay", String(puerto));
  await page.fill("#token-relay", (await import("./servidor.mjs")).TOKEN);
  await page.click("#btn-probar");
  await page.waitForFunction(() => /ping \d/.test(document.querySelector("#ia-log").textContent));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "desborde horizontal");
  await page.evaluate(() => { for (const d of document.querySelectorAll("#op-remoto details")) d.open = true; });
  await page.addScriptTag({ content: AXE });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`));
  assert.deepEqual(graves, []);
  // guardar un perfil de conexión
  await page.fill("#perfil-ia-nombre", "casa");
  await page.click("#btn-perfil-guardar");
  assert.ok((await page.evaluate(() => localStorage.getItem("fnf-ia-perfiles"))).includes("casa"));
  assert.equal(await page.inputValue("#perfil-ia"), "casa");
  await page.close();
});
