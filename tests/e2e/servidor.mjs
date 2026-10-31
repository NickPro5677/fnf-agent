// Servidor estático mínimo para las pruebas (sirve web/).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

export const TOKEN = "e2e-" + Math.random().toString(36).slice(2, 10);
// HOME temporal: el relay guarda su token en ~/.fnf-agent y no queremos tocar el real.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "fnf-e2e-"));
const ENV = { ...process.env, HOME, FNF_TOKEN: TOKEN };

export async function arrancarRelay(puerto, { retraso = 0 } = {}) {
  const args = [path.join(RAIZ, "agente/relay.py"), "--port", String(puerto), "--token", TOKEN];
  if (retraso) args.push("--retraso", String(retraso));
  const p = spawn("python3", args, { stdio: ["ignore", "pipe", "inherit"], env: ENV });
  await new Promise((ok) => p.stdout.on("data", (d) => String(d).includes("listo") && ok()));
  return p;
}

export function arrancarAgente(script, puerto) {
  const cmd = script.endsWith(".mjs") ? process.execPath : "python3";
  const p = spawn(cmd, [path.join(RAIZ, "agente", script), "--relay", `ws://127.0.0.1:${puerto}`], { stdio: ["ignore", "pipe", "inherit"], env: ENV });
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

/** Rellena los ajustes de IA externa (host, puerto, token) y pulsa Conectar. */
export async function conectarIA(page, puerto, { token = TOKEN, modo } = {}) {
  await page.fill("#url-relay", "127.0.0.1");
  await page.fill("#puerto-relay", String(puerto));
  await page.fill("#token-relay", token);
  if (modo) await page.selectOption("#modo-ia", modo);
  await page.click("#btn-conectar");
}
