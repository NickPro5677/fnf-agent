// Pantallas y bucle del juego. Une motor + jugadores + dibujo + música.
import { leerChart } from "./motor/chart.js";
import { Juego } from "./motor/juego.js";
import { NOMBRES_CARRIL } from "./motor/constantes.js";
import { JugadorHumano } from "./jugadores/humano.js";
import { JugadorBot } from "./jugadores/bot.js";
import { JugadorRemoto } from "./jugadores/remoto.js";
import { Lienzo, COLORES } from "./vista/lienzo.js";
import { Musica } from "./audio/musica.js";
import { traducir, idioma, cambiarIdioma } from "./i18n.js";

const $ = (s) => document.querySelector(s);
const FLECHAS = ["←", "↓", "↑", "→"];
const COLOR_JUICIO = { sick: "#6ef3ff", good: "#3ef08a", bad: "#ffd84f", miss: "#ff7b93" };
const TEXTO_JUICIO = { sick: "¡Sick!", good: "Good", bad: "Bad", miss: "Miss" };

const musica = new Musica();
const lienzo = new Lienzo($("#lienzo"));
const ajustes = JSON.parse(localStorage.getItem("fnf-ajustes") || "{}");
let canciones = [];
let seleccion = ajustes.cancion || "primer-paso";
let propia = null; // { json, nombre }
let remoto = null;
let partida = null;

// ---------- menú ----------
async function cargarLista() {
  canciones = await (await fetch("canciones/lista.json")).json();
  pintarCanciones();
}

function pintarCanciones() {
  const cont = $("#canciones");
  cont.innerHTML = "";
  const items = canciones.map((c) => ({ id: c.id, titulo: c.titulo, info: `${c.bpm} BPM · ${c.notas.easy}/${c.notas.normal}/${c.notas.hard} ${traducir("notas")}`, color: c.color }));
  if (propia) items.push({ id: "propia", titulo: propia.nombre, info: traducir("tu-cancion"), color: "#ffd84f" });
  if (!items.some((i) => i.id === seleccion)) seleccion = items[0].id;
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cancion";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(it.id === seleccion));
    b.style.setProperty("--color", it.color);
    b.dataset.id = it.id;
    b.innerHTML = `<b></b><small></small>`;
    b.querySelector("b").textContent = it.titulo;
    b.querySelector("small").textContent = it.info;
    b.addEventListener("click", () => { seleccion = it.id; guardar(); pintarCanciones(); });
    cont.append(b);
  }
}

function guardar() {
  Object.assign(ajustes, {
    cancion: seleccion, jugador: tipoJugador(), dificultad: $("#dificultad").value,
    precision: +$("#precision").value, velocidad: +$("#velocidad").value, retraso: +$("#retraso").value,
    sonido: $("#sonido").checked, url: $("#url-relay").value,
  });
  localStorage.setItem("fnf-ajustes", JSON.stringify(ajustes));
}

const tipoJugador = () => document.querySelector("input[name=jugador]:checked").value;

function actualizarOpciones() {
  const t = tipoJugador();
  $("#op-humanizado").classList.toggle("oculto", t !== "humanizado");
  $("#op-remoto").classList.toggle("oculto", t !== "remoto");
  $("#precision-val").textContent = `${$("#precision").value} %`;
  $("#velocidad-val").textContent = `${(+$("#velocidad").value).toFixed(1)}×`;
  $("#retraso-val").textContent = `${$("#retraso").value} ms`;
  guardar();
}

function aplicarAjustes() {
  if (ajustes.jugador) { const r = document.querySelector(`input[name=jugador][value=${ajustes.jugador}]`); if (r) r.checked = true; }
  if (ajustes.dificultad) $("#dificultad").value = ajustes.dificultad;
  for (const k of ["precision", "velocidad", "retraso"]) if (ajustes[k] != null) $("#" + k).value = ajustes[k];
  if (ajustes.sonido != null) $("#sonido").checked = ajustes.sonido;
  if (ajustes.url) $("#url-relay").value = ajustes.url;
  const q = new URLSearchParams(location.search);
  if (q.get("relay")) $("#url-relay").value = q.get("relay");
  if (q.get("jugador")) { const r = document.querySelector(`input[name=jugador][value=${q.get("jugador")}]`); if (r) r.checked = true; }
  actualizarOpciones();
}

async function conectarRelay() {
  const estado = $("#estado-relay");
  remoto?.cerrar();
  remoto = new JugadorRemoto({ url: $("#url-relay").value.trim() });
  estado.textContent = traducir("conectando");
  try {
    await remoto.abrir(({ conectado, agentes, nombres }) => {
      estado.textContent = conectado
        ? `${traducir("conectado")} · ${agentes} ${traducir("agentes")}${nombres?.length ? ": " + nombres.join(", ") : ""}`
        : traducir("desconectado");
      $("#panel-ia-titulo").textContent = nombres?.length ? `IA: ${nombres.join(", ")}` : "IA externa";
    });
    return true;
  } catch (e) {
    estado.textContent = `⚠ ${e.message}. ${traducir("relay-ayuda-corta")}`;
    remoto = null;
    return false;
  }
}

// ---------- partida ----------
async function obtenerChart() {
  const dif = $("#dificultad").value;
  if (seleccion === "propia" && propia) return { chart: leerChart(propia.json, dif), info: {}, id: "propia" };
  const json = await (await fetch(`canciones/${seleccion}.json`)).json();
  return { chart: leerChart(json, dif), info: json.musica || {}, id: seleccion };
}

async function crearJugador() {
  const t = tipoJugador();
  if (t === "perfecto") return new JugadorBot({ modo: "perfecto" });
  if (t === "humanizado") return new JugadorBot({ modo: "humano", precision: +$("#precision").value / 100, semilla: Date.now() % 1e6 });
  if (t === "remoto") {
    if (!remoto && !(await conectarRelay())) return null;
    return remoto;
  }
  return new JugadorHumano({ botones: [...document.querySelectorAll("#pad .tecla")] });
}

// Ancho (px) que ocupa el panel de la IA a la izquierda, para que no tape ningún carril.
function reservaPanel() {
  const p = $("#panel-ia");
  if (p.classList.contains("oculto")) return 0;
  return p.offsetLeft + p.offsetWidth + 12;
}

function panelIA(jugador) {
  const ver = jugador.tipo !== "humano";
  $("#panel-ia").classList.toggle("oculto", !ver);
  $("#panel-ia-lista").innerHTML = "";
  $("#panel-ia-piensa").textContent = "";
  if (jugador.tipo === "bot") $("#panel-ia-titulo").textContent = jugador.nombre;
}

function anotarDecision(lane, motivo) {
  const ol = $("#panel-ia-lista");
  const li = document.createElement("li");
  li.innerHTML = `<span></span><span class="m"></span><span class="j"></span>`;
  li.children[0].textContent = FLECHAS[lane];
  li.children[0].style.color = COLORES[lane];
  li.children[1].textContent = motivo;
  ol.prepend(li);
  while (ol.children.length > 6) ol.lastChild.remove();
  return li;
}

async function empezar() {
  guardar();
  const btn = $("#btn-jugar");
  btn.disabled = true;
  try {
    const { chart, info, id } = await obtenerChart();
    const jugador = await crearJugador();
    if (!jugador) return;
    if (!chart.notas.some((n) => n.lado === "jugador")) throw new Error(traducir("sin-notas"));
    terminar(false);
    const juego = new Juego(chart);
    const beat = 60000 / chart.bpm;
    const cuenta = Math.max(1600, beat * 4);
    const retraso = +$("#retraso").value;
    const velocidad = chart.velocidad * +$("#velocidad").value;
    $("#menu").classList.add("oculto");
    $("#juego").classList.remove("oculto");
    document.body.classList.toggle("sin-pad", jugador.tipo !== "humano");
    $("#resultados").open && $("#resultados").close();
    partida = { juego, jugador, chart, id, info, velocidad, inicio: performance.now() + cuenta, retraso, ultimaDecision: [] };
    const ahora = () => performance.now() - partida.inicio - partida.retraso;
    const manejar = (ev) => {
      if (!ev) return;
      jugador.evento?.(ev);
      if (ev.tipo === "juicio") {
        lienzo.efecto({ tipo: "popup", texto: TEXTO_JUICIO[ev.juicio], color: COLOR_JUICIO[ev.juicio], combo: juego.combo });
        if (ev.juicio !== "miss") lienzo.efecto({ tipo: "destello", lane: ev.lane });
        else if ($("#sonido").checked) musica.fallo();
        const li = partida.ultimaDecision[ev.lane];
        if (li && !li.dataset.listo) {
          li.dataset.listo = 1;
          const j = li.querySelector(".j");
          j.textContent = `${ev.juicio}${ev.desfase != null ? ` ${ev.desfase > 0 ? "+" : ""}${ev.desfase}ms` : ""}`;
          j.className = `j j-${ev.juicio}`;
        }
      } else if (ev.tipo === "rival") {
        lienzo.efecto({ tipo: "destello", lane: ev.lane, rival: true });
        lienzo.rivalOn = [0, 1, 2, 3].map((l) => l === ev.lane);
        setTimeout(() => { lienzo.rivalOn = null; }, 120);
      } else if (ev.tipo === "fin") setTimeout(() => terminar(true), 700);
    };
    const ctx = {
      juego, cancion: chart.titulo,
      presionar(lane, motivo = "") {
        if (jugador.tipo !== "humano") {
          partida.ultimaDecision[lane] = anotarDecision(lane, motivo);
          lienzo.rayo(lane, motivo.length < 18 ? motivo : "", COLORES[lane]);
        }
        manejar(juego.presionar(lane, ahora()));
      },
      soltar(lane) { juego.soltar(lane, ahora()).forEach(manejar); },
      pensar(texto) { $("#panel-ia-piensa").textContent = texto; },
    };
    partida.ctx = ctx;
    partida.manejar = manejar;
    panelIA(jugador);
    jugador.conectar(ctx);
    partida.listo = true; // ya hay controles conectados (las pruebas esperan esto)
    if ($("#sonido").checked) musica.iniciar(chart, info, cuenta); else musica.detener();
    partida.raf = requestAnimationFrame(bucle);
  } catch (e) {
    alert(`${traducir("error")}: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

function bucle() {
  if (!partida) return;
  const { juego, jugador } = partida;
  const t = performance.now() - partida.inicio - partida.retraso;
  if (!juego.resultado) {
    juego.actualizar(t).forEach(partida.manejar);
    if (!juego.resultado) jugador.cuadro(t);
  }
  lienzo.dibujar(juego, t, { velocidad: partida.velocidad, bpm: partida.chart.bpm, color: partida.info.color || "#7c5cff", mostrarIA: jugador.tipo !== "humano", reserva: reservaPanel() });
  const r = juego.resumen();
  pon("#hud-puntos", r.puntos.toLocaleString(idioma()));
  pon("#hud-precision", `${(r.precision * 100).toFixed(1)} %`);
  pon("#hud-combo", r.combo);
  pon("#hud-fallos", r.juicios.miss);
  partida.raf = requestAnimationFrame(bucle);
}

function pon(sel, v) { const el = $(sel); const s = String(v); if (el.textContent !== s) el.textContent = s; }

function terminar(mostrar) {
  if (!partida) return;
  cancelAnimationFrame(partida.raf);
  partida.jugador.desconectar();
  musica.detener();
  const r = partida.juego.resumen();
  const quien = partida.jugador.nombre;
  if (mostrar) {
    $("#res-titulo").textContent = r.resultado === "victoria" ? traducir("victoria") : traducir("derrota");
    $("#res-letra").textContent = r.letra;
    $("#res-puntos").textContent = r.puntos.toLocaleString(idioma());
    $("#res-precision").textContent = `${(r.precision * 100).toFixed(2)} %`;
    $("#res-combo").textContent = `${r.comboMax}${r.fullCombo ? " FC" : ""}`;
    for (const k of ["sick", "good", "bad", "miss"]) $(`#res-${k}`).textContent = r.juicios[k];
    $("#res-quien").textContent = `${traducir("jugo")}: ${quien} · ${partida.chart.titulo} (${partida.chart.dificultad})`;
    $("#resultados").showModal();
  }
  window.__fnf.ultimo = { ...r, jugador: quien, cancion: partida.id };
  if (!mostrar) partida = null;
  else partida.terminada = true;
}

function volverAlMenu() {
  if (partida && !partida.terminada) terminar(false);
  partida = null;
  $("#resultados").open && $("#resultados").close();
  $("#juego").classList.add("oculto");
  $("#menu").classList.remove("oculto");
  $("#btn-jugar").focus();
}

// ---------- archivos propios ----------
$("#archivo-chart").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    const c = leerChart(json, $("#dificultad").value);
    propia = { json, nombre: c.titulo !== "Sin título" ? c.titulo : f.name.replace(/\.json$/i, "") };
    seleccion = "propia";
    $("#estado-archivos").textContent = `✓ ${propia.nombre}: ${c.notas.filter((n) => n.lado === "jugador").length} ${traducir("notas")} (${c.formato})`;
    pintarCanciones();
  } catch (err) { $("#estado-archivos").textContent = `⚠ ${err.message}`; }
});
$("#archivo-audio").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) { musica.quitarArchivo(); return; }
  try { await musica.cargarArchivo(f); $("#estado-archivos").textContent = `✓ Audio: ${f.name}`; }
  catch (err) { $("#estado-archivos").textContent = `⚠ ${err.message}`; }
});

// ---------- eventos ----------
document.querySelectorAll("input[name=jugador]").forEach((r) => r.addEventListener("change", actualizarOpciones));
["#precision", "#velocidad", "#retraso", "#dificultad", "#sonido"].forEach((s) => $(s).addEventListener("input", actualizarOpciones));
$("#btn-conectar").addEventListener("click", conectarRelay);
$("#btn-jugar").addEventListener("click", empezar);
$("#btn-repetir").addEventListener("click", () => { $("#resultados").close(); empezar(); });
$("#btn-menu").addEventListener("click", volverAlMenu);
$("#btn-salir").addEventListener("click", volverAlMenu);
$("#resultados").addEventListener("cancel", (e) => { e.preventDefault(); volverAlMenu(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && partida && !partida.terminada) volverAlMenu(); });
$("#btn-idioma").addEventListener("click", () => { cambiarIdioma(); pintarCanciones(); });

// En la demo https el navegador bloquea ws://127.0.0.1: avisarlo claramente.
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if (location.protocol === "https:" && !LOCAL) $("#aviso-https").classList.remove("oculto");

window.__fnf = {
  geometria: () => lienzo.geometria(reservaPanel()),
  estado: () => partida ? { t: partida.juego.t, ...partida.juego.resumen(), jugador: partida.jugador.nombre, teclas: [...partida.juego.teclas] } : null,
  // true cuando la partida empezó y el jugador ya escucha teclado/pad.
  listo: () => !!partida?.listo,
  ultimo: null,
  // Solo para pruebas automáticas: próximas notas del jugador.
  proximas: () => partida ? partida.juego.jugables.filter((n) => n.estado === "espera").slice(0, 6).map((n) => ({ t: n.t, lane: n.lane, l: n.l })) : [],
};

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !new URLSearchParams(location.search).has("nosw")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

cambiarIdioma(idioma());
aplicarAjustes();
cargarLista().catch((e) => { $("#canciones").textContent = `⚠ ${e.message}`; });
