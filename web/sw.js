// Guarda todo para que el juego funcione sin internet.
const CACHE = "fnf-agent-v4.1.0-1"; // cambia el sufijo para que los teléfonos reciban los cambios
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "app.js", "i18n.js", "manifest.webmanifest", "icono.svg",
  "motor/constantes.js", "motor/chart.js", "motor/juego.js", "motor/protocolo.js",
  "jugadores/humano.js", "jugadores/tactil.js", "jugadores/bot.js", "jugadores/remoto.js",
  "vista/lienzo.js", "vista/estadisticas.js", "vista/ajustes-ia.js", "audio/musica.js", "fuentes/fredoka.woff2", "fuentes/nunito.woff2",
  "canciones/lista.json", "canciones/primer-paso.json", "canciones/luz-de-neon.json", "canciones/turbo-cuantico.json",
];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
