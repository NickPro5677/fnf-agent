import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarDesdeUrl, camposDesdeQuery, cargarActual, guardarActual, guardarAlConectar, leerCampos, partirUrl, unirUrl,
} from "../../web/vista/ajustes-ia.js";

test("camposDesdeQuery: params de la cápsula", () => {
  const c = camposDesdeQuery("fnf_token=abcd-efgh-ijkl&fnf_port=8765&fnf_host=ws%3A%2F%2F127.0.0.1");
  assert.equal(c.token, "abcd-efgh-ijkl");
  assert.equal(c.puerto, "8765");
  assert.equal(c.host, "ws://127.0.0.1");
});

test("camposDesdeQuery: legado relay= y sin params", () => {
  assert.deepEqual(camposDesdeQuery("relay=ws://127.0.0.1:9001"), { host: "ws://127.0.0.1", puerto: "9001" });
  assert.equal(camposDesdeQuery(""), null);
  assert.equal(camposDesdeQuery("jugador=remoto"), null);
});

test("partirUrl / unirUrl redondos", () => {
  assert.deepEqual(partirUrl("ws://127.0.0.1:8765"), { host: "ws://127.0.0.1", puerto: "8765" });
  assert.equal(unirUrl("ws://127.0.0.1", "8765"), "ws://127.0.0.1:8765");
});

const CLAVE = "fnf-ia";
const PUBLICO = "nickpro5677.github.io";
const MIO = {
  host: "ws://mi-relay.local", puerto: "8765", token: "token-mio",
  modo: "v2", hz: 30, lookahead: 1500, compensacion: { tipo: "auto", ms: 0 },
};

function campo(valor = "") {
  return { value: String(valor), disabled: false, checked: false, textContent: "", type: "text", classList: { toggle() {} } };
}

function instalar() {
  const ids = {
    "url-relay": campo("ws://127.0.0.1"), "puerto-relay": campo("8765"), "token-relay": campo(""),
    "modo-ia": campo("v2"), "hz-ia": campo("30"), "lookahead-ia": campo("1500"),
    "comp-ia": campo("auto"), "comp-ms": campo("0"), "token-ver": campo(""),
    "hz-ia-val": campo(""), "lookahead-ia-val": campo(""), "comp-ms-val": campo(""), "campo-comp-ms": campo(""),
  };
  globalThis.document = {
    querySelector: (sel) => {
      const id = String(sel).replace(/^#/, "");
      if (!ids[id]) throw new Error(`falta ${sel}`);
      return ids[id];
    },
  };
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
}

function sembrar() {
  localStorage.setItem(CLAVE, JSON.stringify(MIO));
  cargarActual();
}

function foto() {
  const c = leerCampos();
  return { storage: localStorage.getItem(CLAVE), host: c.host, puerto: c.puerto, token: c.token };
}

test.beforeEach(() => {
  instalar();
  aplicarDesdeUrl("");
});

test("URL sin params no cambia el formulario ni localStorage", () => {
  sembrar();
  document.querySelector("#url-relay").value = "ws://en-pantalla";
  const antes = foto();
  for (const origen of [PUBLICO, "127.0.0.1", "localhost"]) {
    assert.deepEqual(aplicarDesdeUrl("", origen), { aplicado: false, persistido: false });
    assert.deepEqual(aplicarDesdeUrl("?jugador=remoto&nosw=1", origen), { aplicado: false, persistido: false });
    assert.deepEqual(foto(), antes);
  }
});

test("?relay= y fnf_* en un origen público rellenan la visita y no se guardan", () => {
  sembrar();
  const disco = localStorage.getItem(CLAVE);
  let r = aplicarDesdeUrl("?relay=ws://otro.example:9999", PUBLICO);
  assert.deepEqual(r, { aplicado: true, persistido: false });
  assert.equal(leerCampos().host, "ws://otro.example");
  assert.equal(leerCampos().puerto, "9999");
  assert.equal(leerCampos().token, "token-mio");
  assert.equal(guardarAlConectar(), false);
  assert.equal(localStorage.getItem(CLAVE), disco);

  sembrar();
  const discoFnf = localStorage.getItem(CLAVE);
  r = aplicarDesdeUrl("?fnf_token=token-ajeno&fnf_port=443&fnf_host=wss%3A%2F%2Fevil.example", "example.com");
  assert.deepEqual(r, { aplicado: true, persistido: false });
  assert.equal(leerCampos().token, "token-ajeno");
  assert.equal(leerCampos().host, "wss://evil.example");
  assert.equal(leerCampos().puerto, "443");
  assert.equal(guardarAlConectar(), false);
  assert.equal(localStorage.getItem(CLAVE), discoFnf);

  sembrar();
  const discoFalso = localStorage.getItem(CLAVE);
  aplicarDesdeUrl("?fnf_token=token-ajeno&fnf_host=wss://evil.example&fnf_port=443", "127.0.0.1.evil.example");
  assert.equal(guardarAlConectar(), false);
  assert.equal(localStorage.getItem(CLAVE), discoFalso);
});

test("en 127.0.0.1 la cápsula guarda host, puerto y token", () => {
  for (const origen of ["127.0.0.1", "localhost", "[::1]"]) {
    instalar();
    const q = new URLSearchParams("fnf_token=abcd-efgh-ijkl&fnf_port=8765&fnf_host=ws://127.0.0.1&jugador=remoto");
    assert.deepEqual(aplicarDesdeUrl(q, origen), { aplicado: true, persistido: true });
    const c = leerCampos();
    assert.equal(c.token, "abcd-efgh-ijkl");
    assert.equal(c.host, "ws://127.0.0.1");
    assert.equal(c.puerto, "8765");
    assert.equal(unirUrl(c.host, c.puerto), "ws://127.0.0.1:8765");
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    assert.equal(guardado.token, c.token);
    assert.equal(guardado.host, c.host);
    assert.equal(guardado.puerto, c.puerto);
    document.querySelector("#token-relay").value = "";
    document.querySelector("#url-relay").value = "";
    cargarActual();
    assert.equal(leerCampos().token, "abcd-efgh-ijkl");
    assert.equal(leerCampos().host, "ws://127.0.0.1");
    assert.equal(guardarAlConectar(), true);
  }
});

test("guardar a mano sí persiste", () => {
  const r = aplicarDesdeUrl("?fnf_token=solo-visita&fnf_port=443&fnf_host=wss://example.com", PUBLICO);
  assert.equal(r.persistido, false);
  assert.equal(localStorage.getItem(CLAVE), null);
  assert.equal(leerCampos().token, "solo-visita");
  guardarActual();
  let guardado = JSON.parse(localStorage.getItem(CLAVE));
  assert.equal(guardado.token, "solo-visita");
  assert.equal(guardado.host, "wss://example.com");
  assert.equal(guardado.puerto, "443");
  assert.equal(guardarAlConectar(), true);

  document.querySelector("#token-relay").value = "escrito-a-mano";
  guardarActual();
  guardado = JSON.parse(localStorage.getItem(CLAVE));
  assert.equal(guardado.token, "escrito-a-mano");
});

test("el token de la URL no se escribe en la consola", () => {
  const token = "token-que-no-debe-verse";
  const vistos = [];
  const metodos = ["log", "info", "debug", "warn", "error"];
  const previo = {};
  for (const m of metodos) {
    previo[m] = console[m];
    console[m] = (...args) => { vistos.push(args.map((a) => String(a)).join(" ")); };
  }
  try {
    aplicarDesdeUrl(`?fnf_token=${token}&fnf_port=8765&fnf_host=ws%3A%2F%2F127.0.0.1`, PUBLICO);
    aplicarDesdeUrl(`?fnf_token=${token}&fnf_port=8765&fnf_host=ws%3A%2F%2F127.0.0.1`, "127.0.0.1");
    guardarActual();
    guardarAlConectar();
  } finally {
    Object.assign(console, previo);
  }
  assert.ok(!vistos.some((linea) => linea.includes(token)), "el token no debe salir en consola");
});
