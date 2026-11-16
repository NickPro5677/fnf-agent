// Diff breve entre dos summary.json.
import fs from "node:fs";

function num(x) {
  return x == null || Number.isNaN(x) ? null : Number(x);
}

function fmt(x, dig = 3) {
  if (x == null) return "n/a";
  return Number(x).toFixed(dig);
}

function delta(a, b) {
  if (a == null || b == null) return "n/a";
  const d = b - a;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(3)}`;
}

/** Compara dos summaries; devuelve texto ASCII. */
export function compareSummaries(a, b, { labelA = "A", labelB = "B" } = {}) {
  const lines = [];
  lines.push(`compare ${labelA} vs ${labelB}`);
  lines.push(`  ${labelA}: mode=${a.config?.mode} agent=${a.config?.agent || a.config?.perfil} song=${a.config?.song} delay=${a.config?.delayMs ?? 0} runs=${a.runs}`);
  lines.push(`  ${labelB}: mode=${b.config?.mode} agent=${b.config?.agent || b.config?.perfil} song=${b.config?.song} delay=${b.config?.delayMs ?? 0} runs=${b.runs}`);
  const rows = [
    ["sickRate", a.sickRate?.mean, b.sickRate?.mean],
    ["precision", a.precision?.mean, b.precision?.mean],
    ["offsetMean", a.offsetMean?.mean, b.offsetMean?.mean],
  ];
  for (const [name, va, vb] of rows) {
    lines.push(`  ${name.padEnd(10)} ${fmt(va)} → ${fmt(vb)}  (Δ ${delta(num(va), num(vb))})`);
  }
  if (a.best && b.best) {
    lines.push(`  bestSick   ${fmt(a.best.sickRate)} → ${fmt(b.best.sickRate)}`);
  }
  if (a.worst && b.worst) {
    lines.push(`  worstSick  ${fmt(a.worst.sickRate)} → ${fmt(b.worst.sickRate)}`);
  }
  return lines.join("\n");
}

export function leerSummary(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
