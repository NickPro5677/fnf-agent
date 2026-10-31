// Bot con perfiles en el navegador: cada perfil termina una canción, el perfecto hace full combo,
// marcas y gráfica en vivo, histograma y "Tú vs Bot" en resultados.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { servirWeb, preparar, esperarResultado } from "./servidor.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let web, browser;
test.before(async () => { web = await servirWeb(); browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); web?.cerrar(); });

const PERFILES = ["perfecto", "pro", "bueno", "novato", "nervioso", "cansado", "personalizado"];

async function axe(page) {
  await page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`));
}

async function jugarBot(perfil, { semilla = "42", antes } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(web.url + "?nosw");
  if (antes) await page.evaluate(antes);
  await preparar(page, { cancion: "primer-paso", dificultad: "easy", jugador: "humanizado" });
  await page.selectOption("#perfil", perfil);
  await page.fill("#semilla", semilla);
  await page.click("#btn-jugar");
  await page.waitForFunction(() => window.__fnf.listo);
  return { page, errores };
}

test("los 7 perfiles terminan la canción; el perfecto hace full combo y el novato falla más que el pro", async () => {
  const res = await Promise.all(PERFILES.map(async (perfil) => {
    const { page, errores } = await jugarBot(perfil);
    const r = await esperarResultado(page);
    const histo = await page.locator("#res-histo rect").count();
    await page.close();
    return { perfil, r, histo, errores };
  }));
  const por = Object.fromEntries(res.map((x) => [x.perfil, x.r]));
  for (const { perfil, r, histo, errores } of res) {
    assert.ok(["victoria", "derrota"].includes(r.resultado), perfil);
    assert.ok(r.juicios.sick + r.juicios.good + r.juicios.bad + r.juicios.miss > 20, perfil);
    assert.ok(histo >= 2, `${perfil}: histograma con barras`);
    assert.deepEqual(errores, [], perfil);
    assert.match(r.jugador, /42/, `${perfil}: la semilla sale en el nombre`);
  }
  assert.equal(por.perfecto.fullCombo, true, JSON.stringify(por.perfecto.juicios));
  assert.equal(por.perfecto.juicios.sick, por.perfecto.juicios.sick + por.perfecto.juicios.good + por.perfecto.juicios.bad);
  assert.ok(por.novato.precision < por.pro.precision, `${por.novato.precision} < ${por.pro.precision}`);
});

test("marcas de lo que planea pulsar, gráfica en vivo y Tú vs Bot sin fallos de accesibilidad", async () => {
  const mejor = { "primer-paso|easy": { precision: 0.93, puntos: 12345, fallos: 2, media: 8.5, letra: "A", nombre: "Tú" } };
  const { page } = await jugarBot("bueno", { antes: `localStorage.setItem("fnf-mejores", ${JSON.stringify(JSON.stringify(mejor))})` });
  await page.waitForFunction(() => window.__fnf.marcas()?.length > 0, null, { timeout: 20000 });
  const m = await page.evaluate(() => window.__fnf.marcas()[0]);
  assert.ok(m.lane >= 0 && m.lane < 4 && Number.isFinite(m.t), "el bot muestra qué va a pulsar");
  await esperarResultado(page);
  assert.equal(await page.locator("#res-vs").isVisible(), true);
  assert.equal(await page.locator("#vs-filas tr").count(), 5);
  assert.match(await page.locator("#vs-filas").innerText(), /93[.,]00/);
  assert.deepEqual(await axe(page), []);
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(ancho <= 390, `sin scroll horizontal: ${ancho}`);
  await page.close();
});

test("menú: perfil personalizado con sus controles, en inglés también, sin fallos graves", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.goto(web.url + "?nosw");
  await page.check("input[name=jugador][value=humanizado]", { force: true });
  await page.selectOption("#perfil", "personalizado");
  assert.equal(await page.locator("#pz-sigma").isVisible(), true);
  await page.fill("#semilla", "12ab3");
  await page.locator("#semilla").dispatchEvent("input");
  assert.equal(await page.inputValue("#semilla"), "123");
  assert.deepEqual(await axe(page), []);
  await page.click("#btn-idioma");
  assert.match(await page.locator("#perfil-desc").innerText(), /choose/i);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360);
  await page.close();
});
