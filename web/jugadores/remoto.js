// IA externa: se conecta al relay por WebSocket y obedece los mensajes "key".
import { mensajeChart, mensajeEstado, leerMensajeAgente } from "../motor/protocolo.js";

export class JugadorRemoto {
  constructor({ url = "ws://127.0.0.1:8765", hz = 30, WS = globalThis.WebSocket } = {}) {
    this.tipo = "remoto";
    this.nombre = "IA externa";
    this.url = url;
    this.cadaMs = 1000 / hz;
    this.WS = WS;
    this.agentes = 0;
    this.ultimoEnvio = -Infinity;
  }

  /** Abre la conexión. Resuelve cuando el relay responde. */
  abrir(alCambiar = () => {}) {
    this.alCambiar = alCambiar;
    return new Promise((ok, mal) => {
      let ws;
      try { ws = new this.WS(this.url); } catch (e) { mal(e); return; }
      this.ws = ws;
      const tiempo = setTimeout(() => mal(new Error("El relay no responde")), 4000);
      ws.onopen = () => ws.send(JSON.stringify({ type: "hello", role: "game", name: "navegador" }));
      ws.onerror = () => { clearTimeout(tiempo); mal(new Error(`No pude conectar a ${this.url}`)); };
      ws.onclose = () => { this.agentes = 0; this.alCambiar({ conectado: false, agentes: 0 }); };
      ws.onmessage = (ev) => {
        const m = leerMensajeAgente(ev.data);
        if (!m.ok) return;
        if (m.type === "welcome" || m.type === "peers") {
          clearTimeout(tiempo);
          this.agentes = m.data.agents ?? 0;
          this.alCambiar({ conectado: true, agentes: this.agentes, nombres: m.data.names || [] });
          ok();
          return;
        }
        if (!this.ctx) return;
        if (m.type === "key") {
          if (m.down) this.ctx.presionar(m.lane, m.why || "IA externa");
          else this.ctx.soltar(m.lane);
        } else if (m.type === "think") this.ctx.pensar(m.text);
      };
    });
  }

  enviar(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  conectar(ctx) {
    this.ctx = ctx;
    this.enviar(mensajeChart(ctx.juego, ctx.cancion));
    this.enviar(mensajeEstado(ctx.juego));
  }

  cuadro(t) {
    if (t - this.ultimoEnvio >= this.cadaMs) { this.ultimoEnvio = t; this.enviar(mensajeEstado(this.ctx.juego)); }
  }

  evento(ev) {
    if (ev.tipo === "juicio") this.enviar({ type: "judgement", lane: ev.lane, kind: ev.juicio, offset: ev.desfase, note: ev.nota });
    if (ev.tipo === "fin") this.enviar({ type: "result", ...this.ctx.juego.resumen() });
  }

  desconectar() { this.ctx = null; }
  cerrar() { try { this.ws?.close(); } catch { /* */ } }
}
