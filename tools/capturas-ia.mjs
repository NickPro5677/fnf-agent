// Capturas de los ajustes de IA externa: node tools/capturas-ia.mjs <carpeta>
import { chromium } from "playwright";
import { servirWeb, arrancarRelay, arrancarAgente, conectarIA, preparar, esperarResultado } from "../tests/e2e/servidor.mjs";
const dir = process.argv[2] || "capturas";
const web = await servirWeb();
const browser = await chromium.launch();
const puerto = 11800 + Math.floor(Math.random() * 300);
const relay = await arrancarRelay(puerto, { retraso: 40 });
const agente = arrancarAgente("agente_autoajuste.py", puerto);
const quietas = (p) => p.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
try {
  for (const [w, h] of [[390, 844], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    await page.goto(web.url + "?nosw");
    await preparar(page, { cancion: "luz-de-neon", dificultad: "normal", jugador: "remoto" });
    await conectarIA(page, puerto, { token: "token-malo" });
    await page.waitForFunction(() => /token/i.test(document.querySelector("#ia-log").textContent));
    await page.fill("#perfil-ia-nombre", "Teléfono");
    await page.click("#btn-perfil-guardar");
    await page.evaluate(() => { for (const d of document.querySelectorAll("#op-remoto details")) d.open = true; });
    await conectarIA(page, puerto);
    await page.click("#btn-probar");
    await page.waitForFunction(() => /ping \d/.test(document.querySelector("#ia-log").textContent));
    await quietas(page);
    await page.locator("#op-remoto").scrollIntoViewIfNeeded();
    await page.locator("#op-remoto").screenshot({ path: `${dir}/ajustes-${w}x${h}.png` });
    await page.click("#btn-jugar");
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${dir}/juego-${w}x${h}.png` });
    await esperarResultado(page);
    await quietas(page);
    await page.screenshot({ path: `${dir}/resultados-${w}x${h}.png`, fullPage: true });
    await page.close();
  }
} finally { agente.kill(); relay.kill(); await browser.close(); web.cerrar(); }
