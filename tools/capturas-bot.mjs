// Capturas del bot con perfiles: node tools/capturas-bot.mjs <carpeta>
import { chromium } from "playwright";
import { servirWeb, preparar, esperarResultado } from "../tests/e2e/servidor.mjs";
const dir = process.argv[2] || "capturas";
const web = await servirWeb();
const browser = await chromium.launch();
const quietas = (p) => p.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
for (const [w, h] of [[390, 844], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await page.goto(web.url + "?nosw");
  await page.evaluate(() => localStorage.setItem("fnf-mejores", JSON.stringify({ "luz-de-neon|normal": { precision: 0.912, puntos: 98000, fallos: 4, media: 11.2, letra: "A", nombre: "Tú" } })));
  await preparar(page, { cancion: "luz-de-neon", dificultad: "normal", jugador: "humanizado" });
  await page.selectOption("#perfil", "personalizado");
  await page.fill("#semilla", "2026");
  await quietas(page);
  await page.locator("#op-humanizado").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/menu-${w}x${h}.png` });
  await page.selectOption("#perfil", "novato");
  await page.click("#btn-jugar");
  await page.waitForFunction(() => window.__fnf.marcas()?.length >= 3, null, { timeout: 60000 });
  await page.screenshot({ path: `${dir}/juego-${w}x${h}.png` });
  await esperarResultado(page);
  await quietas(page);
  await page.screenshot({ path: `${dir}/resultados-${w}x${h}.png`, fullPage: true });
  await page.locator("#res-vs").screenshot({ path: `${dir}/vs-${w}x${h}.png` });
  await page.close();
}
await browser.close(); web.cerrar();
