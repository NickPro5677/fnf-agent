// Bot integrado con perfiles. Decide nota a nota según el estado de la partida (combo, vida, cansancio,
// pasajes densos), con errores realistas: colas largas, sesgo temprano/tarde, presión y fatiga.
// Todo sale de un aleatorio con semilla: misma semilla + mismo perfil = misma partida.

export function aleatorioConSemilla(semilla = 1) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Perfiles. sigma: dispersión (ms). sesgo: + tarde / − temprano (ms). cola: prob. de un toque muy desviado.
 * densidad: cuánto empeora en ráfagas. cansancio: cuánto empeora hacia el final. presion: cuánto empeora con combo alto
 * o vida baja. salto: prob. de no pulsar. equivocado: prob. de pulsar el carril de al lado. sueltaAntes: prob. de soltar
 * una nota larga a la mitad.
 */
export const PERFILES = {
  perfecto: { sigma: 0, sesgo: 0, cola: 0, densidad: 0, cansancio: 0, presion: 0, salto: 0, equivocado: 0, sueltaAntes: 0 },
  pro: { sigma: 11, sesgo: -2, cola: 0.015, densidad: 0.25, cansancio: 0.1, presion: 0.05, salto: 0, equivocado: 0, sueltaAntes: 0.01 },
  bueno: { sigma: 24, sesgo: 5, cola: 0.04, densidad: 0.5, cansancio: 0.2, presion: 0.15, salto: 0.004, equivocado: 0.002, sueltaAntes: 0.04 },
  novato: { sigma: 34, sesgo: 16, cola: 0.06, densidad: 0.7, cansancio: 0.3, presion: 0.2, salto: 0.025, equivocado: 0.02, sueltaAntes: 0.15 },
  nervioso: { sigma: 18, sesgo: -8, cola: 0.05, densidad: 0.4, cansancio: 0, presion: 1.6, salto: 0.01, equivocado: 0.01, sueltaAntes: 0.05 },
  cansado: { sigma: 14, sesgo: 6, cola: 0.03, densidad: 0.4, cansancio: 2.2, presion: 0, salto: 0.006, equivocado: 0.004, sueltaAntes: 0.08 },
};
export const NOMBRES_PERFIL = { perfecto: "Perfecto", pro: "Pro", bueno: "Bueno", novato: "Novato", nervioso: "Nervioso", cansado: "Cansado", personalizado: "Personalizado" };

const ANTICIPO = 450; // ms antes de la nota en que el bot decide cómo la va a pulsar

/** Densidad local: notas del jugador a menos de 220 ms, acordes y cambios de carril rápidos (0..~3). */
export function densidad(notas, i) {
  const n = notas[i];
  let d = 0;
  for (let k = i - 1; k >= 0 && n.t - notas[k].t < 220; k--) d += notas[k].t === n.t ? 0.6 : 0.5;
  for (let k = i + 1; k < notas.length && notas[k].t - n.t < 220; k++) d += notas[k].t === n.t ? 0.6 : 0.3;
  const prev = notas[i - 1];
  if (prev && prev.lane !== n.lane && n.t - prev.t < 160) d += 0.4;
  return Math.min(3, d);
}

/** Desfase (ms) para una nota con un perfil y un estado { progreso 0..1, combo, vida, dens }. */
export function decidir(perfil, estado, rnd) {
  if (!perfil.sigma && !perfil.salto && !perfil.equivocado) return { desfase: 0, salta: false, equivocado: false, sueltaAntes: false, sigma: 0 };
  const { progreso = 0, combo = 0, vida = 0.5, dens = 0 } = estado;
  const presion = Math.min(1, combo / 40) + (vida < 0.3 ? 0.6 : 0);
  const fatiga = 1 + perfil.cansancio * Math.pow(progreso, 1.6);
  const sigma = perfil.sigma * (1 + perfil.densidad * dens) * fatiga * (1 + perfil.presion * presion);
  const g = gauss(rnd);
  const cola = rnd() < perfil.cola * fatiga;
  const desfase = Math.round(perfil.sesgo * fatiga + g * sigma * (cola ? 4 : 1));
  const factorFallo = (1 + dens * 0.5) * fatiga * (1 + perfil.presion * presion);
  return {
    desfase,
    salta: rnd() < perfil.salto * factorFallo,
    equivocado: rnd() < perfil.equivocado * factorFallo,
    sueltaAntes: rnd() < perfil.sueltaAntes * fatiga,
    sigma: Math.round(sigma),
  };
}

/** Compatibilidad 4.0: plan completo por adelantado (modo "perfecto" o "humano" con precision 0.5..1). */
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

/** Perfil "humano" de la 4.0 con una precisión 0.5..1 (para quien guardó ese ajuste). */
export function perfilDesdePrecision(precision) {
  const p = Math.min(1, Math.max(0.5, precision));
  return { ...PERFILES.bueno, sigma: (1 - p) * 160, sesgo: 0, salto: (1 - p) * 0.25, sueltaAntes: (1 - p) * 0.3 };
}

export class JugadorBot {
  /**
   * @param {object} o
   * @param {string} [o.perfil] clave de PERFILES o "personalizado"
   * @param {object} [o.ajustes] valores del perfil personalizado (se mezclan sobre "bueno")
   * @param {number} [o.semilla]
   * @param {"perfecto"|"humano"} [o.modo] compatibilidad 4.0
   * @param {number} [o.precision] compatibilidad 4.0
   */
  constructor({ perfil, ajustes = {}, semilla = 7, modo, precision = 1 } = {}) {
    this.tipo = "bot";
    if (!perfil) perfil = modo === "humano" ? "precision" : "perfecto";
    this.perfilId = perfil;
    this.perfil = perfil === "precision" ? perfilDesdePrecision(precision)
      : perfil === "personalizado" ? { ...PERFILES.bueno, ...ajustes } : (PERFILES[perfil] || PERFILES.perfecto);
    this.semilla = semilla;
    this.nombre = perfil === "precision" ? `Bot humano (${Math.round(precision * 100)} %)` : `Bot ${NOMBRES_PERFIL[perfil] || perfil}`;
  }

  conectar(ctx) {
    this.ctx = ctx;
    this.rnd = aleatorioConSemilla(this.semilla);
    this.notas = ctx.juego.jugables;
    this.dur = Math.max(1, this.notas.at(-1)?.t || 1);
    this.siguiente = 0; // próxima nota sin decidir
    this.planes = []; // decididas y pendientes de pulsar
    this.abiertas = [];
    this.perfecto = !this.perfil.sigma && !this.perfil.salto && !this.perfil.equivocado;
  }

  /** Marcas para dibujar: cuándo planea pulsar cada carril. */
  marcas() { return (this.planes || []).filter((p) => !p.salta).map((p) => ({ lane: p.carril, t: p.t + p.desfase })); }

  cuadro(t) {
    const { ctx } = this;
    const juego = ctx.juego;
    this.abiertas = this.abiertas.filter((p) => {
      if (t >= p.suelta) { ctx.soltar(p.carril); return false; }
      return true;
    });
    // decidir las notas que entran en el anticipo, con el estado de este momento
    while (this.siguiente < this.notas.length && this.notas[this.siguiente].t - t <= ANTICIPO) {
      const i = this.siguiente++;
      const n = this.notas[i];
      const d = this.perfecto ? { desfase: 0, salta: false, equivocado: false, sueltaAntes: false, sigma: 0 }
        : decidir(this.perfil, { progreso: n.t / this.dur, combo: juego.combo, vida: juego.vida, dens: densidad(this.notas, i) }, this.rnd);
      const carril = d.equivocado ? (n.lane + (this.rnd() < 0.5 ? 1 : 3)) % 4 : n.lane;
      const suelta = n.l > 0 ? n.t + n.l * (d.sueltaAntes ? 0.5 : 1) : n.t + d.desfase + 40;
      this.planes.push({ id: n.id, lane: n.lane, carril, t: n.t, desfase: d.desfase, salta: d.salta, suelta, sigma: d.sigma, equivocado: d.equivocado });
    }
    this.planes.sort((a, b) => a.t + a.desfase - (b.t + b.desfase));
    while (this.planes.length && t >= this.planes[0].t + this.planes[0].desfase) {
      const p = this.planes.shift();
      if (p.salta) { ctx.pensar(`Me salto la nota ${p.id}`); continue; }
      const yaAbierta = this.abiertas.find((a) => a.carril === p.carril);
      if (yaAbierta) { ctx.soltar(p.carril); this.abiertas = this.abiertas.filter((a) => a !== yaAbierta); }
      const motivo = this.perfecto ? `nota ${p.id} llega ahora`
        : p.equivocado ? `nota ${p.id}: me equivoco de carril`
          : `nota ${p.id}, ${p.desfase > 0 ? "+" : ""}${p.desfase} ms (σ ${p.sigma})`;
      ctx.presionar(p.carril, motivo);
      this.abiertas.push(p);
    }
  }

  desconectar() { for (const p of this.abiertas || []) this.ctx.soltar(p.carril); this.abiertas = []; }
}
