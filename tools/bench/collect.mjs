// Métricas, agregación y umbrales del banco. No juzga notas: solo consume resumen/eventos.
import { estadisticas, histograma } from "../../web/vista/estadisticas.js";

/** Percentil lineal (p en 0..1) sobre una copia ordenada. */
export function percentil(xs, p) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function sickRate(juicios) {
  const total = Object.values(juicios || {}).reduce((a, b) => a + b, 0);
  return total ? juicios.sick / total : 0;
}

/** Construye un RunResult a partir del resumen del motor (+ offsets/RTT opcionales). */
export function runDesdeResumen(resumen, {
  offsets = [],
  rttSamples = [],
  durationMsWall = null,
  config = {},
  infraError = null,
} = {}) {
  const juicios = resumen?.juicios || { sick: 0, good: 0, bad: 0, miss: 0 };
  const tiempos = offsets.map((d) => ({ d }));
  const { media: offsetMean, desv: offsetStd } = estadisticas(tiempos);
  const rttP50 = percentil(rttSamples, 0.5);
  const rttP95 = percentil(rttSamples, 0.95);
  return {
    resultado: resumen?.resultado ?? (infraError ? "error" : null),
    juicios: { ...juicios },
    sickRate: sickRate(juicios),
    precision: resumen?.precision ?? 0,
    puntos: resumen?.puntos ?? 0,
    comboMax: resumen?.comboMax ?? 0,
    fullCombo: !!resumen?.fullCombo,
    letra: resumen?.letra ?? null,
    offsets: [...offsets],
    offsetMean,
    offsetStd,
    rttSamples: [...rttSamples],
    rttP50,
    rttP95,
    durationMsWall,
    config: { ...config },
    infraError,
  };
}

function mediaDesv(xs) {
  if (!xs.length) return { media: null, desv: null };
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const desv = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length);
  return { media, desv };
}

/** Agrega N RunResult en un summary estable. */
export function aggregate(results, { config = {} } = {}) {
  const ok = results.filter((r) => !r.infraError);
  const fail = results.filter((r) => r.infraError);
  const sick = mediaDesv(ok.map((r) => r.sickRate));
  const prec = mediaDesv(ok.map((r) => r.precision));
  const off = mediaDesv(ok.map((r) => r.offsetMean).filter((x) => x != null && !Number.isNaN(x)));
  const todosOffsets = ok.flatMap((r) => r.offsets.map((d) => ({ d })));
  const { cubetas, ancho } = histograma(todosOffsets);
  let mejor = null, peor = null;
  for (const r of ok) {
    if (!mejor || r.sickRate > mejor.sickRate || (r.sickRate === mejor.sickRate && r.precision > mejor.precision)) mejor = r;
    if (!peor || r.sickRate < peor.sickRate || (r.sickRate === peor.sickRate && r.precision < peor.precision)) peor = r;
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    config,
    runs: results.length,
    ok: ok.length,
    infraFailures: fail.length,
    infraErrors: fail.map((r) => r.infraError).filter(Boolean),
    sickRate: { mean: sick.media, std: sick.desv },
    precision: { mean: prec.media, std: prec.desv },
    offsetMean: { mean: off.media, std: off.desv },
    best: mejor ? { sickRate: mejor.sickRate, precision: mejor.precision, resultado: mejor.resultado } : null,
    worst: peor ? { sickRate: peor.sickRate, precision: peor.precision, resultado: peor.resultado } : null,
    histogram: { buckets: cubetas, widthMs: ancho, from: -180, to: 180 },
    results,
  };
}

/**
 * Comprueba umbrales opcionales. Devuelve lista de fallos (vacía = ok).
 * Claves: minSick, maxMissRate, maxRttMs
 */
export function assertThresholds(summary, thresholds = {}) {
  const fails = [];
  const meanSick = summary.sickRate?.mean;
  const okRuns = (summary.results || []).filter((r) => !r.infraError);
  if (thresholds.minSick != null) {
    if (meanSick == null || meanSick < thresholds.minSick) {
      fails.push(`sickRate medio ${meanSick ?? "n/a"} < minSick ${thresholds.minSick}`);
    }
  }
  if (thresholds.maxMissRate != null && okRuns.length) {
    const rates = okRuns.map((r) => {
      const t = Object.values(r.juicios).reduce((a, b) => a + b, 0);
      return t ? r.juicios.miss / t : 0;
    });
    const meanMiss = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (meanMiss > thresholds.maxMissRate) {
      fails.push(`missRate medio ${meanMiss} > maxMissRate ${thresholds.maxMissRate}`);
    }
  }
  if (thresholds.maxRttMs != null && okRuns.length) {
    const rtts = okRuns.map((r) => r.rttP95).filter((x) => x != null);
    if (rtts.length) {
      const max = Math.max(...rtts);
      if (max > thresholds.maxRttMs) fails.push(`rttP95 ${max} > maxRttMs ${thresholds.maxRttMs}`);
    }
  }
  return fails;
}

/** Tabla ASCII breve para stdout. */
export function tablaResumen(summary) {
  const lines = [];
  const cfg = summary.config || {};
  lines.push(`runs=${summary.runs} ok=${summary.ok} infra=${summary.infraFailures}`);
  if (cfg.mode) lines.push(`mode=${cfg.mode} song=${cfg.song || "?"} diff=${cfg.difficulty || "?"} delayMs=${cfg.delayMs ?? 0}`);
  if (summary.sickRate.mean != null) {
    lines.push(`sickRate  mean=${fmt(summary.sickRate.mean)} ± ${fmt(summary.sickRate.std)}`);
  }
  if (summary.precision.mean != null) {
    lines.push(`precision mean=${fmt(summary.precision.mean)} ± ${fmt(summary.precision.std)}`);
  }
  if (summary.offsetMean.mean != null) {
    lines.push(`offsetMs  mean=${fmt(summary.offsetMean.mean, 2)} ± ${fmt(summary.offsetMean.std, 2)}`);
  }
  if (summary.best) lines.push(`best sick=${fmt(summary.best.sickRate)} prec=${fmt(summary.best.precision)} (${summary.best.resultado})`);
  if (summary.worst) lines.push(`worst sick=${fmt(summary.worst.sickRate)} prec=${fmt(summary.worst.precision)} (${summary.worst.resultado})`);
  for (let i = 0; i < (summary.results || []).length; i++) {
    const r = summary.results[i];
    if (r.infraError) {
      lines.push(`  #${i + 1} ERROR ${r.infraError}`);
      continue;
    }
    const j = r.juicios;
    lines.push(`  #${i + 1} ${r.resultado} sick=${fmt(r.sickRate)} prec=${fmt(r.precision)} S/G/B/M=${j.sick}/${j.good}/${j.bad}/${j.miss}`);
  }
  return lines.join("\n");
}

function fmt(x, dig = 3) {
  if (x == null || Number.isNaN(x)) return "n/a";
  return Number(x).toFixed(dig);
}
