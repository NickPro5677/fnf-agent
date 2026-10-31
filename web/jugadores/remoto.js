// IA externa (protocolo v2, compatible con v1): se conecta al relay por WebSocket con un token,
// manda chart/state/judgement/result y obedece las teclas. Teclas con "at" se aplican en ese
// instante de la canción; sin "at" se compensa la latencia medida (o la que pongas a mano).
import { mensajeChart, mensajeEstado, leerMensajeAgente, CAPS_JUEGO } from "../motor/protocolo.js";

const MAX_ATRAS = 150; // nunca se juzga una tecla más de 150 ms antes de que llegue

export class JugadorRemoto {
  /**
   * @param {object} o
   * @param {string} o.url  ws://host:puerto
   * @param {string} o.token token que muestra el relay
   * @param {number} [o.hz] estados por segundo
   * @param {number} [o.lookahead] ms de notas próximas en cada state (v2)
   * @param {"v2"|"v1"} [o.modo]
   * @param {{tipo:"auto"|"manual"|"no", ms?:number}} [o.compensacion]
   * @param {(texto:string, tipo?:string)=>void} [o.log]
   */
  constructor({ url = "ws://127.0.0.1:8765", token = "", hz = 30, lookahead = 1500, modo = "v2", compensacion = { tipo: "auto", ms: 0 }, log = () => {}, WS = globalThis.WebSocket } = {}) {
    this.tipo = "remoto";
    this.nombre = "IA externa";
    Object.assign(this, { url, token, hz, lookahead, modo, compensacion, log, WS });
    this.cadaMs = 1000 / hz;
    this.agentes = 0;
    this.ultimoEnvio = -Infinity;
    this.ultimoPing = -Infinity;
    this.cola = [];
    this.rtt = null; // ida y vuelta con el agente (ms)
    this.rttRelay = null;
    this.pings = new Map();
    this.nPing = 0;
  }

  /** Abre la conexión y se presenta. Resuelve con el welcome; rechaza con un Error claro. */
  abrir(alCambiar = () => {}) {
    this.alCambiar = alCambiar;
    return new Promise((ok, mal) => {
      let ws, listo = false;
      const fallar = (e) => { if (!listo) { listo = true; clearTimeout(tiempo); mal(e); } };
      try { ws = new this.WS(this.url); } catch (e) { mal(e); return; }
      this.ws = ws;
      const tiempo = setTimeout(() => fallar(new Error("El relay no responde")), 4000);
      ws.onopen = () => {
        this.log(`Conectado a ${this.url}, me presento…`);
        const hola = { type: "hello", role: "game", name: "navegador", token: this.token };
        if (this.modo === "v2") Object.assign(hola, { v: 2, caps: CAPS_JUEGO, lookahead: this.lookahead, hz: this.hz, mode: this.modo });
        ws.send(JSON.stringify(hola));
      };
      ws.onerror = () => fallar(new Error(`No pude conectar a ${this.url}`));
      ws.onclose = (ev) => {
        this.agentes = 0;
        if (ev.code === 4001) fallar(new Error(this.ultimoError || "Token incorrecto"));
        else fallar(new Error(`El relay cerró la conexión (${ev.code})`));
        this.log("Desconectado", "aviso");
        this.alCambiar({ conectado: false, agentes: 0 });
      };
      ws.onmessage = (ev) => {
        const m = leerMensajeAgente(ev.data);
        if (!m.ok) { this.log(`Mensaje ignorado: ${m.error}`, "aviso"); return; }
        if (m.type === "error") {
          const texto = { token_requerido: "Falta el token", token_invalido: "Token incorrecto" }[m.error] || m.error;
          this.ultimoError = texto;
          this.log(`⚠ ${texto}${m.detail ? `: ${m.detail}` : ""}`, "error");
          return;
        }
        if (m.type === "welcome" || m.type === "peers") {
          const antes = this.agentes;
          this.agentes = m.data.agents ?? 0;
          if (m.type === "welcome") this.log(`✓ Dentro (relay v${m.data.v ?? 1}) · ${this.agentes} agente(s)`, "ok");
          else if (antes !== this.agentes) this.log(`Agentes: ${this.agentes}${m.data.names?.length ? ` (${m.data.names.join(", ")})` : ""}`);
          this.alCambiar({ conectado: true, agentes: this.agentes, nombres: m.data.names || [] });
          if (!listo) { listo = true; clearTimeout(tiempo); ok(m.data); }
          return;
        }
        if (m.type === "ping") {
          this.enviar({ type: "pong", id: m.data.id, sent: m.data.sent, t: this.ctx ? Math.round(this.ctx.ahora() * 10) / 10 : null, to_id: m.data.from_id });
          return;
        }
        if (m.type === "pong") {
          const enviado = this.pings.get(m.data.id);
          if (enviado == null) return;
          this.pings.delete(m.data.id);
          const rtt = performance.now() - enviado;
          if (m.data.from === "relay") { this.rttRelay = rtt; this.alPongRelay?.(rtt); return; }
          this.rtt = this.rtt == null ? rtt : this.rtt * 0.7 + rtt * 0.3;
          return;
        }
        if (!this.ctx) return;
        if (m.type === "key") this.tecla(m);
        else if (m.type === "think") this.ctx.pensar(m.text);
      };
    });
  }

  /** Mide la ida y vuelta con el relay (Probar conexión). */
  medirRelay() {
    return new Promise((ok) => {
      const id = `r${++this.nPing}`;
      this.pings.set(id, performance.now());
      this.alPongRelay = (rtt) => { this.alPongRelay = null; ok(rtt); };
      this.enviar({ type: "ping", id, target: "relay" });
      setTimeout(() => { if (this.pings.has(id)) { this.pings.delete(id); ok(null); } }, 2000);
    });
  }

  /** Cuántos ms hacia atrás se juzga una tecla sin "at". */
  compensacionMs() {
    const c = this.compensacion || {};
    if (c.tipo === "manual") return Math.min(MAX_ATRAS, Math.max(0, +c.ms || 0));
    if (c.tipo === "auto" && this.rtt != null) return Math.min(MAX_ATRAS, this.rtt / 2);
    return 0;
  }

  tecla(m) {
    const ahora = this.ctx.ahora();
    if (m.at != null && this.modo === "v2") {
      if (m.at > ahora) { this.cola.push(m); this.cola.sort((a, b) => a.at - b.at); return; }
      this.aplicar(m, Math.max(m.at, ahora - MAX_ATRAS));
      return;
    }
    this.aplicar(m, ahora - this.compensacionMs());
  }

  aplicar(m, t) {
    if (m.down) this.ctx.presionar(m.lane, m.why || "IA externa", t);
    else this.ctx.soltar(m.lane, t);
  }

  enviar(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  conectar(ctx) {
    this.ctx = ctx;
    this.cola = [];
    this.enviar(mensajeChart(ctx.juego, ctx.cancion));
    this.enviar(this.estado());
    this.log(`▶ Empieza "${ctx.cancion}": chart enviado (${ctx.juego.jugables.length} notas)`);
  }

  estado() { return mensajeEstado(this.ctx.juego, 8, this.modo === "v2" ? this.lookahead : null); }

  cuadro(t) {
    while (this.cola.length && this.cola[0].at <= t) { const m = this.cola.shift(); this.aplicar(m, m.at); }
    if (t - this.ultimoEnvio >= this.cadaMs) { this.ultimoEnvio = t; this.enviar(this.estado()); }
    if (this.modo === "v2" && t - this.ultimoPing >= 1000) {
      this.ultimoPing = t;
      const id = `g${++this.nPing}`;
      this.pings.set(id, performance.now());
      this.enviar({ type: "ping", id, sent: Math.round(t) });
    }
  }

  evento(ev) {
    if (ev.tipo === "juicio") this.enviar({ type: "judgement", lane: ev.lane, kind: ev.juicio, offset: ev.desfase, note: ev.nota });
    if (ev.tipo === "fin") {
      const r = this.ctx.juego.resumen();
      this.enviar({ type: "result", ...r });
      this.log(`■ Fin: ${r.resultado} · ${(r.precision * 100).toFixed(1)} %${this.rtt != null ? ` · latencia ${Math.round(this.rtt)} ms` : ""}`);
    }
  }

  desconectar() { this.ctx = null; this.cola = []; }
  cerrar() { try { this.ws?.close(); } catch { /* */ } }
}
