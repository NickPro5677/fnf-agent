import test from "node:test";
import assert from "node:assert/strict";
import { camposDesdeQuery, partirUrl, unirUrl } from "../../web/vista/ajustes-ia.js";

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
