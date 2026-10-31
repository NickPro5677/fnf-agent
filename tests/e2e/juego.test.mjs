// Pruebas de punta a punta en un navegador de verdad (Chromium con Playwright).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { servirWeb, arrancarRelay, arrancarAgente, preparar, esperarResultado, RAIZ } from "./servidor.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const lista = JSON.parse(fs.readFileSync(path.join(RAIZ, "web/canciones/lista.json"), "utf8"));

let web, browser;
test.before(async () => { web = await servirWeb(); browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); web?.cerrar(); });

const nueva = (viewport = { width: 390, height: 844 }, extra = {}) => browser.newPage({ viewport, ...extra });

async function axe(page) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`));
  return r;
}

test("el menú carga, sin desbordar a lo ancho en 390 px y sin fallos de accesibilidad graves", async () => {
  const page = await nueva();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(web.url + "?nosw");
  await page.waitForSelector(".cancion");
  assert.equal(await page.locator(".cancion").count(), 3);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "desborde horizontal");
  assert.deepEqual(await axe(page), []);
  await page.click("#btn-idioma");
  assert.equal(await page.textContent("#btn-jugar"), "▶ Play");
  await page.click("#btn-idioma");
  assert.deepEqual(errores, []);
  await page.close();
});

test("1920 px: se ve el rival y el jugador, sin desborde", async () => {
  const page = await nueva({ width: 1920, height: 1080 });
  await page.goto(web.url + "?nosw");
  await preparar(page, { cancion: "primer-paso", jugador: "perfecto" });
  await page.click("#btn-jugar");
  await page.waitForSelector("#juego:not(.oculto)");
  await page.waitForTimeout(1500);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.isVisible("#pad"), false, "en escritorio sin pantalla táctil no hay pad");
  await page.close();
});

test("juego manual con teclado (primer-paso, fácil): gana y acierta casi todo", async () => {
  const page = await nueva();
  await page.goto(web.url + "?nosw");
  await preparar(page, { cancion: "primer-paso", dificultad: "easy", jugador: "humano" });
  await page.click("#btn-jugar");
  await page.waitForSelector("#juego:not(.oculto)");
  // axe mide el contraste con la opacidad del momento: esperar a que acabe la transición de entrada.
  await page.waitForFunction(() => document.querySelector("#juego").getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
  assert.equal(await page.isVisible("#zona-tactil"), true, "zona táctil visible en el móvil");
  assert.deepEqual(await axe(page), []);
  const TECLAS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
  const sueltas = [];
  for (;;) {
    const { t, prox, fin } = await page.evaluate(() => ({ t: window.__fnf.estado()?.t ?? 0, prox: window.__fnf.proximas(), fin: !!window.__fnf.estado()?.resultado || document.querySelector("#resultados").open }));
    if (fin) break;
    for (const s of sueltas.filter((s) => s.t <= t)) { await page.keyboard.up(TECLAS[s.lane]); sueltas.splice(sueltas.indexOf(s), 1); }
    for (const n of prox) {
      if (n.t - t <= 12 && !sueltas.some((s) => s.lane === n.lane)) {
        await page.keyboard.down(TECLAS[n.lane]);
        sueltas.push({ lane: n.lane, t: n.t + Math.max(60, n.l) });
      }
    }
    await page.waitForTimeout(4);
  }
  const r = await esperarResultado(page);
  assert.equal(r.resultado, "victoria");
  const aciertos = r.juicios.sick + r.juicios.good + r.juicios.bad;
  assert.ok(aciertos >= r.total * 0.9, JSON.stringify(r));
  assert.deepEqual(await axe(page), []);
  await page.close();
});

test("bot perfecto: full combo en las 3 canciones de demo (normal)", async () => {
  const resultados = await Promise.all(lista.map(async (s) => {
    const page = await nueva({ width: 1280, height: 800 });
    await page.goto(web.url + "?nosw");
    await preparar(page, { cancion: s.id, dificultad: "normal", jugador: "perfecto" });
    await page.click("#btn-jugar");
    await page.waitForTimeout(12000);
    const panel = await page.locator("#panel-ia-lista li").count();
    const r = await esperarResultado(page);
    await page.close();
    return { id: s.id, r, panel };
  }));
  for (const { id, r, panel } of resultados) {
    assert.equal(r.resultado, "victoria", id);
    assert.equal(r.juicios.miss, 0, `${id}: ${JSON.stringify(r.juicios)}`);
    assert.equal(r.fullCombo, true, id);
    assert.ok(panel > 0, `${id}: el panel de la IA muestra decisiones`);
  }
});

test("IA externa: agente_chart.py juega por WebSocket a través del relay y gana sin fallos", async (t) => {
  const puerto = 9100 + Math.floor(Math.random() * 500);
  const relay = await arrancarRelay(puerto);
  const agente = arrancarAgente("agente_chart.py", puerto);
  t.after(() => { agente.kill(); relay.kill(); });
  const page = await nueva({ width: 1280, height: 800 });
  await page.goto(`${web.url}?nosw&relay=ws://127.0.0.1:${puerto}`);
  await preparar(page, { cancion: "luz-de-neon", dificultad: "easy", jugador: "remoto" });
  await page.click("#btn-conectar");
  await page.waitForFunction(() => /agente/.test(document.querySelector("#estado-relay").textContent) && /chart/.test(document.querySelector("#estado-relay").textContent));
  await page.click("#btn-jugar");
  await page.waitForFunction(() => document.querySelector("#panel-ia-piensa").textContent.includes("chart"), null, { timeout: 5000 });
  const r = await esperarResultado(page);
  assert.equal(r.resultado, "victoria");
  assert.equal(r.juicios.miss, 0, JSON.stringify(r.juicios));
  assert.equal(r.jugador, "IA externa");
  await page.waitForTimeout(300);
  assert.match(agente.salida, /resultado: victoria/);
  await page.close();
});

test("sin conexión: con el service worker, la app y las canciones cargan offline", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(web.url);
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === "activated");
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 20);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".cancion");
  await preparar(page, { cancion: "turbo-cuantico", jugador: "perfecto" });
  await page.click("#btn-jugar");
  await page.waitForTimeout(2000);
  assert.ok(await page.evaluate(() => window.__fnf.estado().t > 0));
  await ctx.close();
});

test("el panel de la IA no tapa ningún carril (1920, 1366 y 390 px)", async () => {
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) {
    const page = await nueva({ width, height });
    await page.goto(web.url + "?nosw");
    await preparar(page, { cancion: "primer-paso", jugador: "perfecto" });
    await page.click("#btn-jugar");
    await page.waitForSelector("#juego:not(.oculto)");
    await page.waitForSelector("#panel-ia:not(.oculto)");
    const { panel, lienzo, g } = await page.evaluate(() => {
      const r = (el) => { const b = document.querySelector(el).getBoundingClientRect(); return { left: b.left, right: b.right }; };
      return { panel: r("#panel-ia"), lienzo: r("#lienzo"), g: window.__fnf.geometria() };
    });
    const carriles = [...g.jugador.map((x) => [x, g.ancho]), ...(g.rival || []).map((x) => [x, g.anchoR])];
    for (const [x, a] of carriles) {
      const izq = lienzo.left + x - a * 0.45, der = lienzo.left + x + a * 0.45;
      assert.ok(der <= panel.left || izq >= panel.right, `${width}px: carril en ${Math.round(izq)}–${Math.round(der)} choca con el panel ${Math.round(panel.left)}–${Math.round(panel.right)}`);
      assert.ok(izq >= 0 && der <= lienzo.right, `${width}px: carril fuera de pantalla`);
    }
    await page.close();
  }
});
