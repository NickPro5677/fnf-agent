// Ajustes de la IA externa: campos del formulario, perfiles guardados (exportar/importar) y registro en vivo.
const $ = (s) => document.querySelector(s);
const CLAVE_PERFILES = "fnf-ia-perfiles";
const CLAVE_ACTUAL = "fnf-ia";
const MAX_LOG = 60;

/** Separa "ws://host:puerto" en { host: "ws://host", puerto }. */
export function partirUrl(texto) {
  const t = String(texto || "").trim();
  try {
    const u = new URL(/^wss?:\/\//.test(t) ? t : `ws://${t}`);
    return { host: `${u.protocol}//${u.hostname}`, puerto: u.port || "" };
  } catch { return { host: t, puerto: "" }; }
}

/** Junta servidor y puerto en una URL ws:// válida (o lanza un Error claro). */
export function unirUrl(host, puerto) {
  const { host: h, puerto: p } = partirUrl(host);
  const port = String(puerto || p || "8765").trim();
  if (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) throw new Error("Puerto inválido");
  const u = new URL(h);
  if (!/^wss?:$/.test(u.protocol)) throw new Error("El servidor debe empezar por ws://");
  u.port = port;
  return u.toString().replace(/\/$/, "");
}

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

/** Valores del formulario (incluye el token). */
export function leerCampos() {
  return {
    host: $("#url-relay").value.trim(), puerto: $("#puerto-relay").value.trim(), token: $("#token-relay").value.trim(),
    modo: $("#modo-ia").value, hz: +$("#hz-ia").value, lookahead: +$("#lookahead-ia").value,
    compensacion: { tipo: $("#comp-ia").value, ms: +$("#comp-ms").value },
  };
}

export function ponerCampos(c = {}) {
  if (c.host != null) $("#url-relay").value = c.host;
  if (c.puerto != null) $("#puerto-relay").value = c.puerto;
  if (c.token != null) $("#token-relay").value = c.token;
  if (c.modo) $("#modo-ia").value = c.modo === "v1" ? "v1" : "v2";
  if (c.hz) $("#hz-ia").value = Math.min(60, Math.max(10, +c.hz));
  if (c.lookahead) $("#lookahead-ia").value = Math.min(4000, Math.max(250, +c.lookahead));
  if (c.compensacion?.tipo) $("#comp-ia").value = ["auto", "manual", "no"].includes(c.compensacion.tipo) ? c.compensacion.tipo : "auto";
  if (c.compensacion?.ms != null) $("#comp-ms").value = Math.min(150, Math.max(0, +c.compensacion.ms));
  pintarValores();
}

export function pintarValores() {
  $("#hz-ia-val").textContent = $("#hz-ia").value;
  $("#lookahead-ia-val").textContent = `${$("#lookahead-ia").value} ms`;
  $("#comp-ms-val").textContent = `${$("#comp-ms").value} ms`;
  $("#campo-comp-ms").classList.toggle("oculto", $("#comp-ia").value !== "manual");
  $("#puerto-relay").value = $("#puerto-relay").value.replace(/\D/g, "");
  $("#token-relay").type = $("#token-ver").checked ? "text" : "password";
  const v1 = $("#modo-ia").value === "v1";
  $("#lookahead-ia").disabled = v1;
}

export function guardarActual() { escribir(CLAVE_ACTUAL, leerCampos()); }
export function cargarActual() { ponerCampos(leer(CLAVE_ACTUAL, {})); }

// ---------- perfiles ----------
export const perfiles = () => leer(CLAVE_PERFILES, {});

export function pintarPerfiles(elegido = "") {
  const sel = $("#perfil-ia");
  const primero = sel.options[0];
  sel.replaceChildren(primero, ...Object.keys(perfiles()).sort().map((n) => new Option(n, n)));
  sel.value = elegido;
}

export function guardarPerfil(nombre) {
  nombre = String(nombre || "").trim().slice(0, 30);
  if (!nombre) throw new Error("Ponle un nombre al perfil");
  const todos = perfiles();
  todos[nombre] = leerCampos();
  escribir(CLAVE_PERFILES, todos);
  pintarPerfiles(nombre);
  return nombre;
}

export function usarPerfil(nombre) { const p = perfiles()[nombre]; if (p) ponerCampos(p); return !!p; }

export function borrarPerfil(nombre) {
  const todos = perfiles();
  delete todos[nombre];
  escribir(CLAVE_PERFILES, todos);
  pintarPerfiles();
}

/** JSON para descargar. El token NUNCA se exporta. */
export function exportarPerfiles() {
  const limpio = Object.fromEntries(Object.entries(perfiles()).map(([n, p]) => { const { token, ...resto } = p; return [n, resto]; }));
  return JSON.stringify({ tipo: "fnf-agent-perfiles-ia", v: 1, perfiles: limpio }, null, 2);
}

/** Importa perfiles de un JSON exportado. Devuelve cuántos. Los campos raros se ignoran. */
export function importarPerfiles(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { throw new Error("El archivo no es JSON"); }
  if (d?.tipo !== "fnf-agent-perfiles-ia" || typeof d.perfiles !== "object") throw new Error("No es un archivo de perfiles de FNF-Agent");
  const todos = perfiles();
  let n = 0;
  for (const [nombre, p] of Object.entries(d.perfiles).slice(0, 50)) {
    if (!p || typeof p !== "object") continue;
    const limpio = {
      host: String(p.host ?? "ws://127.0.0.1").slice(0, 200), puerto: String(p.puerto ?? "8765").replace(/\D/g, "").slice(0, 5),
      modo: p.modo === "v1" ? "v1" : "v2", hz: +p.hz || 30, lookahead: +p.lookahead || 1500,
      compensacion: { tipo: ["auto", "manual", "no"].includes(p.compensacion?.tipo) ? p.compensacion.tipo : "auto", ms: +p.compensacion?.ms || 0 },
    };
    if (todos[nombre]?.token) limpio.token = todos[nombre].token;
    todos[String(nombre).slice(0, 30)] = limpio;
    n++;
  }
  escribir(CLAVE_PERFILES, todos);
  pintarPerfiles();
  return n;
}

// ---------- registro ----------
export function anotar(texto, tipo = "") {
  const ol = $("#ia-log");
  const li = document.createElement("li");
  const hora = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  li.innerHTML = `<time></time> <span></span>`;
  li.firstChild.textContent = hora;
  li.lastChild.textContent = texto;
  if (tipo) li.className = `log-${tipo}`;
  ol.append(li);
  while (ol.children.length > MAX_LOG) ol.firstChild.remove();
  ol.parentElement.scrollTop = ol.parentElement.scrollHeight;
}
