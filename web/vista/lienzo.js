// Dibuja el juego en un <canvas>: carriles, flechas con brillo, notas largas, receptores,
// partículas, popups, zonas táctiles y barra de vida.
export const COLORES = ["#b07cff", "#3fd0ff", "#3ef08a", "#ff5c7a"];
const GIRO = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // izquierda, abajo, arriba, derecha
const FUENTE = "Fredoka, Nunito, system-ui, sans-serif";

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
    this.particulas = [];
    this.sprites = new Map();
    this.opts = {};
  }

  ajustar() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    if (dpr !== this.dpr) this.sprites.clear();
    this.W = w; this.H = h; this.dpr = dpr;
  }

  /**
   * `reserva`: px a la izquierda ocupados por el panel de la IA (0 si no se ve).
   * Con `soloJugador` (pad táctil) los 4 carriles del jugador ocupan el centro y son lo más anchos posible.
   * Con `downscroll` los receptores van abajo, dentro de la zona táctil.
   */
  geometria(reserva = 0, { soloJugador = this.opts.soloJugador, downscroll = this.opts.downscroll } = {}) {
    if (!this.W) this.ajustar();
    const { W, H } = this;
    const dos = W >= 640;
    const recY = (ancho) => downscroll ? H - Math.max(58, ancho * 0.72) : Math.max(60, ancho * 0.85);
    const lanesX = (cx, a) => [0, 1, 2, 3].map((i) => cx + (i - 1.5) * a);
    if (soloJugador) {
      const ancho = Math.min(120, (W * 0.94) / 4);
      return { dos, ancho, anchoR: 0, recY: recY(ancho), jugador: lanesX(W / 2, ancho), rival: null, centro: W / 2, downscroll: !!downscroll };
    }
    if (!dos && reserva > 0) {
      // Móvil con panel de IA: el panel ocupa la columna del rival; solo se dibuja el jugador.
      const ancho = Math.min(120, (W * 0.6 * 0.92) / 4);
      const cx = W * 0.69;
      return { dos, ancho, anchoR: 0, recY: recY(ancho), jugador: lanesX(cx, ancho), rival: null, centro: cx, downscroll: !!downscroll };
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
    return { dos, ancho, anchoR, recY: recY(ancho), jugador: lanesX(jugadorX, ancho), rival: lanesX(rivalX, anchoR), centro: x0 + Wu / 2, downscroll: !!downscroll };
  }

  efecto(e) {
    const ahora = performance.now();
    this.efectos.push({ ...e, desde: ahora });
    if (e.tipo === "destello" && !e.rival && !this.opts.menosEfectos) this._chispas(e.lane, e.fuerza || 1, ahora);
    if (this.efectos.length > 40) this.efectos.splice(0, this.efectos.length - 40);
  }
  rayo(lane, texto, color) { this.rayos.push({ lane, texto, color, desde: performance.now() }); }

  _chispas(lane, fuerza, ahora) {
    const n = Math.round(8 * fuerza);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.12 + Math.random() * 0.22 * fuerza;
      this.particulas.push({ lane, dx: 0, dy: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, desde: ahora, vida: 380 + Math.random() * 260, r: 1.5 + Math.random() * 2.5 });
    }
    if (this.particulas.length > 160) this.particulas.splice(0, this.particulas.length - 160);
  }

  // Flecha pre-renderizada (con brillo) para no usar shadowBlur en cada cuadro.
  _sprite(lane, tam, tipo, brillo) {
    const k = `${lane}|${Math.round(tam)}|${tipo}|${brillo ? 1 : 0}`;
    let s = this.sprites.get(k);
    if (s) return s;
    const pad = brillo ? Math.ceil(tam * 0.35) : 4;
    const lado = Math.ceil(tam + pad * 2);
    const cv = document.createElement("canvas");
    cv.width = cv.height = Math.ceil(lado * this.dpr);
    const c = cv.getContext("2d");
    c.scale(this.dpr, this.dpr);
    const m = lado / 2;
    if (tipo === "nota") {
      if (brillo) { c.shadowColor = COLORES[lane]; c.shadowBlur = tam * 0.28; }
      flecha(c, m, m, tam, lane, COLORES[lane], null);
      c.shadowBlur = 0;
      flecha(c, m, m, tam, lane, null, "#0b0820", Math.max(2, tam * 0.045));
      // reflejo suave
      c.globalAlpha = 0.28;
      flecha(c, m, m - tam * 0.06, tam * 0.55, lane, "#ffffff", null);
    } else if (tipo === "recOn") {
      if (brillo) { c.shadowColor = COLORES[lane]; c.shadowBlur = tam * 0.4; }
      flecha(c, m, m, tam, lane, COLORES[lane] + "cc", "#ffffff", Math.max(2, tam * 0.04));
    } else {
      flecha(c, m, m, tam, lane, "#ffffff10", "#a9a2dd", Math.max(2, tam * 0.035));
    }
    s = { cv, lado };
    if (this.sprites.size > 120) this.sprites.clear();
    this.sprites.set(k, s);
    return s;
  }
  _pintar(lane, x, y, tam, tipo) {
    const s = this._sprite(lane, tam, tipo, !this.opts.menosEfectos);
    this.c.drawImage(s.cv, x - s.lado / 2, y - s.lado / 2, s.lado, s.lado);
  }

  _fondo(g, color) {
    const { W, H, dpr } = this;
    const k = `${W}|${H}|${dpr}|${color}|${g.jugador.join()}|${g.rival ? g.rival.join() : ""}`;
    if (this.fondoCache?.k === k) return this.fondoCache;
    const lienzo = () => { const cv = document.createElement("canvas"); cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext("2d"); c.scale(dpr, dpr); return [cv, c]; };
    const radial = (c) => {
      const rad = c.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      rad.addColorStop(0, color); rad.addColorStop(1, "transparent");
      c.fillStyle = rad; c.fillRect(0, 0, W, H);
    };
    const [base, c] = lienzo();
    const lin = c.createLinearGradient(0, 0, 0, H);
    lin.addColorStop(0, "#160f30"); lin.addColorStop(1, "#05040c");
    c.fillStyle = lin; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.2; radial(c); c.globalAlpha = 1;
    if (g.rival) {
      const r0 = g.rival[0] - g.anchoR / 2, r1 = g.rival[3] + g.anchoR / 2;
      c.fillStyle = "#0b082066"; c.fillRect(r0, 0, r1 - r0, H);
    }
    const ancho = g.ancho, x0 = g.jugador[0] - ancho / 2, x1 = g.jugador[3] + ancho / 2;
    c.fillStyle = "#0b082099"; c.fillRect(x0, 0, x1 - x0, H);
    for (let lane = 0; lane < 4; lane++) { c.fillStyle = COLORES[lane] + "12"; c.fillRect(g.jugador[lane] - ancho * 0.46, 0, ancho * 0.92, H); }
    c.fillStyle = "#ffffff10"; c.fillRect(x0, 0, 1, H); c.fillRect(x1 - 1, 0, 1, H);
    const [luz, cl] = lienzo();
    radial(cl);
    this.fondoCache = { k, base, luz };
    return this.fondoCache;
  }

  dibujar(juego, t, opts = {}) {
    const { velocidad = 1, bpm = 120, color = "#7c5cff", mostrarIA = false, reserva = 0, zona = 0, verZonas = false, menosEfectos = false, pulsadas = null, opacidad = 0.6 } = opts;
    this.opts = opts;
    this.ajustar();
    const { c, W, H, dpr } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = this.geometria(reserva);
    const dir = g.downscroll ? -1 : 1;
    const px = 0.45 * velocidad * Math.min(1.4, Math.max(0.75, H / 800));
    const ahora = performance.now();

    // fondo + pistas de carril: pre-renderizados una vez por tamaño (rápido en teléfonos baratos)
    const beat = 60000 / bpm;
    const pulso = t > 0 && !menosEfectos ? Math.max(0, 1 - ((t % beat) / beat) * 3) : 0;
    const fondo = this._fondo(g, color);
    c.drawImage(fondo.base, 0, 0, W, H);
    if (pulso > 0.02) { c.globalAlpha = pulso * 0.22; c.drawImage(fondo.luz, 0, 0, W, H); c.globalAlpha = 1; }

    // zona táctil: columnas alineadas con los carriles, hasta los bordes
    if (zona > 0) {
      const lim = [0, (g.jugador[0] + g.jugador[1]) / 2, (g.jugador[1] + g.jugador[2]) / 2, (g.jugador[2] + g.jugador[3]) / 2, W];
      const zy = H - zona;
      c.globalAlpha = verZonas ? 1 : Math.min(1, opacidad * 1.4);
      for (let lane = 0; lane < 4; lane++) {
        const on = pulsadas?.[lane] > 0;
        if (!on && !verZonas) continue;
        const gr = c.createLinearGradient(0, zy, 0, H);
        gr.addColorStop(0, COLORES[lane] + "00");
        gr.addColorStop(1, COLORES[lane] + (on ? "66" : "33"));
        c.fillStyle = gr;
        c.fillRect(lim[lane], zy, lim[lane + 1] - lim[lane], zona);
      }
      c.globalAlpha = 1;
      if (verZonas) {
        c.strokeStyle = "#ffffffcc"; c.lineWidth = 2; c.setLineDash([8, 6]);
        c.strokeRect(1, zy + 1, W - 2, zona - 2);
        for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(lim[i], zy); c.lineTo(lim[i], H); c.stroke(); }
        c.setLineDash([]);
        c.fillStyle = "#fff"; c.textAlign = "center"; c.font = `700 ${Math.round(Math.min(22, zona * 0.14))}px ${FUENTE}`;
        ["←", "↓", "↑", "→"].forEach((s, i) => c.fillText(s, (lim[i] + lim[i + 1]) / 2, zy + Math.min(28, zona * 0.2)));
      }
    }

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
        c.font = `600 ${Math.max(11, g.ancho * 0.16)}px ${FUENTE}`;
        c.textAlign = "center";
        c.fillText(r.texto, g.jugador[r.lane], g.recY - dir * g.ancho * 0.85);
      }
      c.globalAlpha = 1;
    }

    // receptores
    const pintarReceptores = (xs, tam, teclas) => xs && xs.forEach((x, lane) => {
      const on = teclas?.[lane];
      this._pintar(lane, x, g.recY, tam * (on ? 0.86 : 0.8), on ? "recOn" : "rec");
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
      let y = g.recY + (n.t - t) * px * dir;
      if (dir > 0 ? y > H + tam : y < -tam) break;
      const yFin = g.recY + (n.t + n.l - t) * px * dir;
      if (dir > 0 ? yFin < -tam : yFin > H + tam) continue;
      const fallo = n.estado === "fallo";
      const sosteniendo = n.estado === "hold" || (n.estado === "rival" && n.l > 0);
      if (sosteniendo) y = g.recY;
      c.globalAlpha = fallo ? 0.3 : n.lado === "rival" && !n.cuenta ? 0.8 : 1;
      if (n.l > 0 && (yFin - y) * dir > 0) {
        c.fillStyle = COLORES[n.lane] + (sosteniendo ? "e6" : "8c");
        const w = tam * 0.3, top = Math.min(y, yFin), alto = Math.abs(yFin - y);
        c.beginPath();
        if (c.roundRect) c.roundRect(xs[n.lane] - w / 2, top, w, alto, w / 2); else c.rect(xs[n.lane] - w / 2, top, w, alto);
        c.fill();
      }
      if (!sosteniendo && n.estado !== "rival") this._pintar(n.lane, xs[n.lane], y, tam, "nota");
      c.globalAlpha = 1;
    }

    // marcas: dónde planea pulsar el bot (puede ir antes o después de la nota)
    if (opts.marcas && g.jugador) {
      c.lineWidth = 3; c.lineCap = "round";
      for (const m of opts.marcas) {
        const y = g.recY + (m.t - t) * px * dir;
        if (dir > 0 ? y > H : y < 0) continue;
        const x = g.jugador[m.lane], w = g.ancho * 0.42;
        c.strokeStyle = "#ffffffd9"; c.beginPath(); c.moveTo(x - w, y); c.lineTo(x + w, y); c.stroke();
        c.fillStyle = COLORES[m.lane]; c.beginPath(); c.arc(x - w, y, 3.5, 0, Math.PI * 2); c.arc(x + w, y, 3.5, 0, Math.PI * 2); c.fill();
      }
    }

    // partículas
    if (this.particulas.length) {
      this.particulas = this.particulas.filter((p) => ahora - p.desde < p.vida);
      for (const p of this.particulas) {
        const dt = ahora - p.desde, q = dt / p.vida;
        c.globalAlpha = 1 - q;
        c.fillStyle = COLORES[p.lane];
        const x = g.jugador[p.lane] + p.vx * dt, y = g.recY + p.vy * dt + 0.0003 * dt * dt;
        c.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
      }
      c.globalAlpha = 1;
    }

    // destellos y popups
    this.efectos = this.efectos.filter((e) => ahora - e.desde < 700);
    for (const e of this.efectos) {
      const p = (ahora - e.desde) / 700;
      if (e.tipo === "destello") {
        const xs = e.rival ? g.rival : g.jugador;
        if (!xs || p > 0.4) continue;
        const q = p / 0.4;
        c.globalAlpha = 1 - q;
        c.strokeStyle = COLORES[e.lane];
        c.lineWidth = menosEfectos ? 3 : 5 * (1 - q) + 1;
        c.beginPath();
        c.arc(xs[e.lane], g.recY, (e.rival ? g.anchoR : g.ancho) * (0.35 + q * 0.4), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      } else if (e.tipo === "popup") {
        c.globalAlpha = Math.min(1, (1 - p) * 2);
        const cx = g.centro;
        const y = H * (g.downscroll ? 0.38 : 0.45) - p * 30;
        const rebote = menosEfectos ? 1 : 1 + (p < 0.12 ? (0.12 - p) * 3.5 : 0);
        const tamF = Math.round(Math.min(52, W / 8) * rebote);
        c.textAlign = "center";
        c.font = `700 ${tamF}px ${FUENTE}`;
        c.lineJoin = "round";
        c.lineWidth = 7; c.strokeStyle = "#0b0820"; c.strokeText(e.texto, cx, y);
        c.fillStyle = e.color; c.fillText(e.texto, cx, y);
        if (e.combo >= 5) {
          const hito = e.combo % 25 === 0;
          const tc = Math.round(Math.min(30, W / 14) * (hito && !menosEfectos ? 1.25 * rebote : 1));
          c.font = `600 ${tc}px ${FUENTE}`;
          const txt = `${e.combo} combo`;
          c.strokeText(txt, cx, y + tc + 8); c.fillStyle = hito ? "#ffd54f" : "#fff"; c.fillText(txt, cx, y + tc + 8);
        }
        c.globalAlpha = 1;
      }
    }

    // cuenta atrás
    if (t < 0) {
      const n = Math.ceil(-t / beat);
      const fr = menosEfectos ? 0 : (-t % beat) / beat;
      c.textAlign = "center";
      c.fillStyle = "#fff";
      c.font = `700 ${Math.round(Math.min(90, W / 5) * (1 + fr * 0.25))}px ${FUENTE}`;
      c.globalAlpha = 0.5 + 0.5 * (1 - fr);
      c.fillText(n > 3 ? "¿List@?" : n > 0 ? String(n) : "¡Ya!", W / 2, H * 0.45);
      c.globalAlpha = 1;
    }

    // barra de vida (arriba con downscroll, para no tapar los receptores)
    const bw = Math.min(520, W * 0.8), bx = (W - bw) / 2, by = g.downscroll ? 14 : H - 26;
    c.fillStyle = "#0b0820"; c.beginPath(); (c.roundRect ? c.roundRect(bx - 3, by - 3, bw + 6, 18, 9) : c.rect(bx - 3, by - 3, bw + 6, 18)); c.fill();
    c.fillStyle = "#ff5c7a"; c.fillRect(bx, by, bw, 12);
    c.fillStyle = "#3ef08a"; c.fillRect(bx + bw * (1 - juego.vida), by, bw * juego.vida, 12);
    const ix = bx + bw * (1 - juego.vida);
    c.fillStyle = "#fff"; c.beginPath(); c.arc(ix, by + 6, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#0b0820"; c.font = "700 12px system-ui"; c.textAlign = "center"; c.fillText("♥", ix, by + 10);
    if (opts.errores) this._errores(opts.errores, bx, bw, g.downscroll ? by + 26 : by - 62);
  }

  /** Gráfica en vivo del desfase de los últimos toques (centro = perfecto, arriba = tarde). */
  _errores(errores, bx, bw, y0) {
    const { c } = this;
    const w = Math.min(220, bw * 0.6), h = 48, x0 = bx + (bw - w) / 2, mid = y0 + h / 2;
    c.fillStyle = "#0b0820cc"; c.fillRect(x0, y0, w, h);
    c.fillStyle = "#6ef3ff22"; c.fillRect(x0, mid - (45 / 180) * (h / 2), w, (90 / 180) * (h / 2));
    c.fillStyle = "#ffffff55"; c.fillRect(x0, mid, w, 1);
    const ult = errores.slice(-40), paso = w / 40;
    const col = { sick: "#6ef3ff", good: "#3ef08a", bad: "#ffd84f", miss: "#ff7b93" };
    ult.forEach((e, i) => {
      const x = x0 + paso * (i + 0.5);
      c.fillStyle = col[e.j] || "#fff";
      if (e.d == null) { c.globalAlpha = 0.5; c.fillRect(x - 1, y0, 2, h); c.globalAlpha = 1; return; }
      const y = mid - (Math.max(-180, Math.min(180, e.d)) / 180) * (h / 2);
      c.fillRect(x - 2, y - 2, 4, 4);
    });
    c.fillStyle = "#fff"; c.font = `600 10px ${FUENTE}`; c.textAlign = "left";
    c.fillText(this.etiquetaErrores || "ms", x0 + 4, y0 + 11);
  }
}
