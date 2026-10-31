// Constantes del juego. Son las mismas del motor Python 3.0 (legacy/env/fnf_engine.py).
// Un test compara estos números con el archivo de Python para que nunca se separen.
export const VENTANAS = Object.freeze({ sick: 45, good: 90, bad: 135, miss: 180 });
export const PUNTOS = Object.freeze({ sick: 350, good: 200, bad: 100, sustain: 50 });
export const VIDA = Object.freeze({ sick: 0.023, good: 0.016, bad: 0.008, miss: 0.047, holdRoto: 0.055 });
export const COMBO_EXTRA = Object.freeze({ sick: 10, good: 10, bad: 5 });
export const CARRILES = Object.freeze(["left", "down", "up", "right"]);
export const NOMBRES_CARRIL = Object.freeze(["izquierda", "abajo", "arriba", "derecha"]);
// Margen para soltar una nota larga un poquito antes del final sin fallar (las personas sueltan antes).
export const MARGEN_SOLTAR_HOLD = 90;
// Tiempo extra después de la última nota antes de mostrar resultados.
export const COLA_FINAL = 1500;
