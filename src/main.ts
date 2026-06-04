import "./style.css";

const app = document.getElementById("app")!;

const isHttps = location.protocol === "https:";

app.innerHTML = `
  <div class="container">
    <header>
      <h1>Icarus</h1>
      <p class="subtitle">WebSocket local network demo</p>
    </header>

    ${isHttps ? `
    <div class="https-banner">
      <div class="https-banner-title">⚠ HTTPS blocks local WebSocket</div>
      <p>Browsers block <code>ws://</code> from HTTPS pages. To use the demo, open it directly from the server:</p>
      <div class="input-row" style="margin-top:0.6rem">
        <input id="ipInput" type="text" placeholder="192.168.x.x" style="font-size:0.9rem" />
        <button id="goBtn">Open</button>
      </div>
      <p class="hint" style="margin-top:0.5rem">Run <code>bun run server</code> on the host — it prints the IP. Enter it above to open <code>http://[ip]:8080</code>.</p>
    </div>
    ` : ""}

    <div class="connect-panel" id="connectPanel" ${isHttps ? 'style="opacity:0.4;pointer-events:none"' : ""}>
      <label for="serverUrl">Server WebSocket URL</label>
      <div class="input-row">
        <input id="serverUrl" type="text" placeholder="ws://192.168.x.x:8080/ws" autocomplete="off" spellcheck="false" />
        <button id="connectBtn">Connect</button>
      </div>
      <p class="hint">Run <code>bun run server</code> on the host machine, then enter its IP above.</p>
    </div>

    <div class="status-bar">
      <span id="statusDot" class="dot disconnected"></span>
      <span id="statusText">Disconnected</span>
      <span id="clientCount" class="client-count"></span>
    </div>

    <div class="messages" id="messages"></div>

    <div class="compose" id="compose">
      <input id="msgInput" type="text" placeholder="Type a message…" disabled />
      <button id="sendBtn" disabled>Send</button>
    </div>
  </div>
`;

if (isHttps) {
  const ipInput = document.getElementById("ipInput") as HTMLInputElement;
  const goBtn = document.getElementById("goBtn") as HTMLButtonElement;
  const open = () => {
    const ip = ipInput.value.trim();
    if (ip) window.open(`http://${ip}:8080`, "_blank");
  };
  goBtn.addEventListener("click", open);
  ipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
}

const serverUrlInput = document.getElementById("serverUrl") as HTMLInputElement;
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const clientCountEl = document.getElementById("clientCount")!;
const messagesEl = document.getElementById("messages")!;
const msgInput = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;

const deviceId = "Device-" + Math.random().toString(36).slice(2, 6).toUpperCase();
let ws: WebSocket | null = null;

function setStatus(state: "connected" | "disconnected" | "connecting") {
  statusDot.className = "dot " + state;
  statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  const connected = state === "connected";
  msgInput.disabled = !connected;
  sendBtn.disabled = !connected;
}

function appendMessage(text: string, cls: "sent" | "received" | "system", label?: string) {
  const el = document.createElement("div");
  el.className = "message " + cls;
  if (label) {
    const l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    el.appendChild(l);
  }
  const t = document.createElement("span");
  t.textContent = text;
  el.appendChild(t);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

connectBtn.addEventListener("click", () => {
  const url = serverUrlInput.value.trim();
  if (!url) return;
  if (ws) { ws.close(); ws = null; }

  setStatus("connecting");
  ws = new WebSocket(url);

  ws.onopen = () => {
    setStatus("connected");
    appendMessage("Connected to server.", "system");
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "system") {
        clientCountEl.textContent = `${data.count} online`;
        appendMessage(data.text, "system");
      } else if (data.type === "chat") {
        const isMine = data.from === deviceId;
        appendMessage(data.text, isMine ? "sent" : "received", isMine ? "You" : data.from);
      }
    } catch {
      appendMessage(e.data, "received");
    }
  };

  ws.onerror = () => appendMessage("Connection error.", "system");
  ws.onclose = () => {
    setStatus("disconnected");
    clientCountEl.textContent = "";
    appendMessage("Disconnected from server.", "system");
    ws = null;
  };
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify({ type: "chat", from: deviceId, text });
  ws.send(payload);
  msgInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
serverUrlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connectBtn.click(); });
