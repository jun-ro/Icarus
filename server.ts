import { readFileSync } from "fs";
import { join } from "path";
import os from "os";

const PORT = 8080;
const clients = new Set<ServerWebSocket<unknown>>();

const htmlPath = join(import.meta.dir, "dist", "index.html");
let html: string;
try {
  html = readFileSync(htmlPath, "utf8");
} catch {
  html = "<h1>Run <code>bun run build</code> first to generate dist/index.html</h1>";
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
      return undefined;
    }

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      broadcast({ type: "system", text: `A device joined. (${clients.size} connected)`, count: clients.size });
      console.log(`Client connected. Total: ${clients.size}`);
    },
    message(_ws, raw) {
      const data = typeof raw === "string" ? raw : raw.toString();
      clients.forEach((client) => client.send(data));
    },
    close(ws) {
      clients.delete(ws);
      broadcast({ type: "system", text: `A device left. (${clients.size} connected)`, count: clients.size });
      console.log(`Client disconnected. Total: ${clients.size}`);
    },
  },
});

function broadcast(payload: object) {
  const msg = JSON.stringify(payload);
  clients.forEach((client) => client.send(msg));
}

const ifaces = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

console.log(`\nIcarus WS server on port ${PORT}`);
console.log(`Open on any device on the same network:`);
ifaces.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
console.log(`\nWebSocket endpoint:`);
ifaces.forEach((ip) => console.log(`  ws://${ip}:${PORT}/ws`));
console.log();
