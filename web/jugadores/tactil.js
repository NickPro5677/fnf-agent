// Lógica táctil pura (sin DOM): qué carril toca cada dedo y cuántos dedos hay en cada carril.

/** Índice del centro más cercano a x. Así toda la anchura responde: no hay huecos entre columnas. */
export function carrilMasCercano(x, centros) {
  let mejor = 0;
  for (let i = 1; i < centros.length; i++) if (Math.abs(x - centros[i]) < Math.abs(x - centros[mejor])) mejor = i;
  return mejor;
}

/** Límites entre columnas (puntos medios entre centros), de 0 a ancho. */
export function limitesColumnas(centros, ancho) {
  const l = [0];
  for (let i = 1; i < centros.length; i++) l.push((centros[i - 1] + centros[i]) / 2);
  l.push(ancho);
  return l;
}

/** Columna en modo "botones": 4 franjas iguales sin huecos. */
export function carrilPorFranja(x, ancho, n = 4) {
  return Math.max(0, Math.min(n - 1, Math.floor((x / Math.max(1, ancho)) * n)));
}

/**
 * Cuenta dedos por carril. Pulsa al entrar el primer dedo y suelta solo cuando sale el último.
 * Un dedo que se desliza a otro carril cambia de carril.
 */
export class Dedos {
  constructor(presionar, soltar, n = 4) {
    this.presionar = presionar;
    this.soltar = soltar;
    this.dedos = new Map();
    this.cuenta = new Array(n).fill(0);
  }
  _entrar(lane) { if (this.cuenta[lane]++ === 0) this.presionar(lane); }
  _salir(lane) { if (this.cuenta[lane] > 0 && --this.cuenta[lane] === 0) this.soltar(lane); }
  abajo(id, lane) {
    if (this.dedos.has(id)) this.arriba(id);
    this.dedos.set(id, lane);
    this._entrar(lane);
  }
  mover(id, lane) {
    const antes = this.dedos.get(id);
    if (antes === undefined || antes === lane) return false;
    this.dedos.set(id, lane);
    this._entrar(lane);
    this._salir(antes);
    return true;
  }
  arriba(id) {
    const lane = this.dedos.get(id);
    if (lane === undefined) return;
    this.dedos.delete(id);
    this._salir(lane);
  }
  soltarTodo() { for (const id of [...this.dedos.keys()]) this.arriba(id); }
}
