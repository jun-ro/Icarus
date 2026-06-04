import "./style.css";

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
      <p class="hint">Same browser: Create Offer → Open in new tab (automatic). Cross-device: share code.</p>
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
        <button id="copyOffer" disabled>Copy Code</button>
        <hr />
        <label>Paste peer's answer code</label>
        <textarea id="answerIn" class="sdp-box" placeholder="Paste answer code…"></textarea>
        <button id="btnConnect" disabled>Connect</button>
      </div>
    </div>

    <div id="stepAccept" hidden>
      <div class="card" id="cardAutoAccept" hidden>
        <label>Offer received from another tab</label>
        <p id="autoAcceptNote" class="hint">Generating answer…</p>
        <button id="btnAutoAccept" hidden>Connect</button>
      </div>
      <div class="card">
        <label>Cross-device — paste offer code</label>
        <textarea id="offerIn" class="sdp-box" placeholder="Paste offer code…"></textarea>
        <button id="btnGenAnswer">Generate Answer</button>
        <div id="answerSection" hidden>
          <hr />
          <label>Your answer code — copy and send back</label>
          <textarea id="answerOut" class="sdp-box" readonly></textarea>
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
const statusDot     = document.getElementById("statusDot")!;
const statusText    = document.getElementById("statusText")!;
const stepRole      = document.getElementById("stepRole")!;
const stepOffer     = document.getElementById("stepOffer")!;
const stepAccept    = document.getElementById("stepAccept")!;
const messagesEl    = document.getElementById("messages")!;
const composeEl     = document.getElementById("compose")!;
const btnOffer      = document.getElementById("btnOffer") as HTMLButtonElement;
const btnJoin       = document.getElementById("btnJoin") as HTMLButtonElement;
const btnNewTab     = document.getElementById("btnNewTab") as HTMLButtonElement;
const autoStatus    = document.getElementById("autoStatus")!;
const offerOut      = document.getElementById("offerOut") as HTMLTextAreaElement;
const copyOffer     = document.getElementById("copyOffer") as HTMLButtonElement;
const answerIn      = document.getElementById("answerIn") as HTMLTextAreaElement;
const btnConnect    = document.getElementById("btnConnect") as HTMLButtonElement;
const cardAutoAccept = document.getElementById("cardAutoAccept")!;
const autoAcceptNote = document.getElementById("autoAcceptNote")!;
const btnAutoAccept = document.getElementById("btnAutoAccept") as HTMLButtonElement;
const offerIn       = document.getElementById("offerIn") as HTMLTextAreaElement;
const btnGenAnswer  = document.getElementById("btnGenAnswer") as HTMLButtonElement;
const answerSection = document.getElementById("answerSection")!;
const answerOut     = document.getElementById("answerOut") as HTMLTextAreaElement;
const copyAnswer    = document.getElementById("copyAnswer") as HTMLButtonElement;
const msgInput      = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn       = document.getElementById("sendBtn") as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────
let activeDc: RTCDataChannel | null = null;
let initiatorPc: RTCPeerConnection | null = null;

// ── BroadcastChannel (same-browser auto-signaling) ────────────────────────────
const bc = new BroadcastChannel("icarus");
const bcSdp = (desc: RTCSessionDescription | RTCSessionDescriptionInit) => ({ type: desc.type, sdp: desc.sdp });
bc.postMessage({ type: "ready" });

bc.onmessage = async ({ data }) => {
  if (data.type === "ready" && initiatorPc?.localDescription) {
    bc.postMessage({ type: "offer", sdp: bcSdp(initiatorPc.localDescription!) });
    autoStatus.textContent = "Other tab detected — waiting for answer…";
    console.log("[bc] re-sent offer to new tab");
  }
  if (data.type === "offer") {
    console.log("[bc] received offer — auto-processing");
    stepRole.hidden       = true;
    stepAccept.hidden     = false;
    cardAutoAccept.hidden = false;
    setStatus("connecting", "Offer received — generating answer…");
    await bcHandleOffer(data.sdp);
  }
  if (data.type === "answer" && initiatorPc) {
    console.log("[bc] received answer — connecting");
    await initiatorPc.setRemoteDescription(data.sdp);
    setStatus("connecting", "Connecting…");
  }
};

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

// SDP → compressed base64 (shorter codes for manual exchange)
async function encode(sdp: RTCSessionDescriptionInit): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(sdp));
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decode(b64: string): Promise<RTCSessionDescriptionInit> {
  const pad = b64.length % 4 ? b64 + "=".repeat(4 - b64.length % 4) : b64;
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const text = await new Response(ds.readable).text();
  return JSON.parse(text);
}

// ── WebRTC config ─────────────────────────────────────────────────────────────
const RTC: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ── Data channel wiring ───────────────────────────────────────────────────────
function wireChannel(dc: RTCDataChannel) {
  activeDc = dc;
  dc.onopen = () => {
    setStatus("connected", "Connected");
    showChat();
    log("Connected.", "system");
    console.log("[dc:open]");
  };
  dc.onclose = () => {
    setStatus("ready", "Disconnected");
    log("Peer disconnected.", "system");
    activeDc = null;
    console.log("[dc:close]");
  };
  dc.onmessage = (e) => {
    log(String(e.data), "received");
    console.log("[dc:message]", e.data);
  };
  dc.onerror = (e) => console.error("[dc:error]", e);
}

// ── BroadcastChannel auto-accept (responder side) ─────────────────────────────
async function bcHandleOffer(sdpInit: RTCSessionDescriptionInit) {
  const pc = new RTCPeerConnection(RTC);
  pc.ondatachannel = (e) => { wireChannel(e.channel); console.log("[bc:answer] got dc"); };
  pc.onicecandidate = (e) => console.log("[bc:answer:ice]", e.candidate?.type ?? "done");

  await pc.setRemoteDescription(sdpInit);
  await pc.setLocalDescription(await pc.createAnswer());
  const desc = await waitForIce(pc);

  bc.postMessage({ type: "answer", sdp: bcSdp(desc) });
  autoAcceptNote.textContent = "Answer sent — waiting for connection…";
  console.log("[bc:answer] sent answer");
}

// ── Initiator flow ────────────────────────────────────────────────────────────
btnOffer.addEventListener("click", async () => {
  stepRole.hidden  = true;
  stepOffer.hidden = false;
  setStatus("connecting", "Gathering ICE candidates…");
  console.log("[offer] init");

  const pc = new RTCPeerConnection(RTC);
  initiatorPc = pc;
  wireChannel(pc.createDataChannel("icarus"));
  pc.onicecandidate = (e) => console.log("[offer:ice]", e.candidate?.type ?? "done");

  await pc.setLocalDescription(await pc.createOffer());
  const desc = await waitForIce(pc);

  // Broadcast for same-browser auto-connect
  bc.postMessage({ type: "offer", sdp: bcSdp(desc) });
  autoStatus.textContent = "Waiting for other tab…";

  // Encode for manual cross-device fallback
  offerOut.value     = await encode(desc);
  copyOffer.disabled = false;
  setStatus("ready", "Open new tab — or share code for cross-device");
  console.log("[offer] ready");

  answerIn.addEventListener("input", () => {
    btnConnect.disabled = !answerIn.value.trim();
  });

  btnConnect.addEventListener("click", async () => {
    try {
      await pc.setRemoteDescription(await decode(answerIn.value.trim()));
      setStatus("connecting", "Connecting…");
      console.log("[offer] manual answer applied");
    } catch {
      setStatus("error", "Invalid answer code");
    }
  });
});

btnNewTab.addEventListener("click", () => {
  window.open(location.href, "_blank");
});

// ── Responder flow — manual ───────────────────────────────────────────────────
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
  console.log("[answer:manual] init");

  const pc = new RTCPeerConnection(RTC);
  pc.ondatachannel = (e) => { wireChannel(e.channel); console.log("[answer:manual] got dc"); };
  pc.onicecandidate = (e) => console.log("[answer:manual:ice]", e.candidate?.type ?? "done");

  try {
    await pc.setRemoteDescription(await decode(raw));
    await pc.setLocalDescription(await pc.createAnswer());
    const desc = await waitForIce(pc);
    answerOut.value      = await encode(desc);
    answerSection.hidden = false;
    setStatus("ready", "Copy answer code → send to peer");
    console.log("[answer:manual] ready");
  } catch {
    setStatus("error", "Invalid offer code");
    btnGenAnswer.disabled = false;
  }
});

// ── Copy buttons ──────────────────────────────────────────────────────────────
makeCopyBtn(copyOffer,  () => offerOut.value);
makeCopyBtn(copyAnswer, () => answerOut.value);

// ── Send message ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !activeDc) return;
  activeDc.send(text);
  log(text, "sent");
  msgInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
