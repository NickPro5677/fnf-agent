#!/usr/bin/env node
// Agente de ejemplo en JavaScript, SIN dependencias (Node 22+ trae WebSocket).
// Protocolo v2: mide la latencia con ping/pong, sincroniza el reloj y manda cada tecla con "at".
//
//   python agente/relay.py &
//   node agente/agente.mjs                 # token: --token, FNF_TOKEN o ~/.fnf-agent/token
//   node agente/agente.mjs --relay ws://127.0.0.1:8765 --una
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const URL_RELAY = opcion("--relay") || process.env.FNF_RELAY || "ws://127.0.0.1:8765";
const UNA = args.includes("--una");
const FLECHAS = ["←", "↓", "↑", "→"];
const MARGEN = 90; // ms extra de adelanto

function leerToken() {
  if (opcion("--token")) return opcion("--token");
  if (process.env.FNF_TOKEN) return process.env.FNF_TOKEN;
  try { return fs.readFileSync(path.join(os.homedir(), ".fnf-agent", "token"), "utf8").trim(); } catch { return null; }
}

/** Convierte las notas en acciones ordenadas [t, lane, down, motivo] (como agente_chart.py). */
export function planificar(notas, pulsacion = 50) {
  const acciones = [];
  const porCarril = new Map();
  for (const n of [...notas].sort((a, b) => a.t - b.t)) {
    if (!porCarril.has(n.lane)) porCarril.set(n.lane, []);
    porCarril.get(n.lane).push(n);
  }
  for (const [lane, lista] of porCarril) {
    lista.forEach((n, i) => {
      let fin = n.t + (n.l || pulsacion);
      const sig = lista[i + 1]?.t;
      if (sig != null && fin >= sig) fin = sig - 5;
      acciones.push([n.t, lane, true, `nota ${n.id}`], [Math.max(fin, n.t + 1), lane, false, ""]);
    });
  }
  return acciones.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

/** Reloj con ping/pong: tiempo de la canción ≈ pong.t + rtt/2. */
export class RelojPing {
  constructor(ahora = () => performance.now()) { this.ahora_ = ahora; this.muestras = []; this.rtt = null; this.desfase = null; }
  reiniciar() { this.muestras = []; this.rtt = null; this.desfase = null; }
  pong(m) {
    if (m.t == null || m.sent == null) return;
    const ahora = this.ahora_(), rtt = ahora - m.sent;
    this.muestras = [...this.muestras, [rtt, m.t + rtt / 2 - ahora]].sort((a, b) => a[0] - b[0]).slice(0, 5);
    this.rtt = this.muestras[0][0];
    this.desfase = this.muestras.reduce((s, x) => s + x[1], 0) / this.muestras.length;
  }
  ver(t) { if (!this.muestras.length) { const d = t - this.ahora_(); if (this.desfase == null || d > this.desfase) this.desfase = d; } }
  ahora() { return this.desfase == null ? null : this.ahora_() + this.desfase; }
}

function main() {
  const token = leerToken();
  if (!token) { console.error("Falta el token: arranca python agente/relay.py (lo muestra) y usa --token o FNF_TOKEN."); process.exit(1); }
  const ws = new WebSocket(URL_RELAY);
  const reloj = new RelojPing();
  let plan = [], i = 0, usaAt = false, nPing = 0, ultimoPing = -1e9, jugando = false;
  const enviar = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

  ws.onopen = () => enviar({ type: "hello", role: "agent", name: "JS (Node)", token, v: 2, caps: ["at", "ping"] });
  ws.onerror = () => { console.error(`No pude conectar a ${URL_RELAY}. ¿Arrancaste python agente/relay.py?`); process.exit(1); };
  ws.onclose = () => process.exit(0);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === "error") { console.error(`[js] el relay dijo: ${m.error}. ${m.detail || ""}`); return; }
    if (m.type === "welcome" || m.type === "peers") {
      usaAt = (m.game?.caps || []).includes("at");
      if (m.type === "welcome") console.log(`[js] conectado a ${URL_RELAY} (v2). Elige 'IA externa' en el juego y pulsa Jugar.`);
    } else if (m.type === "chart") {
      plan = planificar(m.notes); i = 0; jugando = true; reloj.reiniciar(); ultimoPing = -1e9;
      console.log(`[js] '${m.song}': ${m.notes.length} notas`);
    } else if (m.type === "state") reloj.ver(m.t);
    else if (m.type === "pong") reloj.pong(m);
    else if (m.type === "ping") enviar({ type: "pong", id: m.id, sent: m.sent, to_id: m.from_id });
    else if (m.type === "result") {
      console.log(`[js] resultado: ${m.resultado} · precisión ${((m.precision || 0) * 100).toFixed(1)} % · latencia ${reloj.rtt?.toFixed(0) ?? "?"} ms`);
      jugando = false; plan = [];
      if (UNA) { ws.close(); }
    }
  };

  setInterval(() => {
    const ahora = performance.now();
    if (jugando && usaAt && ahora - ultimoPing >= (reloj.muestras.length < 5 ? 100 : 1000)) {
      ultimoPing = ahora;
      enviar({ type: "ping", id: ++nPing, sent: ahora });
    }
    const t = reloj.ahora();
    if (t == null) return;
    const ida = reloj.rtt != null ? reloj.rtt / 2 : 100;
    const adelanto = usaAt ? ida + MARGEN : ida;
    while (i < plan.length && plan[i][0] - adelanto <= t) {
      const [ta, lane, down, motivo] = plan[i++];
      enviar({ type: "key", lane, down, ...(usaAt ? { at: ta } : {}), ...(down ? { why: `${FLECHAS[lane]} ${motivo}` } : {}) });
    }
  }, 2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
