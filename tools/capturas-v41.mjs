// Capturas antes/después del pad y el diseño: node tools/capturas-v41.mjs <carpeta> [--zonas]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { servirWeb, preparar, esperarResultado } from "../tests/e2e/servidor.mjs";

const OUT = path.resolve(process.argv[2] || "capturas");
const ZONAS = process.argv.includes("--zonas");
fs.mkdirSync(OUT, { recursive: true });
const TECLAS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
const TAMAÑOS = [
  ["390x844", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["360x740", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["844x390", { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["1920x1080", { viewport: { width: 1920, height: 1080 } }],
];
const web = await servirWeb();
const b = await chromium.launch();

async function jugarHasta(page, alFinal, fotoEn, foto) {
  const sueltas = []; let hecha = false;
  for (;;) {
    const { t, prox, fin } = await page.evaluate(() => ({ t: window.__fnf.estado()?.t ?? 0, prox: window.__fnf.proximas(), fin: document.querySelector("#resultados").open }));
    if (fin) break;
    if (!hecha && t > fotoEn) { hecha = true; await foto(); }
    for (const s of sueltas.filter((s) => s.t <= t)) { await page.keyboard.up(TECLAS[s.lane]); sueltas.splice(sueltas.indexOf(s), 1); }
    for (const n of prox) if (n.t - t <= 12 && !sueltas.some((s) => s.lane === n.lane)) { await page.keyboard.down(TECLAS[n.lane]); sueltas.push({ lane: n.lane, t: n.t + Math.max(60, n.l) }); }
    await page.waitForTimeout(4);
  }
  await alFinal();
}

for (const [n, opts] of TAMAÑOS) {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(web.url + "?nosw");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `menu-${n}.png`) });
  await preparar(page, { cancion: "luz-de-neon", dificultad: "normal", jugador: "humano" });
  await page.click("#btn-jugar");
  await page.waitForFunction(() => window.__fnf.listo());
  await jugarHasta(page, async () => {
    await esperarResultado(page); await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `resultados-${n}.png`) });
  }, 6000, async () => {
    await page.screenshot({ path: path.join(OUT, `juego-${n}.png`) });
    if (ZONAS) {
      await page.evaluate(() => window.__fnf.verZonas(true));
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `zonas-${n}.png`) });
      await page.evaluate(() => window.__fnf.verZonas(false));
    }
  });
  await ctx.close();
}
await b.close(); web.cerrar();
console.log("capturas en", OUT);
