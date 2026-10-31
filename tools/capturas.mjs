// Saca las capturas de pantalla de la documentación: node tools/capturas.mjs [carpeta]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { servirWeb, arrancarRelay, arrancarAgente, preparar, esperarResultado, RAIZ } from "../tests/e2e/servidor.mjs";

const OUT = path.resolve(process.argv[2] || path.join(RAIZ, "docs/img"));
fs.mkdirSync(OUT, { recursive: true });
const web = await servirWeb();
const browser = await chromium.launch();
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null; // p. ej. SOLO=4,5
const toca = (n) => !SOLO || SOLO.includes(String(n));
let page;
const TECLAS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
const movil = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function tocar(page, ms) {
  const sueltas = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { t, prox } = await page.evaluate(() => ({ t: window.__fnf.estado()?.t ?? 0, prox: window.__fnf.proximas() }));
    for (const s of sueltas.filter((s) => s.t <= t)) { await page.keyboard.up(TECLAS[s.lane]); sueltas.splice(sueltas.indexOf(s), 1); }
    for (const n of prox) if (n.t - t <= 12 && !sueltas.some((s) => s.lane === n.lane)) {
      await page.keyboard.down(TECLAS[n.lane]); sueltas.push({ lane: n.lane, t: n.t + Math.max(60, n.l) });
    }
    await page.waitForTimeout(4);
  }
}

// 1. Teléfono, juego manual
if (toca(1)) {
page = await browser.newPage(movil);
await page.goto(web.url + "?nosw");
await page.screenshot({ path: path.join(OUT, "movil-menu.png") });
await preparar(page, { cancion: "luz-de-neon", dificultad: "normal", jugador: "humano" });
await page.click("#btn-jugar"); await page.waitForSelector("#juego:not(.oculto)");
await tocar(page, 9000);
await page.screenshot({ path: path.join(OUT, "movil-manual.png") });
await page.close();

}
// 2. Bot con panel de IA (escritorio) + 3. resultados
if (toca(2)) {
page = await browser.newPage({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: "/tmp/fnf-video", size: { width: 640, height: 400 } } });
await page.goto(web.url + "?nosw");
await preparar(page, { cancion: "turbo-cuantico", dificultad: "normal", jugador: "humanizado" });
await page.click("#btn-jugar"); await page.waitForSelector("#juego:not(.oculto)");
await page.waitForTimeout(12000);
await page.screenshot({ path: path.join(OUT, "bot-panel-ia.png") });
await esperarResultado(page, 180000); await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "resultados.png") });
const video = await page.video().path(); await page.close();
fs.copyFileSync(video, "/tmp/fnf-bot.webm");

}
// 4. IA externa conectada (teléfono)
if (toca(4)) {
const relay = await arrancarRelay(8777); const agente = arrancarAgente("agente_chart.py", 8777);
page = await browser.newPage(movil);
await page.goto(web.url + "?nosw&relay=ws://127.0.0.1:8777");
await preparar(page, { cancion: "primer-paso", dificultad: "normal", jugador: "remoto" });
await page.click("#btn-jugar"); await page.waitForSelector("#juego:not(.oculto)");
await page.waitForTimeout(10000);
await page.screenshot({ path: path.join(OUT, "ia-externa.png") });
await page.close(); agente.kill(); relay.kill();

}
// 5. Escritorio 1920
if (toca(5)) {
page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(web.url + "?nosw");
await preparar(page, { cancion: "luz-de-neon", dificultad: "hard", jugador: "perfecto" });
await page.click("#btn-jugar"); await page.waitForSelector("#juego:not(.oculto)");
await page.waitForTimeout(14000);
await page.screenshot({ path: path.join(OUT, "escritorio-1920.png") });
await page.close();
}

await browser.close(); web.cerrar();
console.log("capturas en", OUT);
