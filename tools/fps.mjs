// Mide fps de una partida en el teléfono (390x844, DPR 2) con la CPU 4× más lenta: node tools/fps.mjs
import { chromium } from "playwright";
import { servirWeb, preparar } from "../tests/e2e/servidor.mjs";

const TECLAS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
const web = await servirWeb();
const b = await chromium.launch();
const resultados = {};
for (const menos of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript((m) => {
    localStorage.setItem("fnf-ajustes", JSON.stringify({ menosEfectos: m }));
    // contador de cuadros independiente de la app (sirve también para versiones viejas)
    const c = (window.__cuadros = []); let u = 0;
    const f = (t) => { if (u) c.push(t - u); u = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }, menos);
  await page.goto(web.url + "?nosw");
  await preparar(page, { cancion: "turbo-cuantico", dificultad: "hard", jugador: process.argv[2] || "humano" });
  if (process.argv[2] === "humanizado") await page.selectOption("#perfil", "novato");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.click("#btn-jugar");
  await page.waitForFunction(() => window.__fnf.listo());
  await page.waitForFunction(() => (window.__fnf.estado()?.t ?? -1) > 0, null, { timeout: 30000 });
  await page.evaluate(() => { window.__cuadros.length = 0; });
  const sueltas = [];
  const fin = Date.now() + 15000;
  while (Date.now() < fin) {
    const { t, prox } = await page.evaluate(() => ({ t: window.__fnf.estado()?.t ?? 0, prox: window.__fnf.proximas() }));
    for (const s of sueltas.filter((s) => s.t <= t)) { await page.keyboard.up(TECLAS[s.lane]); sueltas.splice(sueltas.indexOf(s), 1); }
    for (const n of prox) if (n.t - t <= 20 && !sueltas.some((s) => s.lane === n.lane)) { await page.keyboard.down(TECLAS[n.lane]); sueltas.push({ lane: n.lane, t: n.t + Math.max(60, n.l) }); }
    await page.waitForTimeout(15);
  }
  resultados[menos ? "menos efectos" : "efectos completos"] = { ...(await page.evaluate(() => {
    const c = [...window.__cuadros].sort((a, b) => a - b);
    const media = c.reduce((a, b) => a + b, 0) / c.length;
    return { fps: +(1000 / media).toFixed(1), p95ms: +c[Math.floor(c.length * 0.95)].toFixed(1), cuadros: c.length, lentos: c.filter((x) => x > 25).length };
  })), aciertos: await page.evaluate(() => window.__fnf.estado()?.juicios) };
  await ctx.close();
}
console.log(JSON.stringify(resultados, null, 1));
await b.close(); web.cerrar();
