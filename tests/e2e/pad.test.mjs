// Pad táctil v4.1: toques reales (CDP Input.dispatchTouchEvent), no eventos sintéticos.
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { servirWeb, preparar } from "./servidor.mjs";

let web, browser;
test.before(async () => { web = await servirWeb(); browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); web?.cerrar(); });

const MOVIL = { hasTouch: true, isMobile: true };
const TAMAÑOS = [[390, 844], [360, 740], [844, 390], [740, 360]];

async function partida(viewport, ajustes = {}) {
  const ctx = await browser.newContext({ viewport, ...MOVIL });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  if (Object.keys(ajustes).length) await page.addInitScript((a) => localStorage.setItem("fnf-ajustes", JSON.stringify(a)), ajustes);
  await page.goto(web.url + "?nosw");
  // turbo-cuantico es la más larga: da tiempo a barrer la zona antes de que acabe.
  await preparar(page, { cancion: "turbo-cuantico", dificultad: "easy", jugador: "humano" });
  await page.click("#btn-jugar");
  // esperar también a que termine la animación de entrada de la pantalla
  await page.waitForFunction(() => window.__fnf.listo() && window.__fnf.zona() && document.querySelector("#juego").getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
  const cdp = await ctx.newCDPSession(page);
  const activos = new Map();
  const enviar = (type) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [...activos].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 1, radiusY: 1 })) });
  const dedo = {
    abajo: async (id, x, y) => { activos.set(id, { x, y }); await enviar("touchStart"); },
    mover: async (id, x, y) => { activos.set(id, { x, y }); await enviar("touchMove"); },
    arriba: async (id) => { activos.delete(id); await cdp.send("Input.dispatchTouchEvent", { type: activos.size ? "touchEnd" : "touchEnd", touchPoints: [...activos].map(([i, p]) => ({ id: i, x: p.x, y: p.y })) }); },
  };
  const teclas = () => page.evaluate(() => window.__fnf.estado().teclas);
  const info = () => page.evaluate(() => ({ z: window.__fnf.zona(), g: window.__fnf.geometria(), fin: !!window.__fnf.estado()?.resultado }));
  return { ctx, page, dedo, teclas, info, errores, cerrar: () => ctx.close() };
}

const centro = (z, g, lane) => z.lienzo.x + g.jugador[lane];
const esperado = (x, z, g) => {
  let mejor = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(x - centro(z, g, i)) < Math.abs(x - centro(z, g, mejor))) mejor = i;
  return mejor;
};
const solo = (lane) => [0, 1, 2, 3].map((i) => i === lane);

for (const [width, height] of TAMAÑOS) {
  test(`pad ${width}x${height}: el 100 % de la zona responde y cada columna coincide con su carril`, async () => {
    const p = await partida({ width, height });
    const { z, g } = await p.info();
    assert.equal(z.modo, "columnas");
    assert.ok(z.downscroll && g.downscroll, "downscroll activo por defecto en el teléfono");
    assert.ok(z.x <= 0.5 && z.x + z.w >= width - 0.5, `la zona ocupa todo el ancho: ${JSON.stringify(z)}`);
    assert.ok(z.y + z.h >= height - 1, "la zona llega hasta abajo");
    const recPagina = z.lienzo.y + g.recY;
    assert.ok(recPagina > z.y && recPagina < z.y + z.h, "los receptores están dentro de la zona táctil");
    assert.ok(g.recY >= height * 0.6, `las notas tienen al menos el 60 % del alto (${g.recY} de ${height})`);
    assert.ok(z.h * z.w >= width * height * 0.18, "zona táctil grande");
    // columnas alineadas: el centro de cada carril cae en su columna
    for (let lane = 0; lane < 4; lane++) assert.equal(esperado(centro(z, g, lane), z, g), lane);
    // barrido: bordes incluidos
    const xs = [0.5]; for (let i = 1; i < 24; i++) xs.push((width * i) / 24); xs.push(width - 0.5);
    const ys = [z.y + 1, z.y + z.h / 2, z.y + z.h - 1];
    let fallos = [];
    for (const y of ys) for (const x of xs) {
      await p.dedo.abajo(1, x, y);
      const t = await p.teclas();
      const e = esperado(x, z, g);
      if (JSON.stringify(t) !== JSON.stringify(solo(e))) fallos.push(`(${x.toFixed(0)},${y.toFixed(0)}) → ${JSON.stringify(t)} esperaba ${e}`);
      await p.dedo.arriba(1);
      const t2 = await p.teclas();
      if (t2.some(Boolean)) fallos.push(`(${x.toFixed(0)},${y.toFixed(0)}) no se soltó`);
    }
    assert.deepEqual(fallos, []);
    assert.equal((await p.info()).fin, false, "la partida siguió durante el barrido");
    assert.deepEqual(p.errores, []);
    await p.cerrar();
  });
}

test("pad: deslizar el dedo entre carriles cambia de carril", async () => {
  const p = await partida({ width: 390, height: 844 });
  const { z, g } = await p.info();
  const y = z.y + z.h * 0.6;
  await p.dedo.abajo(7, centro(z, g, 0), y);
  assert.deepEqual(await p.teclas(), solo(0));
  for (let k = 1; k <= 6; k++) await p.dedo.mover(7, centro(z, g, 0) + ((centro(z, g, 1) - centro(z, g, 0)) * k) / 6, y);
  assert.deepEqual(await p.teclas(), solo(1));
  for (let k = 1; k <= 6; k++) await p.dedo.mover(7, centro(z, g, 1) + ((centro(z, g, 3) - centro(z, g, 1)) * k) / 6, y);
  assert.deepEqual(await p.teclas(), solo(3));
  // salir de la zona hacia arriba no suelta (el dedo sigue capturado)
  await p.dedo.mover(7, centro(z, g, 3), z.y - 40);
  assert.deepEqual(await p.teclas(), solo(3));
  await p.dedo.arriba(7);
  assert.deepEqual(await p.teclas(), [false, false, false, false]);
  await p.cerrar();
});

test("pad: dos dedos en el mismo carril no sueltan la nota larga al levantar uno", async () => {
  const p = await partida({ width: 390, height: 844 });
  const { z, g } = await p.info();
  const y = z.y + z.h * 0.5, x = centro(z, g, 2);
  await p.dedo.abajo(1, x - 12, y);
  await p.dedo.abajo(2, x + 12, y);
  assert.deepEqual(await p.teclas(), solo(2));
  await p.dedo.arriba(1);
  assert.deepEqual(await p.teclas(), solo(2), "sigue pulsado con el segundo dedo");
  await p.dedo.arriba(2);
  assert.deepEqual(await p.teclas(), [false, false, false, false]);
  // acordes: dos carriles a la vez
  await p.dedo.abajo(3, centro(z, g, 0), y);
  await p.dedo.abajo(4, centro(z, g, 3), y);
  assert.deepEqual(await p.teclas(), [true, false, false, true]);
  await p.dedo.arriba(3); await p.dedo.arriba(4);
  await p.cerrar();
});

test("pad modo botones: 4 franjas sin huecos de borde a borde", async () => {
  const p = await partida({ width: 390, height: 844 }, { padModo: "botones" });
  const { z } = await p.info();
  assert.equal(z.modo, "botones");
  assert.ok(z.x <= 0.5 && z.w >= 389);
  const y = z.y + z.h / 2;
  for (let i = 0; i <= 20; i++) {
    const x = Math.min(z.w - 0.5, Math.max(0.5, (z.w * i) / 20));
    await p.dedo.abajo(1, x, y);
    const lane = Math.min(3, Math.floor((x / z.w) * 4));
    assert.deepEqual(await p.teclas(), solo(lane), `x=${x}`);
    await p.dedo.arriba(1);
  }
  assert.equal(await p.page.evaluate(() => document.querySelector("#pad .t1").classList.contains("activo")), false);
  await p.cerrar();
});

test("downscroll: ajustable; en escritorio va hacia arriba y sin zona táctil", async () => {
  const p = await partida({ width: 390, height: 844 }, { downscroll: "no" });
  const { g } = await p.info();
  assert.equal(g.downscroll, false);
  assert.ok(g.recY < 200, "receptores arriba");
  await p.cerrar();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(web.url + "?nosw");
  await preparar(page, { cancion: "primer-paso", jugador: "humano" });
  await page.click("#btn-jugar");
  await page.waitForFunction(() => window.__fnf.listo());
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => ({ z: window.__fnf.zona(), g: window.__fnf.geometria(), zona: !document.querySelector("#zona-tactil").classList.contains("oculto") }));
  assert.equal(r.z, null); assert.equal(r.zona, false); assert.equal(r.g.downscroll, false); assert.ok(r.g.rival, "en escritorio se ve el rival");
  await page.close();
});

test("ver zonas y menos efectos no rompen nada; el menú del teléfono no desborda en 360 px", async () => {
  const p = await partida({ width: 360, height: 740 }, { menosEfectos: true });
  await p.page.evaluate(() => window.__fnf.verZonas(true));
  await p.page.waitForTimeout(300);
  assert.ok(await p.page.evaluate(() => document.body.classList.contains("menos-efectos")));
  assert.ok(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(p.errores, []);
  await p.cerrar();
});
