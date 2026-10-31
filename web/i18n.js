// Textos en español (por defecto) e inglés.
const EN = {
  elige: "1. Pick a song", propia: "Use my own chart and audio",
  "propia-ayuda": "Accepts FNF 0.8+ (v2.0.0), classic FNF and Psych Engine charts. Your files never leave your device.",
  quien: "2. Who plays?", "j-humano": "You", "j-humano-d": "Touch arrows or keyboard (← ↓ ↑ → or WASD)",
  "j-perfecto": "Perfect bot", "j-perfecto-d": "Never misses. Hear how it should sound.",
  "j-humanizado": "Human-like bot", "j-humanizado-d": "Makes mistakes based on the accuracy you choose.",
  "j-remoto": "External AI", "j-remoto-d": "A program (Python, LLM…) connects over WebSocket.",
  precision: "Bot accuracy", "url-relay": "Relay address", conectar: "Connect",
  "relay-ayuda": "In Termux: <code>python agente/relay.py</code> then <code>python agente/agente_chart.py</code>.",
  "aviso-https": "You are on the web demo (https). The browser won't let this page connect to <code>ws://127.0.0.1</code>. To play with an AI, run the game locally: <code>python -m http.server 8000 -d web</code> and open <code>http://127.0.0.1:8000</code>.",
  ajustes: "3. Settings", dificultad: "Difficulty", velocidad: "Note speed", retraso: "Audio delay", sonido: "Music",
  jugar: "▶ Play", pie: "Free project (MIT). Inspired by Friday Night Funkin'; includes no official music, charts or art.",
  puntos: "Score", prec: "Accuracy", fallos: "Misses", salir: "✕ Exit", "combo-max": "Max combo", repetir: "↻ Retry", menu: "Menu",
};
const ES_EXTRA = {
  notas: "notas", "tu-cancion": "Tu canción", conectando: "Conectando…", conectado: "✓ Conectado", agentes: "agente(s)",
  desconectado: "Desconectado", "relay-ayuda-corta": "¿Está corriendo agente/relay.py?", "sin-notas": "El chart no tiene notas del jugador",
  error: "Error", victoria: "¡Victoria!", derrota: "Derrota", jugo: "Jugó",
};
const EN_EXTRA = {
  notas: "notes", "tu-cancion": "Your song", conectando: "Connecting…", conectado: "✓ Connected", agentes: "agent(s)",
  desconectado: "Disconnected", "relay-ayuda-corta": "Is agente/relay.py running?", "sin-notas": "The chart has no player notes",
  error: "Error", victoria: "Victory!", derrota: "Defeat", jugo: "Played by",
};

let actual = localStorage.getItem("fnf-idioma") || (navigator.language?.startsWith("es") ? "es" : "es");
const originales = new Map();

export const idioma = () => actual;
export function traducir(k) { return (actual === "en" ? EN_EXTRA : ES_EXTRA)[k] ?? k; }

export function cambiarIdioma(nuevo) {
  actual = nuevo || (actual === "es" ? "en" : "es");
  localStorage.setItem("fnf-idioma", actual);
  document.documentElement.lang = actual;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (!originales.has(el)) originales.set(el, el.innerHTML);
    const k = el.dataset.i18n;
    el.innerHTML = actual === "en" && EN[k] ? EN[k] : originales.get(el);
  });
  const b = document.querySelector("#btn-idioma");
  if (b) b.lang = actual === "es" ? "en" : "es";
  if (b) b.innerHTML = actual === "es" ? 'EN <span class="sr">(English)</span>' : 'ES <span class="sr">(español)</span>';
  const dif = document.querySelector("#dificultad");
  if (dif) [...dif.options].forEach((o, i) => { o.textContent = (actual === "en" ? ["Easy", "Normal", "Hard"] : ["Fácil", "Normal", "Difícil"])[i]; });
}
