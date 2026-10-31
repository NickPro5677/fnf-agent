// Protocolo para IAs externas (ver docs/protocolo-v2.md; v1 en docs/protocolo.md). Mensajes JSON por WebSocket.
import { CARRILES } from "./constantes.js";

export const VERSION_PROTOCOLO = 2;
export const CAPS_JUEGO = ["at", "ping", "lookahead"];

/** Mensaje "chart": todas las notas que debe tocar el jugador, al empezar la canción. */
export function mensajeChart(juego, cancion) {
  return {
    type: "chart", v: VERSION_PROTOCOLO, song: cancion,
    bpm: juego.chart.bpm,
    notes: juego.jugables.map((n) => ({ id: n.id, t: n.t, lane: n.lane, l: n.l })),
    windows: { sick: 45, good: 90, bad: 135, miss: 180 },
  };
}

/**
 * Mensaje "state": foto del juego ahora mismo (unas 30 veces por segundo).
 * Con `lookahead` (ms, v2) "next" trae todas las notas que llegan en ese tiempo (hasta 64); sin él, las 8 próximas (v1).
 */
export function mensajeEstado(juego, maxNotas = 8, lookahead = null) {
  if (lookahead != null) maxNotas = 64;
  const t = juego.t;
  const proximas = [];
  const lanes = [null, null, null, null];
  for (const n of juego.jugables) {
    if (n.estado !== "espera") continue;
    const dt = n.t - t;
    if (lanes[n.lane] === null) lanes[n.lane] = Math.round(dt);
    if (proximas.length < maxNotas && (lookahead == null || dt <= lookahead || proximas.length < 1)) proximas.push({ id: n.id, lane: n.lane, t: n.t, dt: Math.round(dt), l: n.l });
    if ((proximas.length >= maxNotas || (lookahead != null && dt > lookahead)) && lanes.every((x) => x !== null)) break;
  }
  const holds = [null, null, null, null];
  for (const n of juego.jugables) if (n.estado === "hold") holds[n.lane] = Math.round(n.finHold - t);
  return {
    type: "state", v: lookahead != null ? 2 : 1, ...(lookahead != null ? { lookahead } : {}), t: Math.round(t), playing: !juego.resultado,
    next: proximas, lanes, holds, keys: [...juego.teclas],
    health: +juego.vida.toFixed(3), score: juego.puntos, combo: juego.combo,
    accuracy: +juego.precision.toFixed(4), judgements: { ...juego.j },
  };
}

/** Valida un mensaje que manda la IA. Devuelve {ok:true, ...} o {ok:false, error}. */
export function leerMensajeAgente(texto) {
  let m;
  try { m = typeof texto === "string" ? JSON.parse(texto) : texto; } catch { return { ok: false, error: "json_invalido" }; }
  if (!m || typeof m !== "object") return { ok: false, error: "json_invalido" };
  if (m.type === "key") {
    let lane = m.lane;
    if (typeof lane === "string") lane = CARRILES.indexOf(lane);
    if (!Number.isInteger(lane) || lane < 0 || lane > 3) return { ok: false, error: "lane_invalido" };
    if (typeof m.down !== "boolean") return { ok: false, error: "down_debe_ser_booleano" };
    const at = typeof m.at === "number" && Number.isFinite(m.at) ? m.at : null;
    return { ok: true, type: "key", lane, down: m.down, at, why: typeof m.why === "string" ? m.why.slice(0, 120) : "" };
  }
  if (m.type === "think") return { ok: true, type: "think", text: String(m.text ?? "").slice(0, 200) };
  if (m.type === "ping" || m.type === "pong") return { ok: true, type: m.type, data: m };
  if (m.type === "error") return { ok: true, type: "error", error: String(m.error ?? ""), detail: String(m.detail ?? "") };
  if (m.type === "hello" || m.type === "peers" || m.type === "welcome") return { ok: true, type: m.type, data: m };
  return { ok: false, error: "tipo_desconocido" };
}
