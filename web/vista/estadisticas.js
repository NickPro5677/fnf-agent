// Estadísticas de una partida y récords guardados en este dispositivo.

/** Media y desviación del desfase (ms) de los toques con juicio (sin contar fallos). */
export function estadisticas(tiempos) {
  const xs = tiempos.filter((p) => p.d != null).map((p) => p.d);
  if (!xs.length) return { n: 0, media: 0, desv: 0 };
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const desv = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length);
  return { n: xs.length, media, desv };
}

/** Cubetas de `ancho` ms entre −180 y +180. */
export function histograma(tiempos, ancho = 15) {
  const cubetas = new Array(Math.round(360 / ancho)).fill(0);
  for (const p of tiempos) {
    if (p.d == null) continue;
    const i = Math.floor((Math.max(-180, Math.min(179.9, p.d)) + 180) / ancho);
    cubetas[i]++;
  }
  return { cubetas, ancho };
}

const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lleno o privado */ } };

/** Guarda la partida humana si es la mejor (por precisión, luego puntos). */
export function guardarMejor(clave, fila) {
  const todo = leer("fnf-mejores");
  const antes = todo[clave];
  if (!antes || fila.precision > antes.precision || (fila.precision === antes.precision && fila.puntos > antes.puntos)) {
    todo[clave] = { ...fila, fecha: Date.now() };
    escribir("fnf-mejores", todo);
  }
}
export const leerMejor = (clave) => leer("fnf-mejores")[clave] || null;
export function guardarBot(clave, fila) { const todo = leer("fnf-bot"); todo[clave] = fila; escribir("fnf-bot", todo); }
export const leerBot = (clave) => leer("fnf-bot")[clave] || null;
