// Bot integrado. Modo "perfecto" pulsa justo a tiempo; modo "humano" se equivoca un poco.
// precision: 0.5 (torpe) .. 1 (perfecto). Con aleatorio con semilla para que los tests sean repetibles.

export function aleatorioConSemilla(semilla = 1) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Decide de antemano cuándo pulsará el bot cada nota. */
export function planificar(notas, { modo = "perfecto", precision = 1, semilla = 7 } = {}) {
  const rnd = aleatorioConSemilla(semilla);
  const p = Math.min(1, Math.max(0.5, precision));
  return notas.map((n) => {
    if (modo === "perfecto") return { id: n.id, lane: n.lane, t: n.t, desfase: 0, salta: false, suelta: n.t + (n.l > 0 ? n.l : 40) };
    const sigma = (1 - p) * 160;
    const desfase = Math.round(gauss(rnd) * sigma);
    const salta = rnd() < (1 - p) * 0.25;
    const sueltaHold = n.t + n.l - (rnd() < (1 - p) * 0.3 ? n.l * 0.5 : 0);
    return { id: n.id, lane: n.lane, t: n.t, desfase, salta, suelta: n.l > 0 ? sueltaHold : n.t + desfase + 40 };
  });
}

export class JugadorBot {
  constructor({ modo = "perfecto", precision = 1, semilla = 7 } = {}) {
    this.tipo = "bot";
    this.opciones = { modo, precision, semilla };
    this.nombre = modo === "perfecto" ? "Bot perfecto" : `Bot humano (${Math.round(precision * 100)} %)`;
  }

  conectar(ctx) {
    this.ctx = ctx;
    this.plan = planificar(ctx.juego.jugables, this.opciones);
    this.i = 0;
    this.abiertas = [];
  }

  cuadro(t) {
    const { ctx } = this;
    // soltar teclas cuyo tiempo pasó
    this.abiertas = this.abiertas.filter((p) => {
      if (t >= p.suelta) { ctx.soltar(p.lane); return false; }
      return true;
    });
    while (this.i < this.plan.length && t >= this.plan[this.i].t + this.plan[this.i].desfase) {
      const p = this.plan[this.i++];
      if (p.salta) { ctx.pensar(`Me salto la nota ${p.id} (error a propósito)`); continue; }
      const yaAbierta = this.abiertas.find((a) => a.lane === p.lane);
      if (yaAbierta) { ctx.soltar(p.lane); this.abiertas = this.abiertas.filter((a) => a !== yaAbierta); }
      const motivo = this.opciones.modo === "perfecto" ? `nota ${p.id} llega ahora` : `nota ${p.id}, apunto con ${p.desfase > 0 ? "+" : ""}${p.desfase} ms`;
      ctx.presionar(p.lane, motivo);
      this.abiertas.push(p);
    }
  }

  desconectar() { for (const p of this.abiertas || []) this.ctx.soltar(p.lane); this.abiertas = []; }
}
