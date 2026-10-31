// Lee charts de FNF y los convierte a un formato interno sencillo.
// Formatos aceptados:
//   1) v2.0.0 (FNF 0.8+): { version, notes: { easy|normal|hard: [{t,d,l}] } }
//   2) clásico / Psych Engine: { song: { bpm, speed, notes: [{ sectionNotes: [[t,d,l]], mustHitSection }] } }
// Formato interno: { titulo, bpm, velocidad, notas: [{ t, lane, l, lado: "jugador"|"rival" }], duracion }

export const DIFICULTADES = ["easy", "normal", "hard"];

function num(v, porDefecto) {
  const n = Number(v);
  return Number.isFinite(n) ? n : porDefecto;
}

function velocidadV2(scroll, dif) {
  if (typeof scroll === "number") return scroll;
  if (scroll && typeof scroll === "object") return num(scroll[dif] ?? scroll.default ?? scroll.base, 1);
  return 1;
}

export function detectarFormato(json) {
  if (!json || typeof json !== "object") return null;
  if (json.notes && !Array.isArray(json.notes) && typeof json.notes === "object") return "v2";
  const s = json.song && typeof json.song === "object" ? json.song : json;
  if (Array.isArray(s.notes)) return "clasico";
  return null;
}

function terminar(base, notas) {
  notas.sort((a, b) => a.t - b.t || a.lane - b.lane);
  const fin = notas.reduce((m, n) => Math.max(m, n.t + n.l), 0);
  return { ...base, notas, duracion: fin };
}

export function leerChart(json, dificultad = "normal") {
  const formato = detectarFormato(json);
  if (!formato) throw new Error("No reconozco este chart: falta 'notes'.");
  if (formato === "v2") {
    const difs = DIFICULTADES.filter((d) => Array.isArray(json.notes[d]));
    const extra = Object.keys(json.notes).filter((d) => Array.isArray(json.notes[d]) && !difs.includes(d));
    const todas = [...difs, ...extra];
    if (!todas.length) throw new Error("El chart no tiene ninguna dificultad.");
    const dif = todas.includes(dificultad) ? dificultad : todas[0];
    const notas = [];
    for (const n of json.notes[dif]) {
      const d = Math.trunc(num(n?.d, -1));
      const t = num(n?.t, NaN);
      if (!Number.isFinite(t) || d < 0 || d > 7) continue;
      notas.push({ t, lane: d % 4, l: Math.max(0, num(n.l, 0)), lado: d % 8 < 4 ? "jugador" : "rival" });
    }
    return terminar({
      titulo: json.titulo || json.metadata?.songName || "Sin título",
      bpm: num(json.bpm ?? json.metadata?.bpm, 120),
      velocidad: velocidadV2(json.scrollSpeed, dif),
      dificultad: dif,
      dificultades: todas,
      formato,
    }, notas);
  }
  const s = json.song && typeof json.song === "object" ? json.song : json;
  const notas = [];
  for (const sec of s.notes) {
    if (!sec || !Array.isArray(sec.sectionNotes)) continue;
    const mustHit = !!sec.mustHitSection;
    for (const n of sec.sectionNotes) {
      if (!Array.isArray(n)) continue;
      const t = num(n[0], NaN);
      const d = Math.trunc(num(n[1], -1));
      if (!Number.isFinite(t) || d < 0 || d > 7) continue; // d = -1 son eventos de Psych
      const deJugador = mustHit ? d < 4 : d >= 4;
      notas.push({ t, lane: d % 4, l: Math.max(0, num(n[2], 0)), lado: deJugador ? "jugador" : "rival" });
    }
  }
  return terminar({
    titulo: s.song || s.songName || "Sin título",
    bpm: num(s.bpm, 120),
    velocidad: num(s.speed, 1),
    dificultad: dificultad,
    dificultades: [dificultad],
    formato,
  }, notas);
}
