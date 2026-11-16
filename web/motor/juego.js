// El juez: lleva el tiempo de la canción, recibe pulsaciones y decide sick/good/bad/miss.
// No dibuja nada ni sabe quién juega (persona, bot o IA externa).
import { VENTANAS, PUNTOS, VIDA, COMBO_EXTRA, MARGEN_SOLTAR_HOLD, COLA_FINAL } from "./constantes.js";

export function juzgar(desfase) {
  const d = Math.abs(desfase);
  if (d <= VENTANAS.sick) return "sick";
  if (d <= VENTANAS.good) return "good";
  if (d <= VENTANAS.bad) return "bad";
  return null;
}

export function precision(j) {
  const total = j.sick + j.good + j.bad + j.miss;
  if (!total) return 1;
  return (j.sick + 0.75 * j.good + 0.37 * j.bad) / total;
}

export function letra(acc, fallos) {
  if (fallos === 0 && acc >= 0.999) return "S+";
  if (acc >= 0.95) return "S";
  if (acc >= 0.9) return "A";
  if (acc >= 0.8) return "B";
  if (acc >= 0.7) return "C";
  return "D";
}

function terminadaParaActualizar(n) {
  return n.estado === "hecha" || n.estado === "fallo" || n.estado === "rival";
}

export class Juego {
  constructor(chart, { ambosLados = false } = {}) {
    this.chart = chart;
    this.notas = chart.notas.map((n, id) => ({
      ...n, id, cuenta: ambosLados || n.lado === "jugador", estado: "espera", finHold: null,
    }));
    this.jugables = this.notas.filter((n) => n.cuenta);
    this.fin = chart.duracion + COLA_FINAL;
    this.reiniciar();
  }

  reiniciar() {
    for (const n of this.notas) { n.estado = "espera"; n.finHold = null; }
    this.t = 0;
    this.vida = 0.5;
    this.puntos = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.j = { sick: 0, good: 0, bad: 0, miss: 0 };
    this.teclas = [false, false, false, false];
    this.resultado = null; // "victoria" | "derrota"
    // Cursores: las notas van ordenadas por t; no reescaneamos las ya cerradas.
    this.iActivo = 0;
    this.iJugable = 0;
    this.iDibujo = 0;
  }

  _acierto(tipo) {
    this.combo += 1;
    this.comboMax = Math.max(this.comboMax, this.combo);
    this.puntos += PUNTOS[tipo] + COMBO_EXTRA[tipo] * this.combo;
    this.vida = Math.min(1, this.vida + VIDA[tipo]);
    this.j[tipo] += 1;
  }

  _fallo(castigo = VIDA.miss) {
    this.combo = 0;
    this.vida = Math.max(0, this.vida - castigo);
    this.j.miss += 1;
  }

  _avanzarCursores() {
    const { notas, jugables } = this;
    while (this.iActivo < notas.length && terminadaParaActualizar(notas[this.iActivo])) this.iActivo += 1;
    while (this.iJugable < jugables.length) {
      const e = jugables[this.iJugable].estado;
      if (e === "hecha" || e === "fallo") this.iJugable += 1;
      else break;
    }
    while (this.iDibujo < notas.length && notas[this.iDibujo].estado === "hecha") this.iDibujo += 1;
  }

  /** Pulsar un carril en el tiempo t (ms de canción). Devuelve un evento o null. */
  presionar(lane, t = this.t) {
    if (this.resultado) return null;
    this.teclas[lane] = true;
    this._avanzarCursores();
    let nota = null;
    for (let i = this.iJugable; i < this.jugables.length; i++) {
      const n = this.jugables[i];
      if (n.estado !== "espera") continue;
      if (n.t - t > VENTANAS.miss) break;
      if (n.lane !== lane) continue;
      if (Math.abs(t - n.t) <= VENTANAS.miss) { nota = n; break; }
    }
    if (!nota) return null; // pulsar sin nota no castiga (ghost tapping)
    const desfase = t - nota.t;
    const tipo = juzgar(desfase);
    if (tipo) {
      this._acierto(tipo);
      if (nota.l > 0) { nota.estado = "hold"; nota.finHold = nota.t + nota.l; } else nota.estado = "hecha";
      this._avanzarCursores();
      return { tipo: "juicio", juicio: tipo, lane, desfase: Math.round(desfase), nota: nota.id };
    }
    if (desfase > 0) {
      nota.estado = "fallo";
      this._fallo();
      this._avanzarCursores();
      return { tipo: "juicio", juicio: "miss", lane, desfase: Math.round(desfase), nota: nota.id };
    }
    return null; // demasiado temprano: se ignora
  }

  soltar(lane, t = this.t) {
    this.teclas[lane] = false;
    const eventos = [];
    // Holds abiertos: como mucho uno por carril; partimos del cursor de jugables.
    for (let i = this.iJugable; i < this.jugables.length; i++) {
      const n = this.jugables[i];
      if (n.estado === "espera" && n.t - t > VENTANAS.miss) break;
      if (n.estado === "hold" && n.lane === lane) {
        if (t >= n.finHold - MARGEN_SOLTAR_HOLD) {
          n.estado = "hecha";
          this.puntos += PUNTOS.sustain;
          eventos.push({ tipo: "hold", ok: true, lane, nota: n.id });
        } else {
          n.estado = "fallo";
          this._fallo(VIDA.holdRoto);
          eventos.push({ tipo: "juicio", juicio: "miss", lane, desfase: 0, nota: n.id, holdRoto: true });
        }
      }
    }
    if (eventos.length) this._avanzarCursores();
    return eventos;
  }

  /** Avanza el tiempo. Devuelve los eventos ocurridos (fallos por no pulsar, notas del rival, fin). */
  actualizar(t) {
    const eventos = [];
    if (this.resultado) return eventos;
    this.t = t;
    this._avanzarCursores();
    const { notas } = this;
    for (let i = this.iActivo; i < notas.length; i++) {
      const n = notas[i];
      if (!n.cuenta) {
        if (n.estado === "espera") {
          if (t >= n.t) { n.estado = "rival"; eventos.push({ tipo: "rival", lane: n.lane, nota: n.id }); }
          else break; // ordenadas por t: el resto también está en el futuro
        }
        continue;
      }
      if (n.estado === "hold") {
        if (t >= n.finHold) {
          n.estado = "hecha";
          this.puntos += PUNTOS.sustain;
          eventos.push({ tipo: "hold", ok: true, lane: n.lane, nota: n.id });
        }
      } else if (n.estado === "espera") {
        if (t - n.t > VENTANAS.miss) {
          n.estado = "fallo";
          this._fallo();
          eventos.push({ tipo: "juicio", juicio: "miss", lane: n.lane, desfase: null, nota: n.id });
        } else if (n.t - t > VENTANAS.miss) {
          break; // demasiado pronto para miss; las siguientes aún más
        }
      }
    }
    this._avanzarCursores();
    if (this.vida <= 0) this.resultado = "derrota";
    else if (t > this.fin) this.resultado = "victoria";
    if (this.resultado) eventos.push({ tipo: "fin", resultado: this.resultado });
    return eventos;
  }

  get precision() { return precision(this.j); }

  resumen() {
    const acc = this.precision;
    return {
      resultado: this.resultado, puntos: this.puntos, precision: acc, combo: this.combo,
      comboMax: this.comboMax, juicios: { ...this.j }, total: this.jugables.length,
      letra: letra(acc, this.j.miss), fullCombo: this.j.miss === 0 && this.comboMax === this.jugables.length,
    };
  }
}
