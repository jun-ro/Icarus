import "./style.css";

// ── Config — replace with your deployed Worker URL after running: cd relay && npx wrangler deploy
const RELAY_WS = "wss://icarus-relay.makeanother3.workers.dev";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ── HTML ──────────────────────────────────────────────────────────────────────
document.getElementById("app")!.innerHTML = `
  <div class="container">
    <header>
      <h1>Icarus</h1>
      <p class="subtitle">LAN P2P</p>
    </header>
    <div class="status-bar">
      <span id="statusDot" class="dot init"></span>
      <span id="statusText">Choose your role…</span>
    </div>

    <div id="stepRole" class="card">
      <label>Connect</label>
      <div class="btn-row">
        <button id="btnOffer">Create Room</button>
        <button id="btnJoin">Join Room</button>
      </div>
      <p class="hint">Same browser: Create Room → Open in new tab. Cross-device: share the 6-char code.</p>
    </div>

    <div id="stepOffer" hidden>
      <div class="card">
        <label>Same browser</label>
        <button id="btnNewTab">Open in new tab</button>
        <p id="autoStatus" class="hint"> </p>
      </div>
      <div class="card">
        <label>Room code — share with peer</label>
        <div id="roomCodeDisplay" class="code-display">------</div>
        <p id="offerStatus" class="hint">Waiting for peer to join…</p>
      </div>
    </div>

    <div id="stepAccept" hidden>
      <div class="card">
        <label>Enter room code</label>
        <input id="codeInput" type="text" maxlength="7" placeholder="ABC-123"
          class="code-input" autocomplete="off" spellcheck="false" />
        <button id="btnJoinRoom" disabled>Join</button>
        <p id="joinStatus" class="hint"> </p>
      </div>
    </div>

    <div class="messages" id="messages" hidden></div>
    <div class="compose" id="compose" hidden>
      <input id="msgInput" type="text" placeholder="Type a message…" />
      <button id="sendBtn">Send</button>
    </div>
  </div>
`;

// ── Element refs ──────────────────────────────────────────────────────────────
const statusDot       = document.getElementById("statusDot")!;
const statusText      = document.getElementById("statusText")!;
const stepRole        = document.getElementById("stepRole")!;
const stepOffer       = document.getElementById("stepOffer")!;
const stepAccept      = document.getElementById("stepAccept")!;
const messagesEl      = document.getElementById("messages")!;
const composeEl       = document.getElementById("compose")!;
const btnOffer        = document.getElementById("btnOffer") as HTMLButtonElement;
const btnJoin         = document.getElementById("btnJoin") as HTMLButtonElement;
const btnNewTab       = document.getElementById("btnNewTab") as HTMLButtonElement;
const autoStatus      = document.getElementById("autoStatus")!;
const roomCodeDisplay = document.getElementById("roomCodeDisplay")!;
const offerStatus     = document.getElementById("offerStatus")!;
const codeInput       = document.getElementById("codeInput") as HTMLInputElement;
const btnJoinRoom     = document.getElementById("btnJoinRoom") as HTMLButtonElement;
const joinStatus      = document.getElementById("joinStatus")!;
const msgInput        = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn         = document.getElementById("sendBtn") as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────
let bcMode    = false;
let isBcHost  = false;
export let activeWs: WebSocket | null = null; // exported for rollback netcode integration

// ── BroadcastChannel — same-browser auto-connect ──────────────────────────────
const bc = new BroadcastChannel("icarus");
bc.postMessage({ type: "bc-ready" });

bc.onmessage = ({ data }) => {
  switch (data.type) {
    case "bc-ready":
      if (isBcHost && !bcMode) bc.postMessage({ type: "bc-offer" });
      break;
    case "bc-offer":
      if (!bcMode && !isBcHost) {
        bcMode = true;
        bc.postMessage({ type: "bc-accept" });
        stepRole.hidden = true;
        setStatus("connected", "Connected");
        showChat();
        log("Connected.", "system");
      }
      break;
    case "bc-accept":
      if (isBcHost && !bcMode) {
        bcMode = true;
        autoStatus.textContent = "Connected!";
        setStatus("connected", "Connected");
        showChat();
        log("Connected.", "system");
      }
      break;
    case "bc-msg":
      if (bcMode) log(data.text, "received");
      break;
    case "bc-bye":
      if (bcMode) {
        bcMode = false;
        isBcHost = false;
        setStatus("ready", "Peer disconnected");
        log("Peer disconnected.", "system");
      }
      break;
  }
};

window.addEventListener("beforeunload", () => bc.postMessage({ type: "bc-bye" }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(state: "init" | "ready" | "connecting" | "connected" | "error", text: string) {
  statusDot.className = "dot " + state;
  statusText.textContent = text;
}

function log(text: string, cls: "sent" | "received" | "system") {
  const div = document.createElement("div");
  div.className = "message " + cls;
  const span = document.createElement("span");
  span.textContent = text;
  div.appendChild(span);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showChat() {
  stepRole.hidden   = true;
  stepOffer.hidden  = true;
  stepAccept.hidden = true;
  messagesEl.hidden = false;
  composeEl.hidden  = false;
}

function genCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
}

// ── WebSocket relay ───────────────────────────────────────────────────────────
function connectRoom(code: string) {
  const ws = new WebSocket(`${RELAY_WS}/${code}`);
  ws.binaryType = "arraybuffer";
  activeWs = ws;
  let peerConnected = false;

  ws.onopen = () => ws.send(JSON.stringify({ type: "hello" }));

  ws.onmessage = ({ data }) => {
    if (typeof data !== "string") return; // binary — for rollback netcode, handle externally
    try {
      const msg = JSON.parse(data);
      if (msg.type === "hello" && !peerConnected) {
        peerConnected = true;
        ws.send(JSON.stringify({ type: "hello" })); // echo so the waiting peer also connects
        setStatus("connected", "Connected");
        showChat();
        log("Connected.", "system");
      } else if (msg.type === "msg") {
        log(msg.text, "received");
      }
    } catch {}
  };

  ws.onclose = () => {
    setStatus("ready", "Disconnected");
    log("Peer disconnected.", "system");
    activeWs = null;
  };

  ws.onerror = () => {
    setStatus("error", "Relay unreachable — check RELAY_WS or network");
    joinStatus.textContent = "Could not reach relay. Is it deployed?";
  };

  return ws;
}

// ── Create Room (host) ────────────────────────────────────────────────────────
btnOffer.addEventListener("click", () => {
  isBcHost = true;
  stepRole.hidden  = true;
  stepOffer.hidden = false;

  bc.postMessage({ type: "bc-offer" });
  autoStatus.textContent = "Waiting for other tab…";

  const code = genCode();
  roomCodeDisplay.textContent = `${code.slice(0, 3)}-${code.slice(3)}`;
  setStatus("connecting", "Waiting for peer…");

  connectRoom(code);
});

btnNewTab.addEventListener("click", () => window.open(location.href, "_blank"));

// ── Join Room ─────────────────────────────────────────────────────────────────
btnJoin.addEventListener("click", () => {
  stepRole.hidden   = true;
  stepAccept.hidden = false;
  setStatus("ready", "Enter room code");
  codeInput.focus();
});

codeInput.addEventListener("input", () => {
  let val = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (val.length > 3) val = val.slice(0, 3) + "-" + val.slice(3, 6);
  codeInput.value = val;
  btnJoinRoom.disabled = val.replace("-", "").length < 6;
});

btnJoinRoom.addEventListener("click", () => {
  const code = codeInput.value.replace("-", "").trim();
  if (code.length < 6) return;
  btnJoinRoom.disabled = true;
  joinStatus.textContent = "Connecting…";
  setStatus("connecting", "Connecting…");
  connectRoom(code);
});

// ── Send message ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (bcMode) {
    bc.postMessage({ type: "bc-msg", text });
    log(text, "sent");
    msgInput.value = "";
  } else if (activeWs?.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify({ type: "msg", text }));
    log(text, "sent");
    msgInput.value = "";
  }
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
