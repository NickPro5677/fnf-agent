// Pantallas y bucle del juego. Une motor + jugadores + dibujo + música.
import { leerChart } from "./motor/chart.js";
import { Juego } from "./motor/juego.js";
import { NOMBRES_CARRIL } from "./motor/constantes.js";
import { JugadorHumano } from "./jugadores/humano.js";
import { JugadorBot } from "./jugadores/bot.js";
import { estadisticas, histograma, guardarMejor, leerMejor, guardarBot, leerBot } from "./vista/estadisticas.js";
import { JugadorRemoto } from "./jugadores/remoto.js";
import { Lienzo, COLORES } from "./vista/lienzo.js";
import { carrilMasCercano, carrilPorFranja } from "./jugadores/tactil.js";
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
// Teléfono o tableta: pantalla táctil o estrecha.
const esTactil = () => matchMedia("(pointer: coarse), (max-width: 700px)").matches;
let verZonas = false;

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
    perfil: $("#perfil").value, semilla: $("#semilla").value, personalizado: leerPersonalizado(), velocidad: +$("#velocidad").value, retraso: +$("#retraso").value,
    sonido: $("#sonido").checked, url: $("#url-relay").value,
    padModo: $("#pad-modo").value, downscroll: $("#downscroll").value, padAlto: +$("#pad-alto").value,
    padOpacidad: +$("#pad-opacidad").value, vibrar: $("#vibrar").checked, menosEfectos: $("#menos-efectos").checked,
  });
  localStorage.setItem("fnf-ajustes", JSON.stringify(ajustes));
}

const PZ = { sigma: [1, "ms"], sesgo: [1, "ms"], cansancio: [0.1, ""], presion: [0.1, ""], salto: [0.001, "%"] };
function leerPersonalizado() {
  const o = {};
  for (const [k, [f]] of Object.entries(PZ)) o[k] = +$("#pz-" + k).value * f;
  return o;
}

const tipoJugador = () => document.querySelector("input[name=jugador]:checked").value;

function actualizarOpciones() {
  const t = tipoJugador();
  $("#op-humanizado").classList.toggle("oculto", t !== "humanizado");
  $("#op-remoto").classList.toggle("oculto", t !== "remoto");
  $("#op-personalizado").classList.toggle("oculto", $("#perfil").value !== "personalizado");
  $("#perfil-desc").textContent = traducir("d-" + $("#perfil").value);
  $("#semilla").value = $("#semilla").value.replace(/\D/g, "");
  for (const [k, [f, u]] of Object.entries(PZ)) {
    const v = +$("#pz-" + k).value * f;
    $(`#pz-${k}-val`).textContent = u === "%" ? `${(v * 100).toFixed(1)} %` : u ? `${Math.round(v)} ${u}` : v.toFixed(1);
  }
  $("#velocidad-val").textContent = `${(+$("#velocidad").value).toFixed(1)}×`;
  $("#retraso-val").textContent = `${$("#retraso").value} ms`;
  $("#pad-alto-val").textContent = `${$("#pad-alto").value} %`;
  $("#pad-opacidad-val").textContent = `${$("#pad-opacidad").value} %`;
  verZonas = $("#ver-zonas").checked;
  document.body.classList.toggle("menos-efectos", $("#menos-efectos").checked);
  guardar();
}

function aplicarAjustes() {
  if (ajustes.jugador) { const r = document.querySelector(`input[name=jugador][value=${ajustes.jugador}]`); if (r) r.checked = true; }
  if (ajustes.dificultad) $("#dificultad").value = ajustes.dificultad;
  if (ajustes.perfil) $("#perfil").value = ajustes.perfil;
  if (ajustes.semilla) $("#semilla").value = ajustes.semilla;
  if (ajustes.personalizado) for (const [k, [f]] of Object.entries(PZ)) if (ajustes.personalizado[k] != null) $("#pz-" + k).value = Math.round(ajustes.personalizado[k] / f);
  for (const k of ["velocidad", "retraso"]) if (ajustes[k] != null) $("#" + k).value = ajustes[k];
  if (ajustes.padModo) $("#pad-modo").value = ajustes.padModo;
  if (ajustes.downscroll) $("#downscroll").value = ajustes.downscroll;
  if (ajustes.padAlto != null) $("#pad-alto").value = ajustes.padAlto;
  if (ajustes.padOpacidad != null) $("#pad-opacidad").value = ajustes.padOpacidad;
  if (ajustes.vibrar != null) $("#vibrar").checked = ajustes.vibrar;
  if (ajustes.menosEfectos != null) $("#menos-efectos").checked = ajustes.menosEfectos;
  else if (matchMedia("(prefers-reduced-motion: reduce)").matches) $("#menos-efectos").checked = true;
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
  if (t === "humanizado") {
    const semilla = $("#semilla").value ? +$("#semilla").value : (Date.now() % 1e6) + 1;
    const perfil = $("#perfil").value;
    const j = new JugadorBot({ perfil, semilla, ajustes: perfil === "personalizado" ? leerPersonalizado() : {} });
    j.nombre = `${j.nombre.replace(/^Bot \S+/, "Bot " + $("#perfil").selectedOptions[0].textContent.trim())} · ${traducir("semilla-c")} ${semilla}`;
    return j;
  }
  if (t === "remoto") {
    if (!remoto && !(await conectarRelay())) return null;
    return remoto;
  }
  const columnas = $("#pad-modo").value !== "botones";
  return new JugadorHumano({
    zonas: [columnas ? $("#zona-tactil") : $("#pad")],
    carrilEn: (el, e) => {
      const r = el.getBoundingClientRect();
      if (!columnas) return carrilPorFranja(e.clientX - r.left, r.width);
      const lr = $("#lienzo").getBoundingClientRect();
      return carrilMasCercano(e.clientX - lr.left, lienzo.geometria(reservaPanel()).jugador);
    },
    vibrar: () => $("#vibrar").checked,
    alCambiar: (cuenta) => {
      if (partida) partida.pulsadas = [...cuenta];
      if (!columnas) $("#pad").querySelectorAll(".tecla").forEach((b, i) => b.classList.toggle("activo", cuenta[i] > 0));
    },
  });
}

// Modo de pantalla de la partida: pad táctil, downscroll y alto de la zona.
function modoPantalla(jugador) {
  const tactil = esTactil() && jugador.tipo === "humano";
  const ds = $("#downscroll").value;
  const columnas = $("#pad-modo").value !== "botones";
  return {
    tactil, columnas,
    downscroll: ds === "si" || (ds === "auto" && esTactil()),
    soloJugador: tactil,
    alto: +$("#pad-alto").value / 100,
  };
}

function zonaPx() {
  if (!partida?.modo.tactil || !partida.modo.columnas) return 0;
  return Math.round($("#lienzo").getBoundingClientRect().height * partida.modo.alto);
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
    const modo = modoPantalla(jugador);
    mostrarPantalla("#juego");
    document.body.classList.add("en-juego");
    document.body.classList.toggle("sin-pad", !modo.tactil || modo.columnas);
    $("#zona-tactil").classList.toggle("oculto", !(modo.tactil && modo.columnas));
    $("#zona-tactil").style.height = `${modo.alto * 100}%`;
    $("#pad").style.setProperty("--opacidad", String(0.25 + 0.75 * (+$("#pad-opacidad").value / 100)));
    $("#resultados").open && $("#resultados").close();
    partida = { juego, jugador, chart, id, info, velocidad, inicio: performance.now() + cuenta, retraso, ultimaDecision: [], modo, tiempos: [], pulsadas: [0, 0, 0, 0] };
    const ahora = () => performance.now() - partida.inicio - partida.retraso;
    const manejar = (ev) => {
      if (!ev) return;
      jugador.evento?.(ev);
      if (ev.tipo === "juicio") {
        partida.tiempos.push({ t: juego.t, d: ev.desfase ?? null, j: ev.juicio });
        lienzo.efecto({ tipo: "popup", texto: TEXTO_JUICIO[ev.juicio], color: COLOR_JUICIO[ev.juicio], combo: juego.combo });
        if (ev.juicio !== "miss") lienzo.efecto({ tipo: "destello", lane: ev.lane, fuerza: ev.juicio === "sick" ? 1.4 : 1 });
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
    lienzo.etiquetaErrores = traducir("errores-vivo");
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
  lienzo.dibujar(juego, t, { velocidad: partida.velocidad, bpm: partida.chart.bpm, color: partida.info.color || "#7c5cff", mostrarIA: jugador.tipo !== "humano", reserva: reservaPanel(),
    soloJugador: partida.modo.soloJugador, downscroll: partida.modo.downscroll, zona: zonaPx(), verZonas,
    menosEfectos: $("#menos-efectos").checked, pulsadas: partida.pulsadas, opacidad: +$("#pad-opacidad").value / 100,
    marcas: jugador.marcas?.(), errores: jugador.tipo === "bot" ? partida.tiempos : null });
  contarCuadro();
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
    pintarDonut(r.juicios);
    pintarGrafica(partida.tiempos, partida.juego.notas.at(-1)?.t || 1);
    pintarHistograma(partida.tiempos);
    compararConBot(r);
    $("#res-quien").textContent = `${traducir("jugo")}: ${quien} · ${partida.chart.titulo} (${partida.chart.dificultad})`;
    $("#resultados").showModal();
  }
  window.__fnf.ultimo = { ...r, jugador: quien, cancion: partida.id };
  if (!mostrar) partida = null;
  else partida.terminada = true;
}

// Anillo con el reparto de juicios.
function pintarDonut(j) {
  const total = j.sick + j.good + j.bad + j.miss || 1;
  const col = { sick: "#6ef3ff", good: "#3ef08a", bad: "#ffd84f", miss: "#ff7b93" };
  let acum = 0, html = '<circle cx="21" cy="21" r="15.9" fill="none" stroke="#ffffff14" stroke-width="5"/>';
  for (const k of ["sick", "good", "bad", "miss"]) {
    const p = (j[k] / total) * 100;
    if (p > 0) html += `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${col[k]}" stroke-width="5" stroke-dasharray="${p.toFixed(2)} ${(100 - p).toFixed(2)}" stroke-dashoffset="${(25 - acum).toFixed(2)}"/>`;
    acum += p;
  }
  $("#res-donut").innerHTML = html;
  $("#res-donut").setAttribute("aria-label", `Sick ${j.sick}, Good ${j.good}, Bad ${j.bad}, Miss ${j.miss}`);
}

// Dispersión del desfase de cada nota a lo largo de la canción.
function pintarGrafica(tiempos, dur) {
  const col = { sick: "#6ef3ff", good: "#3ef08a", bad: "#ffd84f", miss: "#ff7b93" };
  const y = (d) => 45 - Math.max(-180, Math.min(180, d)) / 4;
  let html = `<rect width="300" height="90" fill="#0b0820"/>`;
  for (const [d, c] of [[45, "#6ef3ff22"], [90, "#3ef08a18"], [135, "#ffd84f14"]]) html += `<rect x="0" y="${y(d)}" width="300" height="${(d * 2) / 4}" fill="${c}"/>`;
  html += `<line x1="0" y1="45" x2="300" y2="45" stroke="#ffffff55" stroke-width=".6"/>`;
  for (const p of tiempos) {
    const x = Math.max(1, Math.min(299, (p.t / dur) * 300));
    if (p.j === "miss") html += `<rect x="${x - 0.6}" y="0" width="1.2" height="90" fill="#ff7b9366"/>`;
    else html += `<circle cx="${x.toFixed(1)}" cy="${y(p.d ?? 0).toFixed(1)}" r="1.6" fill="${col[p.j]}"/>`;
  }
  $("#res-grafica").innerHTML = html;
}

// Histograma del desfase de los toques.
function pintarHistograma(tiempos) {
  const { cubetas, ancho } = histograma(tiempos);
  const max = Math.max(1, ...cubetas);
  const w = 300 / cubetas.length;
  let html = `<rect width="300" height="90" fill="#0b0820"/><line x1="150" y1="0" x2="150" y2="90" stroke="#ffffff55" stroke-width=".6"/>`;
  cubetas.forEach((n, i) => {
    const c = Math.abs(-180 + (i + 0.5) * ancho);
    const col = c <= 45 ? "#6ef3ff" : c <= 90 ? "#3ef08a" : c <= 135 ? "#ffd84f" : "#ff7b93";
    const h = (n / max) * 84;
    if (n) html += `<rect x="${(i * w + 0.6).toFixed(1)}" y="${(88 - h).toFixed(1)}" width="${(w - 1.2).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${col}"/>`;
  });
  $("#res-histo").innerHTML = html;
  const e = estadisticas(tiempos);
  $("#res-histo-stats").textContent = e.n ? `· ${traducir("media")} ${e.media > 0 ? "+" : ""}${e.media.toFixed(1)} ms · ${traducir("desv")} ${e.desv.toFixed(1)} ms` : "";
}

// Tú vs Bot: tus mejores partidas quedan en este dispositivo (localStorage).
function compararConBot(r) {
  const { id, chart, jugador, tiempos } = partida;
  const clave = `${id}|${chart.dificultad}`;
  const fila = { precision: r.precision, puntos: r.puntos, fallos: r.juicios.miss, media: estadisticas(tiempos).media, letra: r.letra, nombre: jugador.nombre };
  let tu, bot;
  if (jugador.tipo === "humano") { guardarMejor(clave, fila); tu = leerMejor(clave); bot = leerBot(clave); }
  else if (jugador.tipo === "bot") { guardarBot(clave, fila); tu = leerMejor(clave); bot = fila; }
  else { $("#res-vs").classList.add("oculto"); return; }
  $("#res-vs").classList.remove("oculto");
  $("#vs-a").textContent = traducir("vs-tu");
  $("#vs-b").textContent = bot?.nombre || traducir("vs-bot");
  const f = (v, k) => v == null ? "—" : k === "precision" ? `${(v * 100).toFixed(2)} %` : k === "media" ? `${v > 0 ? "+" : ""}${v.toFixed(1)} ms` : k === "puntos" ? v.toLocaleString(idioma()) : String(v);
  if (!tu || !bot) {
    $("#vs-filas").innerHTML = `<tr><td colspan="3">${traducir(tu ? "vs-sin-bot" : "vs-nada")}</td></tr>`;
    return;
  }
  const mejor = { precision: 1, puntos: 1, fallos: -1 };
  $("#vs-filas").innerHTML = ["letra", "precision", "puntos", "fallos", "media"].map((k) => {
    const s = mejor[k] ? Math.sign((tu[k] - bot[k]) * mejor[k]) : 0;
    return `<tr><th scope="row">${traducir("vs-" + k)}</th><td${s > 0 ? ' class="gana"' : ""}>${f(tu[k], k)}</td><td${s < 0 ? ' class="gana"' : ""}>${f(bot[k], k)}</td></tr>`;
  }).join("");
}

// Transición entre pantallas.
function mostrarPantalla(sel) {
  for (const s of ["#menu", "#juego"]) $(s).classList.toggle("oculto", s !== sel);
  const el = $(sel);
  el.classList.remove("entrar"); void el.offsetWidth; el.classList.add("entrar");
}

// fps medidos (para las pruebas y para el modo "menos efectos").
const fps = { cuadros: [], ultimo: 0 };
function contarCuadro() {
  const t = performance.now();
  if (fps.ultimo) fps.cuadros.push(t - fps.ultimo);
  if (fps.cuadros.length > 600) fps.cuadros.shift();
  fps.ultimo = t;
}

function volverAlMenu() {
  if (partida && !partida.terminada) terminar(false);
  partida = null;
  $("#resultados").open && $("#resultados").close();
  document.body.classList.remove("en-juego");
  mostrarPantalla("#menu");
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
["#perfil", "#semilla", "#pz-sigma", "#pz-sesgo", "#pz-cansancio", "#pz-presion", "#pz-salto", "#velocidad", "#retraso", "#dificultad", "#sonido", "#pad-modo", "#downscroll", "#pad-alto", "#pad-opacidad", "#vibrar", "#ver-zonas", "#menos-efectos"].forEach((s) => $(s).addEventListener("input", actualizarOpciones));
$("#btn-conectar").addEventListener("click", conectarRelay);
$("#btn-jugar").addEventListener("click", empezar);
$("#btn-repetir").addEventListener("click", () => { $("#resultados").close(); empezar(); });
$("#btn-menu").addEventListener("click", volverAlMenu);
$("#btn-salir").addEventListener("click", volverAlMenu);
$("#resultados").addEventListener("cancel", (e) => { e.preventDefault(); volverAlMenu(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && partida && !partida.terminada) volverAlMenu(); });
$("#btn-idioma").addEventListener("click", () => { cambiarIdioma(); pintarCanciones(); actualizarOpciones(); });

// En la demo https el navegador bloquea ws://127.0.0.1: avisarlo claramente.
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if (location.protocol === "https:" && !LOCAL) $("#aviso-https").classList.remove("oculto");

window.__fnf = {
  marcas: () => partida?.jugador?.marcas?.() ?? null,
  geometria: () => lienzo.geometria(reservaPanel()),
  estado: () => partida ? { t: partida.juego.t, ...partida.juego.resumen(), jugador: partida.jugador.nombre, teclas: [...partida.juego.teclas] } : null,
  // true cuando la partida empezó y el jugador ya escucha teclado/pad.
  listo: () => !!partida?.listo,
  ultimo: null,
  // Pad táctil: rectángulo de la zona activa y modo de pantalla.
  zona: () => {
    const el = partida?.modo.columnas ? $("#zona-tactil") : $("#pad");
    if (!partida?.modo.tactil || !el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, modo: partida.modo.columnas ? "columnas" : "botones", downscroll: partida.modo.downscroll, lienzo: $("#lienzo").getBoundingClientRect().toJSON() };
  },
  verZonas: (v) => { verZonas = v; },
  fps: (reiniciar) => {
    if (reiniciar) { fps.cuadros = []; fps.ultimo = 0; return null; }
    const c = [...fps.cuadros].sort((a, b) => a - b);
    if (!c.length) return null;
    const media = c.reduce((a, b) => a + b, 0) / c.length;
    return { fps: +(1000 / media).toFixed(1), p95ms: +c[Math.floor(c.length * 0.95)].toFixed(1), cuadros: c.length, lentos: c.filter((x) => x > 25).length };
  },
  // Solo para pruebas automáticas: próximas notas del jugador.
  proximas: () => partida ? partida.juego.jugables.filter((n) => n.estado === "espera").slice(0, 6).map((n) => ({ t: n.t, lane: n.lane, l: n.l })) : [],
};

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !new URLSearchParams(location.search).has("nosw")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

cambiarIdioma(idioma());
aplicarAjustes();
cargarLista().catch((e) => { $("#canciones").textContent = `⚠ ${e.message}`; });
