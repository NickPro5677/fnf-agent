// Servidor estático mínimo para las pruebas (sirve web/).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

export function servirWeb() {
  const raiz = path.join(RAIZ, "web");
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${srv.address().port}/`, cerrar: () => srv.close() })));
}

export async function arrancarRelay(puerto) {
  const p = spawn("python3", [path.join(RAIZ, "agente/relay.py"), "--port", String(puerto)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((ok) => p.stdout.on("data", (d) => String(d).includes("listo") && ok()));
  return p;
}

export function arrancarAgente(script, puerto) {
  const p = spawn("python3", [path.join(RAIZ, "agente", script), "--relay", `ws://127.0.0.1:${puerto}`], { stdio: ["ignore", "pipe", "inherit"] });
  p.salida = "";
  p.stdout.on("data", (d) => { p.salida += d; });
  return p;
}

/** Elige canción, dificultad y jugador en el menú. */
export async function preparar(page, { cancion, dificultad = "easy", jugador = "humano", sonido = false }) {
  await page.click(`.cancion[data-id="${cancion}"]`);
  await page.selectOption("#dificultad", dificultad);
  await page.check(`input[name=jugador][value=${jugador}]`, { force: true });
  if (!sonido) await page.uncheck("#sonido");
}

export async function esperarResultado(page, timeout = 120000) {
  await page.waitForSelector("#resultados[open]", { timeout });
  return page.evaluate(() => window.__fnf.ultimo);
}
