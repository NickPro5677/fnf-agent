// Dibuja el juego en un <canvas>: carriles, flechas, notas largas, receptores, popups y barra de vida.
export const COLORES = ["#b07cff", "#3fd0ff", "#3ef08a", "#ff5c7a"];
const GIRO = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // izquierda, abajo, arriba, derecha

function flecha(c, x, y, tam, lane, relleno, borde, ancho = 3) {
  c.save();
  c.translate(x, y);
  c.rotate(GIRO[lane]);
  const s = tam / 2;
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(s, 0);
  c.lineTo(s * 0.42, 0);
  c.lineTo(s * 0.42, s);
  c.lineTo(-s * 0.42, s);
  c.lineTo(-s * 0.42, 0);
  c.lineTo(-s, 0);
  c.closePath();
  c.lineJoin = "round";
  if (relleno) { c.fillStyle = relleno; c.fill(); }
  if (borde) { c.lineWidth = ancho; c.strokeStyle = borde; c.stroke(); }
  c.restore();
}

export class Lienzo {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext("2d");
    this.efectos = [];
    this.rayos = [];
  }

  ajustar() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    this.W = w; this.H = h; this.dpr = dpr;
  }

  // `reserva`: px a la izquierda ocupados por el panel de la IA (0 si no se ve).
  geometria(reserva = 0) {
    const { W } = this;
    const dos = W >= 640;
    if (!dos && reserva > 0) {
      // Móvil con panel de IA: el panel ocupa la columna del rival; solo se dibuja el jugador.
      const ancho = Math.min(120, (W * 0.6 * 0.92) / 4);
      const cx = W * 0.69;
      return { dos, ancho, anchoR: 0, recY: Math.max(60, ancho * 0.85), jugador: [0, 1, 2, 3].map((i) => cx + (i - 1.5) * ancho), rival: null, centro: cx };
    }
    // En pantallas anchas: rival a la izquierda y jugador a la derecha (después del panel, si lo hay).
    // En el móvil: rival pequeño a la izquierda (40 %) y jugador grande a la derecha (60 %).
    const x0 = dos ? Math.min(reserva, W * 0.4) : 0;
    const Wu = W - x0;
    const zonaJ = dos ? Wu / 2 : W * 0.6;
    const ancho = Math.min(120, (zonaJ * 0.92) / 4);
    const anchoR = dos ? ancho * 0.8 : Math.min(ancho * 0.7, (W * 0.38 * 0.92) / 4);
    const jugadorX = dos ? x0 + Wu * 0.73 : W * 0.69;
    const rivalX = dos ? x0 + Wu * 0.27 : W * 0.2;
    const lanesX = (cx, a) => [0, 1, 2, 3].map((i) => cx + (i - 1.5) * a);
    return { dos, ancho, anchoR, recY: Math.max(60, ancho * 0.85), jugador: lanesX(jugadorX, ancho), rival: lanesX(rivalX, anchoR), centro: x0 + Wu / 2 };
  }

  efecto(e) { this.efectos.push({ ...e, desde: performance.now() }); }
  rayo(lane, texto, color) { this.rayos.push({ lane, texto, color, desde: performance.now() }); }

  dibujar(juego, t, { velocidad = 1, bpm = 120, color = "#7c5cff", mostrarIA = false, reserva = 0 } = {}) {
    this.ajustar();
    const { c, W, H, dpr } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = this.geometria(reserva);
    const px = 0.45 * velocidad * Math.min(1.4, Math.max(0.75, H / 800));
    const ahora = performance.now();

    // fondo con pulso al ritmo
    const beat = 60000 / bpm;
    const pulso = t > 0 ? Math.max(0, 1 - ((t % beat) / beat) * 3) : 0;
    const fondo = c.createLinearGradient(0, 0, 0, H);
    fondo.addColorStop(0, "#14102a");
    fondo.addColorStop(1, "#05040c");
    c.fillStyle = fondo;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.18 + pulso * 0.22;
    const rad = c.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, Math.max(W, H) * 0.7);
    rad.addColorStop(0, color);
    rad.addColorStop(1, "transparent");
    c.fillStyle = rad;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;

    // rayos de decisiones de la IA
    this.rayos = this.rayos.filter((r) => ahora - r.desde < 450);
    for (const r of this.rayos) {
      const a = 1 - (ahora - r.desde) / 450;
      c.globalAlpha = 0.35 * a;
      c.fillStyle = r.color || COLORES[r.lane];
      c.fillRect(g.jugador[r.lane] - g.ancho * 0.4, 0, g.ancho * 0.8, H);
      c.globalAlpha = a;
      if (mostrarIA && r.texto) {
        c.fillStyle = "#fff";
        c.font = `600 ${Math.max(11, g.ancho * 0.16)}px system-ui, sans-serif`;
        c.textAlign = "center";
        c.fillText(r.texto, g.jugador[r.lane], g.recY + g.ancho * 0.85);
      }
      c.globalAlpha = 1;
    }

    // receptores
    const pintarReceptores = (xs, tam, teclas) => xs && xs.forEach((x, lane) => {
      const on = teclas?.[lane];
      flecha(c, x, g.recY, tam * (on ? 0.86 : 0.8), lane, on ? COLORES[lane] + "aa" : "#ffffff14", on ? "#fff" : "#9a93c8", 3);
    });
    pintarReceptores(g.rival, g.anchoR, this.rivalOn);
    pintarReceptores(g.jugador, g.ancho, juego.teclas);

    // notas
    for (const n of juego.notas) {
      const xs = n.lado === "jugador" || n.cuenta ? g.jugador : g.rival;
      if (!xs) continue;
      if (n.lado === "rival" && !n.cuenta && n.estado !== "espera" && t > n.t + n.l) continue;
      if (n.estado === "hecha") continue;
      const tam = (xs === g.jugador ? g.ancho : g.anchoR) * 0.8;
      let y = g.recY + (n.t - t) * px;
      if (y > H + tam) break;
      const yFin = g.recY + (n.t + n.l - t) * px;
      if (yFin < -tam) continue;
      const fallo = n.estado === "fallo";
      const sosteniendo = n.estado === "hold" || (n.estado === "rival" && n.l > 0);
      if (sosteniendo) y = g.recY;
      c.globalAlpha = fallo ? 0.3 : n.lado === "rival" && !n.cuenta ? 0.8 : 1;
      if (n.l > 0 && yFin > y) {
        c.fillStyle = COLORES[n.lane] + (sosteniendo ? "dd" : "88");
        const w = tam * 0.3;
        c.beginPath();
        if (c.roundRect) c.roundRect(xs[n.lane] - w / 2, y, w, yFin - y, w / 2); else c.rect(xs[n.lane] - w / 2, y, w, yFin - y);
        c.fill();
      }
      if (!sosteniendo && n.estado !== "rival") flecha(c, xs[n.lane], y, tam, n.lane, COLORES[n.lane], "#0b0820", 3);
      c.globalAlpha = 1;
    }

    // destellos al acertar
    this.efectos = this.efectos.filter((e) => ahora - e.desde < 700);
    for (const e of this.efectos) {
      const p = (ahora - e.desde) / 700;
      if (e.tipo === "destello") {
        const xs = e.rival ? g.rival : g.jugador;
        if (!xs || p > 0.4) continue;
        const q = p / 0.4;
        c.globalAlpha = 1 - q;
        c.strokeStyle = COLORES[e.lane];
        c.lineWidth = 4;
        c.beginPath();
        c.arc(xs[e.lane], g.recY, (e.rival ? g.anchoR : g.ancho) * (0.35 + q * 0.35), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      } else if (e.tipo === "popup") {
        c.globalAlpha = Math.min(1, (1 - p) * 2);
        const cx = g.centro;
        const y = H * 0.45 - p * 30;
        c.textAlign = "center";
        c.font = `800 ${Math.round(Math.min(46, W / 9) * (1 + (p < 0.1 ? (0.1 - p) * 3 : 0)))}px system-ui, sans-serif`;
        c.lineWidth = 6; c.strokeStyle = "#0b0820"; c.strokeText(e.texto, cx, y);
        c.fillStyle = e.color; c.fillText(e.texto, cx, y);
        if (e.combo >= 5) {
          c.font = `700 ${Math.round(Math.min(28, W / 15))}px system-ui, sans-serif`;
          c.strokeText(`${e.combo} combo`, cx, y + 36); c.fillStyle = "#fff"; c.fillText(`${e.combo} combo`, cx, y + 36);
        }
        c.globalAlpha = 1;
      }
    }

    // cuenta atrás
    if (t < 0) {
      const n = Math.ceil(-t / beat);
      c.textAlign = "center";
      c.fillStyle = "#fff";
      c.font = `800 ${Math.min(90, W / 5)}px system-ui, sans-serif`;
      c.fillText(n > 3 ? "¿List@?" : n > 0 ? String(n) : "¡Ya!", W / 2, H * 0.5);
    }

    // barra de vida
    const bw = Math.min(520, W * 0.8), bx = (W - bw) / 2, by = H - 26;
    c.fillStyle = "#0b0820"; c.fillRect(bx - 3, by - 3, bw + 6, 18);
    c.fillStyle = "#ff5c7a"; c.fillRect(bx, by, bw, 12);
    c.fillStyle = "#3ef08a"; c.fillRect(bx + bw * (1 - juego.vida), by, bw * juego.vida, 12);
    const ix = bx + bw * (1 - juego.vida);
    c.fillStyle = "#fff"; c.beginPath(); c.arc(ix, by + 6, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#0b0820"; c.font = "700 12px system-ui"; c.textAlign = "center"; c.fillText("♥", ix, by + 10);
  }
}
