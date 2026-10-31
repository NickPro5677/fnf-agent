// Jugador humano: teclado (flechas o WASD) y botones táctiles.
const TECLAS = {
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3,
};

export class JugadorHumano {
  constructor({ botones = [] } = {}) {
    this.tipo = "humano";
    this.nombre = "Tú (manual)";
    this.botones = botones;
  }

  conectar(ctx) {
    this.ctx = ctx;
    const abajo = (e) => {
      if (e.repeat) return;
      const lane = TECLAS[e.code];
      if (lane === undefined) return;
      e.preventDefault();
      ctx.presionar(lane, "tecla");
    };
    const arriba = (e) => {
      const lane = TECLAS[e.code];
      if (lane === undefined) return;
      e.preventDefault();
      ctx.soltar(lane);
    };
    this.limpiar = [];
    addEventListener("keydown", abajo);
    addEventListener("keyup", arriba);
    this.limpiar.push(() => { removeEventListener("keydown", abajo); removeEventListener("keyup", arriba); });
    this.botones.forEach((b, lane) => {
      const on = (e) => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* puntero sintético o ya liberado */ } b.classList.add("activo"); ctx.presionar(lane, "toque"); };
      const off = (e) => { e.preventDefault(); if (!b.classList.contains("activo")) return; b.classList.remove("activo"); ctx.soltar(lane); };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("lostpointercapture", off);
      this.limpiar.push(() => { b.removeEventListener("pointerdown", on); b.removeEventListener("pointerup", off); b.removeEventListener("pointercancel", off); b.removeEventListener("lostpointercapture", off); });
    });
  }

  cuadro() {}
  desconectar() { (this.limpiar || []).forEach((f) => f()); this.botones.forEach((b) => b.classList.remove("activo")); }
}
