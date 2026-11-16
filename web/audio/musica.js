// Música hecha con Web Audio a partir del chart (no hay archivos de audio con derechos).
// Si la persona carga su propio audio, se usa ese en lugar de la música sintetizada.
// El sintetizador no programa toda la canción de golpe: solo una ventana hacia delante
// (LOOKAHEAD_S) y `tick()` va reponiendo nodos. Así charts largos no crean miles de osciladores al start.

const MIDI = (m) => 440 * 2 ** ((m - 69) / 12);
/** Segundos de música sintetizada programados por delante del reloj de audio. */
export const LOOKAHEAD_S = 3;

export class Musica {
  constructor() {
    this.ctx = null; this.buffer = null; this.nombreAudio = ""; this.volumen = 0.7;
    this.bus = null; this.fuente = null; this.plan = null;
  }

  asegurar() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.ruido = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
      const d = this.ruido.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  async cargarArchivo(archivo) {
    const ctx = this.asegurar();
    if (!ctx) throw new Error("Este navegador no tiene Web Audio");
    this.buffer = await ctx.decodeAudioData(await archivo.arrayBuffer());
    this.nombreAudio = archivo.name;
  }

  quitarArchivo() { this.buffer = null; this.nombreAudio = ""; }

  _tono(bus, t, freq, dur, tipo = "triangle", vol = 0.12) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
    this.nodosProgramados += 1;
  }

  _bombo(bus, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
    this.nodosProgramados += 1;
  }

  _platillo(bus, t, vol = 0.06) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.ruido; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + 0.06);
    this.nodosProgramados += 1;
  }

  /** Empieza a sonar: el ms 0 de la canción suena dentro de `esperaMs`. */
  iniciar(chart, info = {}, esperaMs = 0) {
    this.detener();
    const ctx = this.asegurar();
    if (!ctx) return;
    const bus = ctx.createGain();
    bus.gain.value = this.volumen;
    bus.connect(ctx.destination);
    this.bus = bus;
    this.nodosProgramados = 0;
    const t0 = ctx.currentTime + esperaMs / 1000;
    if (this.buffer) {
      const s = ctx.createBufferSource(); s.buffer = this.buffer; s.connect(bus);
      s.start(Math.max(ctx.currentTime, t0), Math.max(0, -esperaMs / 1000));
      this.fuente = s;
      this.nodosProgramados = 1;
      return;
    }
    const m = { raiz: 57, escala: [0, 2, 3, 5, 7, 8, 10], acordes: [0, 5, 3, 4], ...info };
    const beat = 60 / (chart.bpm || 120);
    const total = chart.duracion / 1000 + 1;
    this.plan = {
      t0, beat, total, m, notas: chart.notas, bus,
      iBeat: 0, iNota: 0, programadoHasta: -Infinity,
    };
    this._programarHasta(ctx.currentTime + LOOKAHEAD_S);
  }

  /** Reponer nodos del sintetizador. Llamar desde el bucle del juego. */
  tick() {
    if (!this.plan || !this.ctx) return;
    this._programarHasta(this.ctx.currentTime + LOOKAHEAD_S);
  }

  /** Cuántos nodos quedaría por programar si se hiciera toda la canción de golpe (tests / métricas). */
  nodosTotalesEstimados() {
    const p = this.plan;
    if (!p) return this.nodosProgramados || 0;
    const beats = Math.ceil(p.total / p.beat);
    return beats * 2 + Math.ceil(beats / 4) * 2 + p.notas.length;
  }

  _programarHasta(hasta) {
    const p = this.plan;
    if (!p || hasta <= p.programadoHasta) return;
    const { t0, beat, total, m, notas, bus } = p;
    const ahora = this.ctx.currentTime;

    while (p.iBeat * beat < total) {
      const t = t0 + p.iBeat * beat;
      if (t > hasta) break;
      if (t >= ahora) {
        this._bombo(bus, t);
        this._platillo(bus, t + beat / 2);
        if (p.iBeat % 4 === 0) {
          const grado = m.acordes[Math.floor(p.iBeat / 4) % m.acordes.length];
          const nota = m.raiz - 12 + m.escala[grado % m.escala.length];
          this._tono(bus, t, MIDI(nota), beat * 3.5, "sawtooth", 0.05);
          this._tono(bus, t, MIDI(nota + 7), beat * 3.5, "sine", 0.04);
        }
      }
      p.iBeat += 1;
    }

    while (p.iNota < notas.length) {
      const n = notas[p.iNota];
      const t = t0 + n.t / 1000;
      if (t > hasta) break;
      if (t >= ahora) {
        const compas = Math.floor(n.t / 1000 / beat / 4);
        const grado = m.acordes[compas % m.acordes.length] + [0, 2, 4, 7][n.lane];
        const nota = m.raiz + m.escala[grado % 7] + 12 * Math.floor(grado / 7) + (n.lado === "rival" ? -12 : 0);
        this._tono(bus, t, MIDI(nota), Math.max(0.15, n.l / 1000), n.lado === "rival" ? "square" : "triangle", n.lado === "rival" ? 0.05 : 0.09);
      }
      p.iNota += 1;
    }

    p.programadoHasta = hasta;
    if (p.iBeat * beat >= total && p.iNota >= notas.length) this.plan = null;
  }

  fallo() {
    if (!this.ctx || !this.bus) return;
    this._tono(this.bus, this.ctx.currentTime, 110, 0.15, "sawtooth", 0.06);
  }

  detener() {
    this.plan = null;
    try { this.fuente?.stop(); } catch { /* ya parado */ }
    this.fuente = null;
    if (this.bus) { this.bus.disconnect(); this.bus = null; }
  }
}
