// Spectator WS + JSONL. El spectator solo mira; no manda teclas.
import fs from "node:fs";
import path from "node:path";

/**
 * Conecta un spectator al relay y registra mensajes.
 * @returns {{ close: () => void, events: object[], offsets: number[], rttSamples: number[], writeJsonl: (file) => void }}
 */
export function conectarSpectator(url, token, { name = "fnf-bench" } = {}) {
  const events = [];
  const offsets = [];
  const rttSamples = [];
  const t0 = Date.now();
  const pendingPing = new Map(); // id → tWall

  const ws = new WebSocket(url);
  let abierto = false;
  let cerrarPedido = false;

  const push = (dir, msg, extra = {}) => {
    const tSong = msg?.t ?? msg?.at ?? null;
    events.push({ tWall: Date.now() - t0, tSong, dir, msg, ...extra });
  };

  const listo = new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("spectator: timeout al conectar")), 15000);
    ws.addEventListener("open", () => {
      abierto = true;
      ws.send(JSON.stringify({
        type: "hello", role: "spectator", name, token, v: 2, caps: ["spectator"],
      }));
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      const tipo = msg.type;
      if (tipo === "welcome") {
        clearTimeout(timer);
        push("in", msg);
        ok();
        return;
      }
      if (tipo === "error") {
        push("in", msg);
        if (!abierto) { clearTimeout(timer); fail(new Error(`spectator: ${msg.error || "error"}`)); }
        return;
      }
      // Dirección aproximada: mensajes del juego vs del agente.
      const dir = (tipo === "key" || tipo === "think" || tipo === "pong") ? "in" : "in";
      push(dir, msg);

      if (tipo === "judgement" && msg.offset != null) {
        offsets.push(msg.offset);
        events.push({
          tWall: Date.now() - t0,
          tSong: msg.t ?? null,
          dir: "sys",
          juicio: { kind: msg.kind, offset: msg.offset, lane: msg.lane, note: msg.note },
        });
      }
      if (tipo === "ping" && msg.id != null) {
        pendingPing.set(msg.id, Date.now());
      }
      if (tipo === "pong" && msg.id != null && pendingPing.has(msg.id)) {
        const sent = pendingPing.get(msg.id);
        pendingPing.delete(msg.id);
        rttSamples.push(Date.now() - sent);
      }
    });
    ws.addEventListener("error", () => {
      if (!abierto) { clearTimeout(timer); fail(new Error("spectator: error de red")); }
    });
    ws.addEventListener("close", () => { abierto = false; });
  });

  return {
    listo,
    events,
    offsets,
    rttSamples,
    close() {
      cerrarPedido = true;
      try { ws.close(); } catch { /* ok */ }
    },
    writeJsonl(file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const lines = events.map((e) => JSON.stringify(e));
      fs.writeFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
    },
  };
}

/** Re-agrega métricas desde un JSONL de trace (solo juicios / result). */
export function metricasDesdeTrace(jsonlPath) {
  const texto = fs.readFileSync(jsonlPath, "utf8");
  const offsets = [];
  let result = null;
  let juicios = null;
  for (const line of texto.split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.juicio?.offset != null) offsets.push(e.juicio.offset);
    if (e.msg?.type === "judgement" && e.msg.offset != null && e.juicio == null) {
      offsets.push(e.msg.offset);
    }
    if (e.msg?.type === "result") {
      result = e.msg.resultado ?? e.msg.result ?? null;
      juicios = e.msg.juicios || e.msg.judgements || null;
      if (e.msg.accuracy != null && !e.msg.precision) {
        // v1-ish
      }
    }
  }
  return { offsets, result, juicios };
}
