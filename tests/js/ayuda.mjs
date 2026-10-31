import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Juego } from "../../web/motor/juego.js";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const leerJSON = (rel) => JSON.parse(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

/** Simula una partida completa a 60 fps con un jugador (bot o remoto falso). */
export function simular(chart, jugador, { paso = 1000 / 60, opciones = {} } = {}) {
  const juego = new Juego(chart, opciones);
  const eventos = [];
  const ctx = {
    juego, cancion: chart.titulo,
    presionar: (lane) => { const e = juego.presionar(lane); if (e) eventos.push(e); },
    soltar: (lane) => eventos.push(...juego.soltar(lane)),
    pensar: () => {},
  };
  jugador.conectar(ctx);
  for (let t = -1000; !juego.resultado; t += paso) {
    eventos.push(...juego.actualizar(t));
    if (!juego.resultado) jugador.cuadro(t);
  }
  return { juego, eventos, resumen: juego.resumen() };
}
