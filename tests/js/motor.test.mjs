import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Juego, juzgar, precision, letra } from "../../web/motor/juego.js";
import { VENTANAS, PUNTOS, VIDA } from "../../web/motor/constantes.js";
import { RAIZ } from "./ayuda.mjs";

const chart = (notas) => ({ titulo: "t", bpm: 120, velocidad: 1, notas, duracion: Math.max(...notas.map((n) => n.t + n.l)) });
const n = (t, lane = 0, l = 0, lado = "jugador") => ({ t, lane, l, lado });

test("las ventanas y puntos son los mismos del motor Python 3.0", () => {
  const py = fs.readFileSync(path.join(RAIZ, "legacy/env/fnf_engine.py"), "utf8");
  const v = (k) => Number(py.match(new RegExp(`^${k} = ([\\d.]+)`, "m"))[1]);
  assert.equal(VENTANAS.sick, v("HIT_SICK"));
  assert.equal(VENTANAS.good, v("HIT_GOOD"));
  assert.equal(VENTANAS.bad, v("HIT_BAD"));
  assert.equal(VENTANAS.miss, v("HIT_MISS"));
  assert.equal(PUNTOS.sick, v("SCORE_SICK"));
  assert.equal(PUNTOS.good, v("SCORE_GOOD"));
  assert.equal(PUNTOS.bad, v("SCORE_BAD"));
  assert.equal(PUNTOS.sustain, v("SCORE_SUSTAIN"));
  assert.equal(VIDA.sick, v("HEALTH_SICK"));
  assert.equal(VIDA.good, v("HEALTH_GOOD"));
  assert.equal(VIDA.bad, v("HEALTH_BAD"));
  assert.equal(VIDA.miss, v("HEALTH_MISS"));
  assert.equal(VIDA.holdRoto, v("HEALTH_SUSTAIN_BREAK"));
});

test("juzgar usa los bordes exactos", () => {
  assert.equal(juzgar(0), "sick");
  assert.equal(juzgar(45), "sick");
  assert.equal(juzgar(-46), "good");
  assert.equal(juzgar(90), "good");
  assert.equal(juzgar(135), "bad");
  assert.equal(juzgar(136), null);
});

test("pulsar a tiempo da sick y suma combo y puntos como el motor 3.0", () => {
  const j = new Juego(chart([n(1000), n(1500, 1)]));
  assert.equal(j.presionar(0, 1010).juicio, "sick");
  assert.equal(j.puntos, 350 + 10);
  assert.equal(j.presionar(1, 1560).juicio, "good");
  assert.equal(j.puntos, 360 + 200 + 20);
  assert.equal(j.combo, 2);
});

test("pulsar sin nota no castiga; demasiado pronto se ignora", () => {
  const j = new Juego(chart([n(1000)]));
  assert.equal(j.presionar(2, 1000), null);
  assert.equal(j.presionar(0, 830), null);
  assert.equal(j.j.miss, 0);
});

test("pulsar tarde fuera de bad (136-180 ms) es miss", () => {
  const j = new Juego(chart([n(1000)]));
  assert.equal(j.presionar(0, 1170).juicio, "miss");
  assert.equal(j.combo, 0);
});

test("no pulsar: miss al pasar 180 ms y baja la vida", () => {
  const j = new Juego(chart([n(1000)]));
  j.actualizar(1180);
  assert.equal(j.j.miss, 0);
  const ev = j.actualizar(1181);
  assert.equal(ev[0].juicio, "miss");
  assert.ok(Math.abs(j.vida - (0.5 - 0.047)) < 1e-9);
});

test("notas largas: mantener da +50, soltar pronto es miss", () => {
  const j = new Juego(chart([n(1000, 0, 500), n(3000, 1, 500)]));
  j.presionar(0, 1000);
  j.actualizar(1300);
  assert.equal(j.notas[0].estado, "hold");
  j.actualizar(1500);
  assert.equal(j.notas[0].estado, "hecha");
  assert.equal(j.puntos, 360 + 50);
  j.presionar(1, 3000);
  j.soltar(1, 3100);
  assert.equal(j.notas[1].estado, "fallo");
  assert.equal(j.j.miss, 1);
});

test("soltar un hold justo antes del final (margen) cuenta como completo", () => {
  const j = new Juego(chart([n(1000, 0, 500)]));
  j.presionar(0, 1000);
  const ev = j.soltar(0, 1450);
  assert.equal(ev[0].ok, true);
});

test("las notas del rival se tocan solas y no cuentan", () => {
  const j = new Juego(chart([n(500, 2, 0, "rival"), n(1000)]));
  const ev = j.actualizar(600);
  assert.equal(ev[0].tipo, "rival");
  assert.equal(j.jugables.length, 1);
  const ambos = new Juego(chart([n(500, 2, 0, "rival"), n(1000)]), { ambosLados: true });
  assert.equal(ambos.jugables.length, 2);
});

test("sin vida es derrota; pasar el final es victoria", () => {
  const muchas = Array.from({ length: 20 }, (_, i) => n(1000 + i * 200));
  const j = new Juego(chart(muchas));
  j.actualizar(99999);
  assert.equal(j.resultado, "derrota");
  const k = new Juego(chart([n(100)]));
  k.presionar(0, 100);
  k.actualizar(100 + 1501);
  assert.equal(k.resultado, "victoria");
});

test("precisión y letra", () => {
  assert.equal(precision({ sick: 0, good: 0, bad: 0, miss: 0 }), 1);
  assert.equal(precision({ sick: 1, good: 1, bad: 0, miss: 0 }), 0.875);
  assert.equal(letra(1, 0), "S+");
  assert.equal(letra(0.5, 3), "D");
});
