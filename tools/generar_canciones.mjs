// Genera las canciones de demo (charts originales, licencia CC0) en web/canciones/.
// Uso: node tools/generar_canciones.mjs   (siempre produce los mismos archivos)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aleatorioConSemilla } from "../web/jugadores/bot.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "canciones");

const CANCIONES = [
  { id: "primer-paso", titulo: "Primer paso", bpm: 100, compases: 16, semilla: 11, velocidad: [1.0, 1.1, 1.3],
    musica: { raiz: 57, escala: [0, 2, 4, 5, 7, 9, 11], acordes: [0, 4, 5, 3], color: "#7c5cff" } },
  { id: "luz-de-neon", titulo: "Luz de neón", bpm: 124, compases: 20, semilla: 23, velocidad: [1.1, 1.3, 1.6],
    musica: { raiz: 52, escala: [0, 2, 3, 5, 7, 8, 10], acordes: [0, 5, 2, 6], color: "#ff4fa3" } },
  { id: "turbo-cuantico", titulo: "Turbo cuántico", bpm: 150, compases: 24, semilla: 37, velocidad: [1.3, 1.6, 2.0],
    musica: { raiz: 50, escala: [0, 2, 3, 5, 7, 9, 10], acordes: [0, 3, 4, 0], color: "#25c2a0" } },
];

const DIFS = {
  easy: { paso: 1, prob: 0.55, hold: 0.25 },
  normal: { paso: 0.5, prob: 0.45, hold: 0.18 },
  hard: { paso: 0.5, prob: 0.7, hold: 0.12, dobles: 0.15 },
};

function generar(c, dif, conf) {
  const rnd = aleatorioConSemilla(c.semilla * 101 + dif.length);
  const beat = 60000 / c.bpm;
  const inicio = 4 * beat; // un compás de cuenta atrás
  const notas = [];
  // Bloques de 2 compases: el rival propone, el jugador responde con la misma frase (estilo FNF).
  for (let bloque = 0; bloque < c.compases / 4; bloque++) {
    const frase = [];
    const libre = [0, 0, 0, 0];
    let ultimo = -1;
    for (let b = 0; b < 8; b += conf.paso) {
      if (rnd() > conf.prob && b !== 0) continue;
      let lane = Math.floor(rnd() * 4);
      if (lane === ultimo && rnd() < 0.6) lane = (lane + 1 + Math.floor(rnd() * 3)) % 4;
      if (b < libre[lane]) continue;
      const largo = rnd() < conf.hold && b + 1.5 <= 8 ? (rnd() < 0.5 ? 1 : 1.5) : 0;
      frase.push({ b, lane, largo });
      libre[lane] = b + largo + conf.paso + 0.25;
      ultimo = lane;
      if (conf.dobles && rnd() < conf.dobles) {
        const otro = (lane + 2) % 4;
        if (b >= libre[otro]) { frase.push({ b, lane: otro, largo: 0 }); libre[otro] = b + conf.paso + 0.25; }
      }
    }
    const base = inicio + bloque * 16 * beat;
    for (const f of frase) notas.push({ t: Math.round(base + f.b * beat), d: f.lane + 4, ...(f.largo ? { l: Math.round(f.largo * beat) } : {}) });
    for (const f of frase) notas.push({ t: Math.round(base + (8 + f.b) * beat), d: f.lane, ...(f.largo ? { l: Math.round(f.largo * beat) } : {}) });
  }
  return notas.sort((a, b) => a.t - b.t || a.d - b.d);
}

fs.mkdirSync(DIR, { recursive: true });
const lista = [];
for (const c of CANCIONES) {
  const notes = {};
  const scrollSpeed = {};
  Object.entries(DIFS).forEach(([dif, conf], i) => { notes[dif] = generar(c, dif, conf); scrollSpeed[dif] = c.velocidad[i]; });
  const json = {
    version: "2.0.0",
    titulo: c.titulo,
    bpm: c.bpm,
    licencia: "CC0-1.0 (chart y música originales de FNF-Agent)",
    musica: c.musica,
    scrollSpeed,
    events: [],
    notes,
  };
  fs.writeFileSync(path.join(DIR, `${c.id}.json`), JSON.stringify(json, null, 1) + "\n");
  lista.push({ id: c.id, titulo: c.titulo, bpm: c.bpm, color: c.musica.color,
    notas: Object.fromEntries(Object.entries(notes).map(([d, n]) => [d, n.filter((x) => x.d < 4).length])) });
}
fs.writeFileSync(path.join(DIR, "lista.json"), JSON.stringify(lista, null, 1) + "\n");
console.log(lista.map((l) => `${l.id}: ${JSON.stringify(l.notas)}`).join("\n"));
