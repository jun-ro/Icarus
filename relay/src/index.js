export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, message) {
    for (const peer of this.state.getWebSockets()) {
      if (peer !== ws) {
        try { peer.send(message); } catch {}
      }
    }
  }

  webSocketClose() {}
  webSocketError() {}
}

export default {
  async fetch(request, env) {
    const code = new URL(request.url).pathname.replace(/^\//, "").slice(0, 32);
    if (!code) return new Response("Room code required", { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
