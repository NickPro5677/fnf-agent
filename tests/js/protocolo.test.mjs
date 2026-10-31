import test from "node:test";
import assert from "node:assert/strict";
import { Juego } from "../../web/motor/juego.js";
import { mensajeChart, mensajeEstado, leerMensajeAgente } from "../../web/motor/protocolo.js";
import { JugadorRemoto } from "../../web/jugadores/remoto.js";
import { leerChart } from "../../web/motor/chart.js";
import { leerJSON, simular } from "./ayuda.mjs";

const chart = { titulo: "x", bpm: 120, velocidad: 1, duracion: 2000, notas: [
  { t: 1000, lane: 0, l: 0, lado: "jugador" }, { t: 1200, lane: 3, l: 400, lado: "jugador" }, { t: 900, lane: 1, l: 0, lado: "rival" },
].sort((a, b) => a.t - b.t) };

test("mensaje chart: solo notas del jugador, con ventanas", () => {
  const m = mensajeChart(new Juego(chart), "x");
  assert.equal(m.type, "chart");
  assert.equal(m.notes.length, 2);
  assert.deepEqual(m.windows, { sick: 45, good: 90, bad: 135, miss: 180 });
});

test("mensaje state: dt por carril y próximas notas", () => {
  const j = new Juego(chart);
  j.actualizar(800);
  const m = mensajeEstado(j);
  assert.equal(m.type, "state");
  assert.deepEqual(m.lanes, [200, null, null, 400]);
  assert.equal(m.next[0].dt, 200);
  assert.equal(m.playing, true);
  j.presionar(3, 1200);
  j.actualizar(1300);
  assert.deepEqual(mensajeEstado(j).holds, [null, null, null, 300]);
});

test("leerMensajeAgente valida", () => {
  assert.deepEqual(leerMensajeAgente('{"type":"key","lane":"up","down":true,"why":"x"}'), { ok: true, type: "key", lane: 2, down: true, why: "x" });
  assert.equal(leerMensajeAgente('{"type":"key","lane":7,"down":true}').error, "lane_invalido");
  assert.equal(leerMensajeAgente('{"type":"key","lane":1,"down":"si"}').error, "down_debe_ser_booleano");
  assert.equal(leerMensajeAgente("no json").error, "json_invalido");
  assert.equal(leerMensajeAgente('{"type":"rm -rf"}').error, "tipo_desconocido");
});

test("JugadorRemoto con un WebSocket falso: un agente que reacciona al state gana", async () => {
  // WebSocket falso que hace de "relay + agente reactivo" en memoria.
  class WSFalso {
    constructor() { this.readyState = 1; setTimeout(() => { this.onopen?.(); }, 0); }
    send(txt) {
      const m = JSON.parse(txt);
      if (m.type === "hello") setTimeout(() => this.onmessage({ data: JSON.stringify({ type: "welcome", agents: 1 }) }), 0);
      if (m.type === "state") {
        this.down ??= [0, 0, 0, 0];
        m.lanes.forEach((dt, lane) => {
          if (dt !== null && dt <= 10 && !this.down[lane]) { this.down[lane] = 1; this.onmessage({ data: JSON.stringify({ type: "key", lane, down: true, why: "llega" }) }); }
          else if (this.down[lane] && m.holds[lane] === null && (dt === null || dt > 10)) { this.down[lane] = 0; this.onmessage({ data: JSON.stringify({ type: "key", lane, down: false }) }); }
        });
      }
    }
    close() {}
  }
  const remoto = new JugadorRemoto({ WS: WSFalso, hz: 1000 });
  await remoto.abrir();
  const c = leerChart(leerJSON("web/canciones/primer-paso.json"), "easy");
  const { resumen } = simular(c, remoto);
  assert.equal(resumen.resultado, "victoria");
  assert.equal(resumen.juicios.miss, 0);
});
