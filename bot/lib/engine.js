// Cliente UNIX JSON del motor FNF. Compartido por agentes y MCP.
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.FNF_ROOT || path.resolve(__dirname, "../..");
export const SOCKET = process.env.FNF_SOCK || path.join(ROOT, "env", "run", "engine.sock");

export function engineCall(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET);
    let buf = "";
    const to = setTimeout(() => {
      sock.destroy();
      reject(new Error(`engine timeout (${payload.cmd})`));
    }, timeoutMs);
    sock.on("connect", () => sock.write(JSON.stringify(payload) + "\n"));
    sock.on("data", (d) => {
      buf += d.toString();
      if (buf.includes("\n")) {
        clearTimeout(to);
        sock.end();
        const line = buf.split("\n")[0];
        try {
          resolve(JSON.parse(line || "{}"));
        } catch (e) {
          reject(new Error(`engine JSON: ${e.message}`));
        }
      }
    });
    sock.on("error", (e) => {
      clearTimeout(to);
      reject(new Error(`engine socket: ${e.message}`));
    });
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
