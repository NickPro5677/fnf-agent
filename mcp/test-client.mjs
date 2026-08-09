// Prueba rápida del servidor MCP usando el SDK cliente oficial.
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
const client = new Client({ name: "fnf-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

console.log("start:", JSON.stringify(await client.callTool({ name: "game.start", arguments: { song: "tutorial", diff: 0, scale: 0.25 } })));
console.log("status:", JSON.stringify((await client.callTool({ name: "game.status", arguments: {} })).content[0].text));
console.log("observe:", JSON.stringify((await client.callTool({ name: "observe", arguments: {} })).content[0].text));
console.log("chart:", JSON.stringify((await client.callTool({ name: "song.chart", arguments: { song: "tutorial", diff: 0, limit: 5 } })).content[0].text));
await client.callTool({ name: "input.press", arguments: { key: "left", duration_ms: 100 } });
console.log("press: ok");

await client.close();
process.exit(0);