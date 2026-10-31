import test from "node:test";
import assert from "node:assert/strict";
import { leerChart, detectarFormato } from "../../web/motor/chart.js";
import { leerJSON } from "./ayuda.mjs";

test("formato v2.0.0: d 0-3 jugador, 4-7 rival, l = hold", () => {
  const c = leerChart({ version: "2.0.0", scrollSpeed: { normal: 1.4 }, notes: { normal: [{ t: 500, d: 5 }, { t: 100, d: 2, l: 300 }] } }, "normal");
  assert.equal(c.formato, "v2");
  assert.equal(c.velocidad, 1.4);
  assert.deepEqual(c.notas.map((n) => [n.t, n.lane, n.l, n.lado]), [[100, 2, 300, "jugador"], [500, 1, 0, "rival"]]);
  assert.equal(c.duracion, 500);
});

test("v2: si no existe la dificultad usa la primera", () => {
  const c = leerChart({ notes: { hard: [{ t: 1, d: 0 }] } }, "easy");
  assert.equal(c.dificultad, "hard");
});

test("formato clásico / Psych: mustHitSection decide el lado", () => {
  const json = { song: { song: "Demo", bpm: 150, speed: 2.1, notes: [
    { mustHitSection: true, sectionNotes: [[0, 0, 0], [100, 5, 0]] },
    { mustHitSection: false, sectionNotes: [[200, 1, 0], [300, 6, 250], [400, -1, "evento"]] },
  ] } };
  assert.equal(detectarFormato(json), "clasico");
  const c = leerChart(json);
  assert.equal(c.titulo, "Demo");
  assert.equal(c.bpm, 150);
  assert.equal(c.velocidad, 2.1);
  assert.deepEqual(c.notas.map((n) => [n.t, n.lane, n.l, n.lado]), [
    [0, 0, 0, "jugador"], [100, 1, 0, "rival"], [200, 1, 0, "rival"], [300, 2, 250, "jugador"],
  ]);
});

test("archivo inválido da un error claro", () => {
  assert.throws(() => leerChart({ hola: 1 }), /No reconozco/);
});

test("las canciones de demo cargan en las 3 dificultades y son originales (CC0)", () => {
  const lista = leerJSON("web/canciones/lista.json");
  assert.equal(lista.length, 3);
  for (const s of lista) {
    const json = leerJSON(`web/canciones/${s.id}.json`);
    assert.match(json.licencia, /CC0/);
    for (const d of ["easy", "normal", "hard"]) {
      const c = leerChart(json, d);
      assert.equal(c.notas.filter((n) => n.lado === "jugador").length, s.notas[d]);
      assert.ok(c.notas.some((n) => n.lado === "rival"));
    }
  }
});
