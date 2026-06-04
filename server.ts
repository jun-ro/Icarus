const PORT = 8080;
const clients = new Set<ServerWebSocket<unknown>>();

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
      return undefined;
    }

    return new Response("Icarus WebSocket Server running. Connect via ws://<your-ip>:8080/ws", {
      headers: { "Content-Type": "text/plain" },
    });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      broadcast({ type: "system", text: `A device joined. (${clients.size} connected)`, count: clients.size });
      console.log(`Client connected. Total: ${clients.size}`);
    },
    message(ws, raw) {
      const data = typeof raw === "string" ? raw : raw.toString();
      // relay to all clients including sender
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

const ifaces = require("os").networkInterfaces();
const ips = Object.values(ifaces)
  .flat()
  .filter((i: any) => i.family === "IPv4" && !i.internal)
  .map((i: any) => i.address);

console.log(`\nIcarus WS server on port ${PORT}`);
console.log(`Local network addresses:`);
ips.forEach((ip: string) => console.log(`  ws://${ip}:${PORT}/ws`));
console.log(`\nOpen the app on any device on the same network and paste one of the addresses above.\n`);
