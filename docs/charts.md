# Charts propios

En el menú: **Tu chart** → elige un `.json` y (opcional) un audio `.ogg`/`.mp3`. Sin audio, el juego genera una base rítmica.

Formatos que entiende (`web/motor/chart.js`):

- **FNF clásico / Psych Engine:** `{"song": {"bpm", "speed", "notes": [{"mustHitSection", "sectionNotes": [[t, dir, largo]]}]}}`.
  Las direcciones 0–3 son del lado que marca `mustHitSection`; 4–7 del otro lado. Tú juegas las notas del jugador.
- **v2 (FNF 0.8+):** `{"version":"2.0.0","bpm":120,"scrollSpeed":1.2,"notes":{"easy":[…],"normal":[{"t":1000,"d":0,"l":0}],"hard":[…]}}`.
  `d` 0–3 = jugador, 4–7 = rival. Así son las canciones de `web/canciones/`.

Tiempos en ms. Las canciones de demo se generan con `npm run canciones` (`tools/generar_canciones.mjs`).
No subas charts ni audio con derechos de autor al repositorio.
