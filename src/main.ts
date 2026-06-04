import "./style.css";

// ── Config ────────────────────────────────────────────────────────────────────
const RELAY = "https://ntfy.sh/icarus-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MY_ID = crypto.randomUUID();

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
        <p id="offerStatus" class="hint">Generating…</p>
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
let bcMode   = false;
let isBcHost = false;
let activeDc: RTCDataChannel | null = null;

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

function waitForIce(pc: RTCPeerConnection): Promise<RTCSessionDescription> {
  return new Promise((resolve) => {
    const done = () => resolve(pc.localDescription!);
    if (pc.iceGatheringState === "complete") { done(); return; }
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") done();
    });
    setTimeout(done, 15000);
  });
}

// Keep host (direct LAN) and relay (TURN) candidates; drop srflx (redundant)
function filterSdp(sdp: string): string {
  return sdp.split("\n")
    .filter(line => !line.startsWith("a=candidate:") || line.includes("typ host") || line.includes("typ relay"))
    .join("\n");
}

async function encode(desc: RTCSessionDescriptionInit): Promise<string> {
  const filtered: RTCSessionDescriptionInit = { type: desc.type, sdp: desc.sdp ? filterSdp(desc.sdp) : desc.sdp };
  const bytes = new TextEncoder().encode(JSON.stringify(filtered));
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decode(b64: string): Promise<RTCSessionDescriptionInit> {
  const pad = b64.length % 4 ? b64 + "=".repeat(4 - b64.length % 4) : b64;
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return JSON.parse(await new Response(ds.readable).text());
}

// ── ntfy.sh relay ─────────────────────────────────────────────────────────────
async function publish(code: string, payload: object): Promise<void> {
  await fetch(RELAY + code, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function fetchMessages(code: string): Promise<any[]> {
  const res = await fetch(`${RELAY}${code}/json?poll=1&since=1h`);
  const text = await res.text();
  return text.trim().split("\n").flatMap(line => {
    if (!line) return [];
    try {
      const ev = JSON.parse(line);
      if (ev.event !== "message") return [];
      const payload = JSON.parse(ev.message);
      return payload.sender !== MY_ID ? [payload] : [];
    } catch { return []; }
  });
}

async function waitFor(code: string, type: string, timeoutMs = 90_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const msgs = await fetchMessages(code);
      const found = msgs.find(m => m.type === type);
      if (found) return found;
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error("timeout");
}

// ── WebRTC ────────────────────────────────────────────────────────────────────
const RTC: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Free TURN relay — fallback when direct LAN is blocked (AP isolation)
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

function wireIce(pc: RTCPeerConnection, label: string, onFailed: () => void) {
  pc.onicecandidate = (e) => {
    if (e.candidate) console.log(`[${label}:ice]`, e.candidate.type, e.candidate.address);
    else console.log(`[${label}:ice] gathering complete`);
  };
  pc.oniceconnectionstatechange = () => {
    console.log(`[${label}:ice:state]`, pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") onFailed();
  };
}

function wireChannel(dc: RTCDataChannel) {
  activeDc = dc;
  dc.onopen    = () => { setStatus("connected", "Connected"); showChat(); log("Connected.", "system"); };
  dc.onclose   = () => { setStatus("ready", "Disconnected"); log("Peer disconnected.", "system"); activeDc = null; };
  dc.onmessage = (e) => log(String(e.data), "received");
  dc.onerror   = (e) => console.error("[dc:error]", e);
}

// ── Create Room (host) ────────────────────────────────────────────────────────
btnOffer.addEventListener("click", async () => {
  isBcHost = true;
  stepRole.hidden  = true;
  stepOffer.hidden = false;

  bc.postMessage({ type: "bc-offer" });
  autoStatus.textContent = "Waiting for other tab…";

  const code = genCode();
  roomCodeDisplay.textContent = `${code.slice(0, 3)}-${code.slice(3)}`;
  setStatus("connecting", "Generating…");

  const pc = new RTCPeerConnection(RTC);
  // Unreliable, unordered — UDP-like for rollback netcode
  wireChannel(pc.createDataChannel("rollback", { ordered: false, maxRetransmits: 0 }));
  wireIce(pc, "offer", () => {
    if (!bcMode) setStatus("error", "ICE failed — both direct and relay paths blocked on this network");
  });

  await pc.setLocalDescription(await pc.createOffer());
  const desc = await waitForIce(pc);

  try {
    await publish(code, { type: "offer", sdp: await encode(desc), sender: MY_ID });
  } catch {
    offerStatus.textContent = "Could not reach relay. Check network.";
    setStatus("error", "Relay unreachable");
    return;
  }

  setStatus("ready", "Share code — waiting for peer");
  offerStatus.textContent = "Waiting for peer to join…";

  waitFor(code, "answer").then(async msg => {
    if (bcMode) return;
    try {
      await pc.setRemoteDescription(await decode(msg.sdp));
      setStatus("connecting", "Connecting…");
    } catch { setStatus("error", "Connection failed"); }
  }).catch(() => {
    if (!bcMode) {
      offerStatus.textContent = "Timed out. Refresh to try again.";
      setStatus("error", "Timed out");
    }
  });
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

btnJoinRoom.addEventListener("click", async () => {
  const code = codeInput.value.replace("-", "").trim();
  if (code.length < 6) return;
  btnJoinRoom.disabled = true;
  joinStatus.textContent = "Contacting relay…";
  setStatus("connecting", "Contacting relay…");

  const pc = new RTCPeerConnection(RTC);
  pc.ondatachannel = (e) => wireChannel(e.channel);
  wireIce(pc, "answer", () => {
    setStatus("error", "ICE failed — both direct and relay paths blocked on this network");
    joinStatus.textContent = "Connection failed. Check console for candidate types gathered.";
  });

  // First fetch unguarded — surfaces network errors immediately (e.g. relay blocked by proxy)
  let offerMsg: any;
  try {
    const initial = await fetchMessages(code);
    offerMsg = initial.find(m => m.type === "offer");
  } catch (err) {
    setStatus("error", "Relay unreachable");
    joinStatus.textContent = `Can't reach ntfy.sh — may be blocked on this network. (${err})`;
    btnJoinRoom.disabled = false;
    return;
  }

  if (!offerMsg) {
    joinStatus.textContent = "Room not found yet, waiting…";
    try {
      offerMsg = await waitFor(code, "offer", 55_000);
    } catch {
      setStatus("error", "Room not found");
      joinStatus.textContent = "Room not found. Check the code and try again.";
      btnJoinRoom.disabled = false;
      return;
    }
  }

  try {
    joinStatus.textContent = "Found room. Generating answer…";
    await pc.setRemoteDescription(await decode(offerMsg.sdp));
    await pc.setLocalDescription(await pc.createAnswer());
    const desc = await waitForIce(pc);
    await publish(code, { type: "answer", sdp: await encode(desc), sender: MY_ID });
    setStatus("connecting", "Connecting…");
    joinStatus.textContent = "Connecting…";
  } catch (err) {
    setStatus("error", "Connection failed");
    joinStatus.textContent = `Connection failed: ${err}`;
    btnJoinRoom.disabled = false;
  }
});

// ── Send message ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (bcMode) {
    bc.postMessage({ type: "bc-msg", text });
    log(text, "sent");
    msgInput.value = "";
  } else if (activeDc?.readyState === "open") {
    activeDc.send(text);
    log(text, "sent");
    msgInput.value = "";
  }
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
