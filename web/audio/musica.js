// Música hecha con Web Audio a partir del chart (no hay archivos de audio con derechos).
// Si la persona carga su propio audio, se usa ese en lugar de la música sintetizada.

const MIDI = (m) => 440 * 2 ** ((m - 69) / 12);

export class Musica {
  constructor() { this.ctx = null; this.buffer = null; this.nombreAudio = ""; this.volumen = 0.7; }

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
  }

  _bombo(bus, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
  }

  _platillo(bus, t, vol = 0.06) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.ruido; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + 0.06);
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
    const t0 = ctx.currentTime + esperaMs / 1000;
    if (this.buffer) {
      const s = ctx.createBufferSource(); s.buffer = this.buffer; s.connect(bus);
      s.start(Math.max(ctx.currentTime, t0), Math.max(0, -esperaMs / 1000));
      this.fuente = s;
      return;
    }
    const m = { raiz: 57, escala: [0, 2, 3, 5, 7, 8, 10], acordes: [0, 5, 3, 4], ...info };
    const beat = 60 / (chart.bpm || 120);
    const total = chart.duracion / 1000 + 1;
    for (let k = 0; k * beat < total; k++) {
      const t = t0 + k * beat;
      if (t < ctx.currentTime) continue;
      this._bombo(bus, t);
      this._platillo(bus, t + beat / 2);
      if (k % 4 === 0) {
        const grado = m.acordes[Math.floor(k / 4) % m.acordes.length];
        const nota = m.raiz - 12 + m.escala[grado % m.escala.length];
        this._tono(bus, t, MIDI(nota), beat * 3.5, "sawtooth", 0.05);
        this._tono(bus, t, MIDI(nota + 7), beat * 3.5, "sine", 0.04);
      }
    }
    for (const n of chart.notas) {
      const t = t0 + n.t / 1000;
      if (t < ctx.currentTime) continue;
      const compas = Math.floor(n.t / 1000 / beat / 4);
      const grado = m.acordes[compas % m.acordes.length] + [0, 2, 4, 7][n.lane];
      const nota = m.raiz + m.escala[grado % 7] + 12 * Math.floor(grado / 7) + (n.lado === "rival" ? -12 : 0);
      this._tono(bus, t, MIDI(nota), Math.max(0.15, n.l / 1000), n.lado === "rival" ? "square" : "triangle", n.lado === "rival" ? 0.05 : 0.09);
    }
  }

  fallo() {
    if (!this.ctx || !this.bus) return;
    this._tono(this.bus, this.ctx.currentTime, 110, 0.15, "sawtooth", 0.06);
  }

  detener() {
    try { this.fuente?.stop(); } catch { /* ya parado */ }
    this.fuente = null;
    if (this.bus) { this.bus.disconnect(); this.bus = null; }
  }
}
