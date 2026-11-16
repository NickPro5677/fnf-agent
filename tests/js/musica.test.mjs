import test from "node:test";
import assert from "node:assert/strict";
import { Musica, LOOKAHEAD_S } from "../../web/audio/musica.js";

/** AudioContext mínimo: cuenta cuántos osciladores/fuentes se crean. */
function mockAudio(ahora = 0) {
  let currentTime = ahora;
  const nodos = { osc: 0, buffer: 0 };
  class FakeParam {
    setValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
  }
  class FakeNode {
    connect() { return this; }
    disconnect() {}
    start() {}
    stop() {}
    frequency = new FakeParam();
    gain = new FakeParam();
  }
  class FakeCtx {
    get currentTime() { return currentTime; }
    set currentTime(v) { currentTime = v; }
    state = "running";
    sampleRate = 48000;
    destination = new FakeNode();
    createGain() { return new FakeNode(); }
    createOscillator() { nodos.osc += 1; return new FakeNode(); }
    createBufferSource() { nodos.buffer += 1; const s = new FakeNode(); s.buffer = null; return s; }
    createBiquadFilter() { return Object.assign(new FakeNode(), { type: "", frequency: { value: 0 } }); }
    createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
    resume() {}
  }
  return { FakeCtx, nodos, setTime: (t) => { currentTime = t; } };
}

test("iniciar solo programa una ventana LOOKAHEAD, no toda la canción", () => {
  const { FakeCtx, nodos, setTime } = mockAudio(0);
  globalThis.AudioContext = FakeCtx;
  const m = new Musica();
  // ~60 s a 120 BPM → muchos beats; 200 notas
  const notas = Array.from({ length: 200 }, (_, i) => ({ t: i * 300, lane: i % 4, l: 0, lado: "jugador" }));
  const chart = { bpm: 120, duracion: 60_000, notas };
  m.iniciar(chart, {}, 0);
  const alStart = nodos.osc + nodos.buffer;
  const totalSiTodo = m.nodosTotalesEstimados();
  assert.ok(totalSiTodo > 500, `estimados ${totalSiTodo}`);
  assert.ok(alStart < totalSiTodo / 3, `al start ${alStart} vs total ${totalSiTodo}`);
  assert.ok(alStart > 0);
  assert.equal(LOOKAHEAD_S, 3);

  // Avanzar el reloj y tick: se programan más, pero sin saltar al total de golpe
  setTime(10);
  m.tick();
  const aLos10 = nodos.osc + nodos.buffer;
  assert.ok(aLos10 > alStart, "tick programa más nodos");
  assert.ok(aLos10 < totalSiTodo, "aún no ha programado toda la canción a los 10 s");
  m.detener();
  delete globalThis.AudioContext;
});

test("tick no hace nada si no hay plan (audio de archivo o detenido)", () => {
  const { FakeCtx } = mockAudio(0);
  globalThis.AudioContext = FakeCtx;
  const m = new Musica();
  m.tick();
  m.iniciar({ bpm: 120, duracion: 1000, notas: [] }, {}, 0);
  m.detener();
  m.tick();
  delete globalThis.AudioContext;
});
