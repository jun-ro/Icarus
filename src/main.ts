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
  console.log("[wireConn] attempting connection to", c.peer);

  c.on("open", () => {
    setStatus("connected", `Connected to ${c.peer}`);
    setConnected(true);
    log(`Connected to ${c.peer}.`, "system");
    console.log("[conn:open] connected to", c.peer);
  });

  c.on("data", (data) => {
    log(String(data), "received");
    console.log("[conn:data] received:", data);
  });

  c.on("close", () => {
    if (conn === c) {
      setStatus("ready", "Disconnected — ready");
      setConnected(false);
      conn = null;
    }
    log("Peer disconnected.", "system");
    console.log("[conn:close] peer disconnected");
  });

  c.on("error", (err) => {
    log(`Error: ${err.message}`, "system");
    console.error("[conn:error]", err);
  });
}

const randId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

let peer = initPeer();

function initPeer() {
  const id = randId();
  console.log("[initPeer] registering with ID:", id);
  const p = new Peer(id, {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:443?transport=tcp",
          ],
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    },
  });

  p.on("open", (id) => {
    myIdEl.textContent = id;
    copyBtn.disabled = connectBtn.disabled = false;
    setStatus("ready", "Ready — waiting for connection");
    console.log("[peer:open] ready, ID:", id);
  });

  p.on("connection", (c) => {
    console.log("[peer:connection] incoming from", c.peer);
    if (conn?.open) { c.close(); return; }
    if (conn && !conn.open) {
      // simultaneous connect: higher peer ID yields to incoming
      if (p.id > c.peer) { conn.close(); wireConn(c); }
      else c.close();
      return;
    }
    wireConn(c);
  });

  p.on("error", (err) => {
    console.error("[peer:error]", (err as any).type, err.message);
    if ((err as any).type === "unavailable-id") { peer.destroy(); peer = initPeer(); return; }
    setStatus("error", `Error: ${err.message}`);
  });

  return p;
}

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
