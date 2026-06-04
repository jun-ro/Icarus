import "./style.css";
import QRCode from "qrcode";

document.getElementById("app")!.innerHTML = `
  <div class="container">
    <header>
      <h1>Icarus</h1>
      <p class="subtitle">Serverless P2P</p>
    </header>
    <div class="status-bar">
      <span id="statusDot" class="dot init"></span>
      <span id="statusText">Choose your role…</span>
    </div>

    <div id="stepRole" class="card">
      <label>Connect</label>
      <div class="btn-row">
        <button id="btnOffer">Create Offer</button>
        <button id="btnJoin">Enter Code</button>
      </div>
      <p class="hint">Same browser: Create Offer → Open in new tab. Cross-device: share code.</p>
    </div>

    <div id="stepOffer" hidden>
      <div class="card">
        <label>Same browser</label>
        <button id="btnNewTab">Open in new tab</button>
        <p id="autoStatus" class="hint"> </p>
      </div>
      <div class="card">
        <label>Cross-device — send this code to peer</label>
        <textarea id="offerOut" class="sdp-box" readonly placeholder="Generating…"></textarea>
        <canvas id="offerQr" class="qr-canvas" hidden></canvas>
        <button id="copyOffer" disabled>Copy Code</button>
        <hr />
        <label>Paste peer's answer code</label>
        <textarea id="answerIn" class="sdp-box" placeholder="Paste answer code…"></textarea>
        <button id="btnConnect" disabled>Connect</button>
      </div>
    </div>

    <div id="stepAccept" hidden>
      <div class="card">
        <label>Cross-device — paste offer code</label>
        <textarea id="offerIn" class="sdp-box" placeholder="Paste offer code…"></textarea>
        <button id="btnGenAnswer">Generate Answer</button>
        <div id="answerSection" hidden>
          <hr />
          <label>Your answer code — copy and send back</label>
          <textarea id="answerOut" class="sdp-box" readonly></textarea>
          <canvas id="answerQr" class="qr-canvas"></canvas>
          <button id="copyAnswer">Copy Answer</button>
        </div>
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
const statusDot    = document.getElementById("statusDot")!;
const statusText   = document.getElementById("statusText")!;
const stepRole     = document.getElementById("stepRole")!;
const stepOffer    = document.getElementById("stepOffer")!;
const stepAccept   = document.getElementById("stepAccept")!;
const messagesEl   = document.getElementById("messages")!;
const composeEl    = document.getElementById("compose")!;
const btnOffer     = document.getElementById("btnOffer") as HTMLButtonElement;
const btnJoin      = document.getElementById("btnJoin") as HTMLButtonElement;
const btnNewTab    = document.getElementById("btnNewTab") as HTMLButtonElement;
const autoStatus   = document.getElementById("autoStatus")!;
const offerOut     = document.getElementById("offerOut") as HTMLTextAreaElement;
const copyOffer    = document.getElementById("copyOffer") as HTMLButtonElement;
const answerIn     = document.getElementById("answerIn") as HTMLTextAreaElement;
const btnConnect   = document.getElementById("btnConnect") as HTMLButtonElement;
const offerIn      = document.getElementById("offerIn") as HTMLTextAreaElement;
const btnGenAnswer = document.getElementById("btnGenAnswer") as HTMLButtonElement;
const answerSection = document.getElementById("answerSection")!;
const answerOut    = document.getElementById("answerOut") as HTMLTextAreaElement;
const copyAnswer   = document.getElementById("copyAnswer") as HTMLButtonElement;
const offerQr      = document.getElementById("offerQr") as HTMLCanvasElement;
const answerQr     = document.getElementById("answerQr") as HTMLCanvasElement;
const msgInput     = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn      = document.getElementById("sendBtn") as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────
let bcMode   = false;   // true when communicating over BroadcastChannel
let isBcHost = false;   // true for the tab that clicked "Create Offer"
let activeDc: RTCDataChannel | null = null;  // used only for cross-device WebRTC

// ── BroadcastChannel — same-browser messaging (no WebRTC needed) ──────────────
const bc = new BroadcastChannel("icarus");

// Announce presence so any waiting host re-sends its offer
bc.postMessage({ type: "bc-ready" });

bc.onmessage = ({ data }) => {
  switch (data.type) {
    case "bc-ready":
      // A new tab opened — re-broadcast offer if we're the host
      if (isBcHost && !bcMode) {
        bc.postMessage({ type: "bc-offer" });
        console.log("[bc] new tab detected, re-sent offer");
      }
      break;

    case "bc-offer":
      // Auto-accept: skip WebRTC entirely, use BC as the channel
      if (!bcMode && !isBcHost) {
        bcMode = true;
        bc.postMessage({ type: "bc-accept" });
        stepRole.hidden = true;
        setStatus("connected", "Connected");
        showChat();
        log("Connected.", "system");
        console.log("[bc] auto-accepted, using BroadcastChannel");
      }
      break;

    case "bc-accept":
      if (isBcHost && !bcMode) {
        bcMode = true;
        autoStatus.textContent = "Connected!";
        setStatus("connected", "Connected");
        showChat();
        log("Connected.", "system");
        console.log("[bc] peer accepted, using BroadcastChannel");
      }
      break;

    case "bc-msg":
      if (bcMode) {
        log(data.text, "received");
        console.log("[bc] received:", data.text);
      }
      break;

    case "bc-bye":
      if (bcMode) {
        bcMode = false;
        isBcHost = false;
        setStatus("ready", "Peer disconnected");
        log("Peer disconnected.", "system");
        console.log("[bc] peer disconnected");
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

function makeCopyBtn(btn: HTMLButtonElement, getText: () => string) {
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(getText());
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = orig), 1500);
  });
}

function waitForIce(pc: RTCPeerConnection): Promise<RTCSessionDescription> {
  return new Promise((resolve) => {
    const done = () => resolve(pc.localDescription!);
    if (pc.iceGatheringState === "complete") { done(); return; }
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") done();
    });
    setTimeout(done, 8000);
  });
}

async function encode(sdp: RTCSessionDescriptionInit): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(sdp));
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

// ── WebRTC config (cross-device only) ────────────────────────────────────────
const RTC: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function wireChannel(dc: RTCDataChannel) {
  activeDc = dc;
  dc.onopen  = () => { setStatus("connected", "Connected"); showChat(); log("Connected.", "system"); };
  dc.onclose = () => { setStatus("ready", "Disconnected"); log("Peer disconnected.", "system"); activeDc = null; };
  dc.onmessage = (e) => { log(String(e.data), "received"); console.log("[dc:msg]", e.data); };
  dc.onerror   = (e) => console.error("[dc:error]", e);
}

// ── Create Offer (host) ───────────────────────────────────────────────────────
btnOffer.addEventListener("click", async () => {
  isBcHost = true;
  stepRole.hidden  = true;
  stepOffer.hidden = false;
  setStatus("ready", "Open new tab — or share code for cross-device");

  // Broadcast immediately for same-browser auto-connect
  bc.postMessage({ type: "bc-offer" });
  autoStatus.textContent = "Waiting for other tab…";

  // Generate WebRTC offer in background for cross-device fallback
  setStatus("connecting", "Generating code…");
  const pc = new RTCPeerConnection(RTC);
  wireChannel(pc.createDataChannel("icarus"));
  pc.onicecandidate = (e) => console.log("[offer:ice]", e.candidate?.type ?? "done");
  await pc.setLocalDescription(await pc.createOffer());
  const desc = await waitForIce(pc);
  offerOut.value     = await encode(desc);
  copyOffer.disabled = false;
  setStatus("ready", "Open new tab — or share code for cross-device");
  await QRCode.toCanvas(offerQr, offerOut.value, { width: 220, margin: 1 });
  offerQr.hidden = false;
  console.log("[offer] WebRTC offer ready");

  answerIn.addEventListener("input", () => { btnConnect.disabled = !answerIn.value.trim(); });
  btnConnect.addEventListener("click", async () => {
    try {
      await pc.setRemoteDescription(await decode(answerIn.value.trim()));
      setStatus("connecting", "Connecting…");
    } catch { setStatus("error", "Invalid answer code"); }
  });
});

btnNewTab.addEventListener("click", () => window.open(location.href, "_blank"));

// ── Enter Code (join, cross-device) ──────────────────────────────────────────
btnJoin.addEventListener("click", () => {
  stepRole.hidden   = true;
  stepAccept.hidden = false;
  setStatus("ready", "Paste offer code and click Generate Answer");
});

btnGenAnswer.addEventListener("click", async () => {
  const raw = offerIn.value.trim();
  if (!raw) return;
  btnGenAnswer.disabled = true;
  setStatus("connecting", "Gathering ICE candidates…");

  const pc = new RTCPeerConnection(RTC);
  pc.ondatachannel = (e) => { wireChannel(e.channel); console.log("[answer] got dc"); };
  pc.onicecandidate = (e) => console.log("[answer:ice]", e.candidate?.type ?? "done");

  try {
    await pc.setRemoteDescription(await decode(raw));
    await pc.setLocalDescription(await pc.createAnswer());
    const desc = await waitForIce(pc);
    answerOut.value      = await encode(desc);
    answerSection.hidden = false;
    await QRCode.toCanvas(answerQr, answerOut.value, { width: 220, margin: 1 });
    setStatus("ready", "Copy answer code → send to peer");
  } catch { setStatus("error", "Invalid offer code"); btnGenAnswer.disabled = false; }
});

// ── Copy buttons ──────────────────────────────────────────────────────────────
makeCopyBtn(copyOffer,  () => offerOut.value);
makeCopyBtn(copyAnswer, () => answerOut.value);

// ── Send message ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (bcMode) {
    bc.postMessage({ type: "bc-msg", text });
    log(text, "sent");
    msgInput.value = "";
  } else if (activeDc) {
    activeDc.send(text);
    log(text, "sent");
    msgInput.value = "";
  }
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
