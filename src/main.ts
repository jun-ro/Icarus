import Peer, { type DataConnection } from "peerjs";
import "./style.css";

const app = document.getElementById("app")!;

app.innerHTML = `
  <div class="container">
    <header>
      <h1>Icarus</h1>
      <p class="subtitle">P2P demo via PeerJS</p>
    </header>

    <div class="card" id="myIdCard">
      <label>Your Peer ID</label>
      <div class="id-row">
        <span id="myId" class="peer-id">Connecting…</span>
        <button id="copyBtn" disabled>Copy</button>
      </div>
      <p class="hint">Share this ID with the other device.</p>
    </div>

    <div class="card">
      <label for="remoteId">Connect to Peer</label>
      <div class="input-row">
        <input id="remoteId" type="text" placeholder="Paste peer ID here" autocomplete="off" spellcheck="false" />
        <button id="connectBtn" disabled>Connect</button>
      </div>
    </div>

    <div class="status-bar">
      <span id="statusDot" class="dot init"></span>
      <span id="statusText">Initializing…</span>
    </div>

    <div class="messages" id="messages"></div>

    <div class="compose">
      <input id="msgInput" type="text" placeholder="Type a message…" disabled />
      <button id="sendBtn" disabled>Send</button>
    </div>
  </div>
`;

const myIdEl      = document.getElementById("myId")!;
const copyBtn     = document.getElementById("copyBtn") as HTMLButtonElement;
const remoteIdEl  = document.getElementById("remoteId") as HTMLInputElement;
const connectBtn  = document.getElementById("connectBtn") as HTMLButtonElement;
const statusDot   = document.getElementById("statusDot")!;
const statusText  = document.getElementById("statusText")!;
const messagesEl  = document.getElementById("messages")!;
const msgInput    = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn     = document.getElementById("sendBtn") as HTMLButtonElement;

let conn: DataConnection | null = null;

function setStatus(state: "init" | "ready" | "connecting" | "connected" | "error", text: string) {
  statusDot.className = "dot " + state;
  statusText.textContent = text;
}

function setConnected(yes: boolean) {
  msgInput.disabled = !yes;
  sendBtn.disabled  = !yes;
}

function log(text: string, cls: "sent" | "received" | "system") {
  const el = document.createElement("div");
  el.className = "message " + cls;
  const t = document.createElement("span");
  t.textContent = text;
  el.appendChild(t);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function wireConn(c: DataConnection) {
  conn = c;
  setStatus("connecting", "Connecting…");

  c.on("open", () => {
    setStatus("connected", `Connected to ${c.peer}`);
    setConnected(true);
    log(`Connected to ${c.peer}.`, "system");
  });

  c.on("data", (data) => {
    log(String(data), "received");
  });

  c.on("close", () => {
    setStatus("ready", "Disconnected — ready");
    setConnected(false);
    log("Peer disconnected.", "system");
    conn = null;
  });

  c.on("error", (err) => {
    log(`Error: ${err.message}`, "system");
  });
}

const peer = new Peer();

peer.on("open", (id) => {
  myIdEl.textContent = id;
  copyBtn.disabled   = false;
  connectBtn.disabled = false;
  setStatus("ready", "Ready — waiting for connection");
});

peer.on("connection", (c) => {
  if (conn) { c.close(); return; }
  wireConn(c);
});

peer.on("error", (err) => {
  setStatus("error", `Error: ${err.message}`);
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(myIdEl.textContent ?? "");
  copyBtn.textContent = "Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
});

connectBtn.addEventListener("click", () => {
  const id = remoteIdEl.value.trim();
  if (!id || conn) return;
  wireConn(peer.connect(id, { reliable: true }));
});

remoteIdEl.addEventListener("keydown", (e) => { if (e.key === "Enter") connectBtn.click(); });

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !conn) return;
  conn.send(text);
  log(text, "sent");
  msgInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
