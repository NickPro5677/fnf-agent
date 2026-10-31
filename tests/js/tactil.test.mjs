import { test } from "node:test";
import assert from "node:assert/strict";
import { carrilMasCercano, limitesColumnas, carrilPorFranja, Dedos } from "../../web/jugadores/tactil.js";

const C = [60, 150, 240, 330];
test("toda la anchura cae en algún carril (sin huecos)", () => {
  for (let x = 0; x <= 390; x++) { const l = carrilMasCercano(x, C); assert.ok(l >= 0 && l <= 3); }
  assert.equal(carrilMasCercano(0, C), 0);
  assert.equal(carrilMasCercano(390, C), 3);
  assert.equal(carrilMasCercano(104, C), 0);
  assert.equal(carrilMasCercano(106, C), 1);
});
test("límites en puntos medios", () => assert.deepEqual(limitesColumnas(C, 390), [0, 105, 195, 285, 390]));
test("franjas iguales", () => {
  assert.equal(carrilPorFranja(0, 400), 0); assert.equal(carrilPorFranja(99, 400), 0);
  assert.equal(carrilPorFranja(100, 400), 1); assert.equal(carrilPorFranja(400, 400), 3); assert.equal(carrilPorFranja(-5, 400), 0);
});
test("dos dedos en un carril: suelta solo con el último", () => {
  const log = []; const d = new Dedos((l) => log.push("p" + l), (l) => log.push("s" + l));
  d.abajo(1, 2); d.abajo(2, 2); d.arriba(1);
  assert.deepEqual(log, ["p2"]);
  d.arriba(2); assert.deepEqual(log, ["p2", "s2"]);
});
test("deslizar cambia de carril", () => {
  const log = []; const d = new Dedos((l) => log.push("p" + l), (l) => log.push("s" + l));
  d.abajo(1, 0); d.mover(1, 0); d.mover(1, 1); d.arriba(1);
  assert.deepEqual(log, ["p0", "p1", "s0", "s1"]);
});
test("deslizar hacia un carril ya pulsado no lo vuelve a pulsar", () => {
  const log = []; const d = new Dedos((l) => log.push("p" + l), (l) => log.push("s" + l));
  d.abajo(1, 0); d.abajo(2, 1); d.mover(1, 1);
  assert.deepEqual(log, ["p0", "p1", "s0"]);
  d.soltarTodo(); assert.deepEqual(log, ["p0", "p1", "s0", "s1"]); assert.deepEqual(d.cuenta, [0, 0, 0, 0]);
});
