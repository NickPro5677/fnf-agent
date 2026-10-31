// Textos en español (por defecto) e inglés.
const EN = {
  elige: "1. Pick a song", propia: "Use my own chart and audio",
  "propia-ayuda": "Accepts FNF 0.8+ (v2.0.0), classic FNF and Psych Engine charts. Your files never leave your device.",
  quien: "2. Who plays?", "j-humano": "You", "j-humano-d": "Touch arrows or keyboard (← ↓ ↑ → or WASD)",
  "j-perfecto": "Perfect bot", "j-perfecto-d": "Never misses. Hear how it should sound.",
  "j-humanizado": "Bot with a profile", "j-humanizado-d": "Pro, beginner, nervous, tired… misses like a person.",
  perfil: "Profile", "p-perfecto": "Perfect", "p-pro": "Pro", "p-bueno": "Good", "p-novato": "Beginner", "p-nervioso": "Nervous", "p-cansado": "Tired", "p-personalizado": "Custom",
  semilla: "Seed", "semilla-ayuda": "Empty = different every time. With a number, the bot replays the same game.",
  "pz-sigma": "Spread", "pz-sesgo": "Tendency (− early, + late)", "pz-cansancio": "Fatigue", "pz-presion": "Nerves on a high combo", "pz-salto": "Notes it skips",
  histo: "Timing spread (left = early, right = late)", vs: "You vs Bot",
  "j-remoto": "External AI", "j-remoto-d": "A program (Python, LLM…) connects over WebSocket.",
  precision: "Bot accuracy", "url-relay": "Relay address", conectar: "Connect",
  "relay-ayuda": "In Termux: <code>python agente/relay.py</code> then <code>python agente/agente_chart.py</code>.",
  "aviso-https": "You are on the web demo (https). The browser won't let this page connect to <code>ws://127.0.0.1</code>. To play with an AI, run the game locally: <code>python -m http.server 8000 -d web</code> and open <code>http://127.0.0.1:8000</code>.",
  ajustes: "3. Settings", dificultad: "Difficulty", velocidad: "Note speed", retraso: "Audio delay", sonido: "Music",
  jugar: "▶ Play", pie: "Free project (MIT). Inspired by Friday Night Funkin'; includes no official music, charts or art.",
  heroe: "Rhythm for people and AIs · works offline",
  "menos-efectos": "Fewer effects (for slow phones)", tactil: "Touch controls and screen",
  "pad-modo": "Touch control type", "pad-columnas": "Columns over the arrows", "pad-botones": "Buttons at the bottom",
  downscroll: "Note direction", "ds-auto": "Automatic (downwards on phones)", "ds-si": "Downwards (receptors at the bottom)", "ds-no": "Upwards (receptors at the top)",
  "pad-alto": "Touch zone height", "pad-opacidad": "Column glow", vibrar: "Vibrate on touch", "ver-zonas": "Show touch zones (to check)",
  grafica: "Timing of each note (centre = perfect, up = late, down = early)",
  puntos: "Score", prec: "Accuracy", fallos: "Misses", salir: "✕ Exit", "combo-max": "Max combo", repetir: "↻ Retry", menu: "Menu",
};
const ES_EXTRA = {
  notas: "notas", "tu-cancion": "Tu canción", conectando: "Conectando…", conectado: "✓ Conectado", agentes: "agente(s)",
  desconectado: "Desconectado", "relay-ayuda-corta": "¿Está corriendo agente/relay.py?", "sin-notas": "El chart no tiene notas del jugador",
  error: "Error", victoria: "¡Victoria!", derrota: "Derrota", jugo: "Jugó",
  "d-perfecto": "Nunca falla: todo Sick.", "d-pro": "Casi siempre Sick; muy raro que falle.", "d-bueno": "Juega bien, algún Good y pocos fallos.",
  "d-novato": "Va tarde, se pierde en las ráfagas y falla a menudo.", "d-nervioso": "Se adelanta y empeora cuanto más combo lleva.",
  "d-cansado": "Empieza bien y se cansa hacia el final.", "d-personalizado": "Tú eliges cómo falla.",
  "errores-vivo": "desfase (ms)", media: "media", desv: "desviación", "vs-tu": "Tú (mejor)", "vs-bot": "Bot", "vs-precision": "Precisión",
  "vs-puntos": "Puntos", "vs-fallos": "Fallos", "vs-media": "Desfase medio", "vs-letra": "Nota", "vs-sin-bot": "Prueba un bot en esta canción para compararte.", "semilla-c": "semilla", "vs-nada": "Juega tú esta canción para compararte con el bot.",

};
const EN_EXTRA = {
  notas: "notes", "tu-cancion": "Your song", conectando: "Connecting…", conectado: "✓ Connected", agentes: "agent(s)",
  desconectado: "Disconnected", "relay-ayuda-corta": "Is agente/relay.py running?", "sin-notas": "The chart has no player notes",
  error: "Error", victoria: "Victory!", derrota: "Defeat", jugo: "Played by",
  "d-perfecto": "Never misses: all Sick.", "d-pro": "Almost always Sick; rarely misses.", "d-bueno": "Plays well, a few Goods and few misses.",
  "d-novato": "Late, gets lost in fast streams and misses often.", "d-nervioso": "Rushes and gets worse the higher the combo.",
  "d-cansado": "Starts well and gets tired towards the end.", "d-personalizado": "You choose how it misses.",
  "errores-vivo": "timing (ms)", media: "mean", desv: "spread", "vs-tu": "You (best)", "vs-bot": "Bot", "vs-precision": "Accuracy",
  "vs-puntos": "Score", "vs-fallos": "Misses", "vs-media": "Mean timing", "vs-letra": "Grade", "vs-sin-bot": "Try a bot on this song to compare.", "semilla-c": "seed", "vs-nada": "Play this song yourself to compare with the bot.",

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
