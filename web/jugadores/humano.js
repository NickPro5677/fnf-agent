// Jugador humano: teclado (flechas o WASD) y una zona táctil con un solo manejador de punteros.
import { Dedos } from "./tactil.js";

const TECLAS = {
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3,
};

export class JugadorHumano {
  /**
   * @param {object} o
   * @param {HTMLElement[]} [o.zonas] elementos que reciben toques (zona sobre el lienzo y/o barra de botones)
   * @param {(el: HTMLElement, e: PointerEvent) => number} [o.carrilEn] carril bajo el puntero
   * @param {() => boolean} [o.vibrar]
   * @param {(teclas: number[]) => void} [o.alCambiar] para pintar qué columnas están pulsadas
   */
  constructor({ zonas = [], carrilEn = () => 0, vibrar = () => false, alCambiar = () => {} } = {}) {
    this.tipo = "humano";
    this.nombre = "Tú (manual)";
    this.zonas = zonas;
    this.carrilEn = carrilEn;
    this.vibrar = vibrar;
    this.alCambiar = alCambiar;
  }

  conectar(ctx) {
    this.ctx = ctx;
    this.limpiar = [];
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
    addEventListener("keydown", abajo);
    addEventListener("keyup", arriba);
    this.limpiar.push(() => { removeEventListener("keydown", abajo); removeEventListener("keyup", arriba); });

    this.dedos = new Dedos(
      (lane) => { ctx.presionar(lane, "toque"); if (this.vibrar()) navigator.vibrate?.(10); this.alCambiar(this.dedos.cuenta); },
      (lane) => { ctx.soltar(lane); this.alCambiar(this.dedos.cuenta); },
    );
    for (const el of this.zonas) {
      const evitar = (e) => e.preventDefault();
      const down = (e) => {
        e.preventDefault();
        try { el.setPointerCapture?.(e.pointerId); } catch { /* puntero sintético */ }
        this.dedos.abajo(e.pointerId, this.carrilEn(el, e));
      };
      const move = (e) => { if (this.dedos.dedos.has(e.pointerId)) this.dedos.mover(e.pointerId, this.carrilEn(el, e)); };
      const up = (e) => this.dedos.arriba(e.pointerId);
      const ev = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up], ["lostpointercapture", up], ["contextmenu", evitar], ["selectstart", evitar], ["touchstart", evitar]];
      for (const [n, f] of ev) el.addEventListener(n, f, { passive: false });
      this.limpiar.push(() => { for (const [n, f] of ev) el.removeEventListener(n, f); });
    }
  }

  cuadro() {}
  desconectar() {
    this.dedos?.soltarTodo();
    (this.limpiar || []).forEach((f) => f());
  }
}
