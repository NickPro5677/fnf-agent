// Prueba rápida del servidor MCP (requiere motor arriba).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mcpPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fnf-mcp.js");
const transport = new StdioClientTransport({
  command: "node",
  args: [mcpPath],
  stderr: "pipe",
});
const client = new Client({ name: "fnf-test", version: "3.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const list = await client.callTool({ name: "song.list", arguments: {} });
console.log("list:", list.content[0].text.slice(0, 200));

console.log("start:", JSON.stringify(await client.callTool({
  name: "game.start",
  arguments: { song: "primer-paso", diff: 0, scale: 0.25, sides: "player" },
})));
console.log("status:", (await client.callTool({ name: "game.status", arguments: {} })).content[0].text);
console.log("observe:", (await client.callTool({ name: "observe", arguments: {} })).content[0].text);
console.log("chart:", (await client.callTool({
  name: "song.chart",
  arguments: { song: "primer-paso", diff: 0, side: "player", limit: 3 },
})).content[0].text);
await client.callTool({ name: "input.press", arguments: { key: "left", duration_ms: 100 } });
console.log("press: ok");
await client.callTool({ name: "input.key", arguments: { key: "down", down: true } });
await client.callTool({ name: "input.key", arguments: { key: "down", down: false } });
console.log("key: ok");

await client.close();
process.exit(0);
