import test from "node:test";
import assert from "node:assert/strict";
import { leerChart } from "../../web/motor/chart.js";
import { JugadorBot, planificar } from "../../web/jugadores/bot.js";
import { leerJSON, simular } from "./ayuda.mjs";

const lista = leerJSON("web/canciones/lista.json");

for (const s of lista) {
  for (const d of ["easy", "normal", "hard"]) {
    test(`bot perfecto: full combo en ${s.id} (${d})`, () => {
      const chart = leerChart(leerJSON(`web/canciones/${s.id}.json`), d);
      const { resumen } = simular(chart, new JugadorBot({ modo: "perfecto" }));
      assert.equal(resumen.resultado, "victoria");
      assert.equal(resumen.juicios.miss, 0);
      assert.equal(resumen.fullCombo, true);
      assert.equal(resumen.juicios.sick, resumen.total);
    });
  }
}

test("bot humano al 80 % falla algo pero no todo", () => {
  const chart = leerChart(leerJSON("web/canciones/luz-de-neon.json"), "normal");
  const { resumen } = simular(chart, new JugadorBot({ modo: "humano", precision: 0.8 }));
  assert.ok(resumen.precision < 0.99, `precisión ${resumen.precision}`);
  assert.ok(resumen.precision > 0.4, `precisión ${resumen.precision}`);
});

test("más precisión configurada = mejor resultado", () => {
  const chart = leerChart(leerJSON("web/canciones/turbo-cuantico.json"), "normal");
  const a = simular(chart, new JugadorBot({ modo: "humano", precision: 0.6 })).resumen.precision;
  const b = simular(chart, new JugadorBot({ modo: "humano", precision: 0.95 })).resumen.precision;
  assert.ok(b > a, `${b} > ${a}`);
});

test("el plan es repetible con la misma semilla", () => {
  const notas = [{ id: 0, t: 100, lane: 0, l: 0 }, { id: 1, t: 300, lane: 1, l: 0 }];
  assert.deepEqual(planificar(notas, { modo: "humano", precision: 0.7, semilla: 3 }), planificar(notas, { modo: "humano", precision: 0.7, semilla: 3 }));
});
