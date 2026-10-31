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

// ---------- perfiles 4.1 ----------
import { PERFILES, decidir, aleatorioConSemilla, densidad } from "../../web/jugadores/bot.js";

const CANCIONES = ["primer-paso", "luz-de-neon", "turbo-cuantico"];
const RANGOS = { perfecto: [1, 1], pro: [0.97, 1], bueno: [0.82, 0.97], novato: [0.6, 0.9], nervioso: [0.8, 0.97], cansado: [0.75, 0.95] };
const juicios = (eventos) => eventos.filter((e) => e.tipo === "juicio" && e.desfase != null);

for (const [perfil, [min, max]] of Object.entries(RANGOS)) {
  test(`perfil ${perfil}: precisión entre ${min} y ${max} en las 9 canciones/dificultades y gana`, () => {
    for (const s of CANCIONES) for (const d of ["easy", "normal", "hard"]) {
      const { resumen } = simular(leerChart(leerJSON(`web/canciones/${s}.json`), d), new JugadorBot({ perfil, semilla: 42 }));
      assert.ok(resumen.precision >= min - 1e-9 && resumen.precision <= max + 1e-9, `${perfil} ${s} ${d}: ${resumen.precision}`);
      assert.equal(resumen.resultado, "victoria", `${perfil} ${s} ${d}`);
    }
  });
}

test("misma semilla = misma partida; otra semilla = otra partida", () => {
  const chart = () => leerChart(leerJSON("web/canciones/turbo-cuantico.json"), "hard");
  const a = simular(chart(), new JugadorBot({ perfil: "novato", semilla: 5 }));
  const b = simular(chart(), new JugadorBot({ perfil: "novato", semilla: 5 }));
  const c = simular(chart(), new JugadorBot({ perfil: "novato", semilla: 6 }));
  assert.deepEqual(a.eventos, b.eventos);
  assert.notDeepEqual(a.eventos, c.eventos);
});

test("distribución con colas y sesgo (perfil bueno, semilla fija)", () => {
  const rnd = aleatorioConSemilla(123);
  const xs = Array.from({ length: 20000 }, () => decidir(PERFILES.bueno, {}, rnd).desfase);
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length);
  assert.ok(Math.abs(media - PERFILES.bueno.sesgo) < 1.5, `sesgo ${media}`);
  const lejos = xs.filter((x) => Math.abs(x - media) > 4 * sd).length / xs.length;
  assert.ok(lejos > 0.002, `colas largas: ${lejos}`); // una campana pura daría ~0.00006
});

test("cansado empeora en el último tercio; nervioso empeora con combo alto; ráfagas empeoran", () => {
  const sd = (perfil, estado) => {
    const rnd = aleatorioConSemilla(9);
    const xs = Array.from({ length: 4000 }, () => decidir(perfil, estado, rnd).desfase);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  assert.ok(sd(PERFILES.cansado, { progreso: 0.9 }) > 1.8 * sd(PERFILES.cansado, { progreso: 0.1 }));
  assert.ok(sd(PERFILES.nervioso, { combo: 60 }) > 2 * sd(PERFILES.nervioso, { combo: 0 }));
  assert.ok(sd(PERFILES.bueno, { dens: 2 }) > 1.6 * sd(PERFILES.bueno, { dens: 0 }));
  const notas = [{ t: 0, lane: 0 }, { t: 100, lane: 1 }, { t: 100, lane: 2 }, { t: 2000, lane: 0 }];
  assert.ok(densidad(notas, 1) > densidad(notas, 3));
});

test("cansado: más error medio en el último tercio de una canción real", () => {
  const { eventos, juego } = simular(leerChart(leerJSON("web/canciones/turbo-cuantico.json"), "hard"), new JugadorBot({ perfil: "cansado", semilla: 3 }));
  const fin = juego.jugables.at(-1).t;
  const porId = new Map(juego.jugables.map((n) => [n.id, n.t]));
  const err = (f) => { const xs = juicios(eventos).filter((e) => f(porId.get(e.nota) / fin)).map((e) => Math.abs(e.desfase)); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  assert.ok(err((p) => p > 0.66) > err((p) => p < 0.33), "el final es peor");
});

test("personalizado usa los valores elegidos; sigma 0 sin fallos es perfecto", () => {
  const chart = leerChart(leerJSON("web/canciones/luz-de-neon.json"), "normal");
  const r = simular(chart, new JugadorBot({ perfil: "personalizado", ajustes: { sigma: 0, sesgo: 0, cola: 0, salto: 0, equivocado: 0, sueltaAntes: 0 } })).resumen;
  assert.equal(r.fullCombo, true);
});
