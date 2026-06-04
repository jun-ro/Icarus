import "./style.css";

document.getElementById("app")!.innerHTML = `
  <div class="container">
    <header>
      <h1>Icarus</h1>
      <p class="subtitle">Serverless P2P — no server required</p>
    </header>

    <div class="status-bar">
      <span id="statusDot" class="dot init"></span>
      <span id="statusText">Choose your role…</span>
    </div>

    <div id="stepRole" class="card">
      <label>Your role</label>
      <div class="btn-row">
        <button id="btnOffer">Create Offer</button>
        <button id="btnJoin">Join with Offer</button>
      </div>
      <p class="hint">One peer creates an offer and sends the text to the other.</p>
    </div>

    <div id="stepOffer" class="card" hidden>
      <label>Your Offer <small>— copy and send to peer</small></label>
      <textarea id="offerOut" class="sdp-box" readonly placeholder="Gathering ICE candidates…"></textarea>
      <button id="copyOffer" disabled>Copy Offer</button>
      <hr />
      <label>Paste peer's Answer</label>
      <textarea id="answerIn" class="sdp-box" placeholder="Paste answer here…"></textarea>
      <button id="btnConnect" disabled>Connect</button>
    </div>

    <div id="stepAccept" class="card" hidden>
      <label>Paste peer's Offer</label>
      <textarea id="offerIn" class="sdp-box" placeholder="Paste offer here…"></textarea>
      <button id="btnGenAnswer">Generate Answer</button>
      <div id="answerSection" hidden>
        <hr />
        <label>Your Answer <small>— copy and send back</small></label>
        <textarea id="answerOut" class="sdp-box" readonly></textarea>
        <button id="copyAnswer">Copy Answer</button>
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
const offerOut     = document.getElementById("offerOut") as HTMLTextAreaElement;
const copyOffer    = document.getElementById("copyOffer") as HTMLButtonElement;
const answerIn     = document.getElementById("answerIn") as HTMLTextAreaElement;
const btnConnect   = document.getElementById("btnConnect") as HTMLButtonElement;

const offerIn      = document.getElementById("offerIn") as HTMLTextAreaElement;
const btnGenAnswer = document.getElementById("btnGenAnswer") as HTMLButtonElement;
const answerSection = document.getElementById("answerSection")!;
const answerOut    = document.getElementById("answerOut") as HTMLTextAreaElement;
const copyAnswer   = document.getElementById("copyAnswer") as HTMLButtonElement;

const msgInput     = document.getElementById("msgInput") as HTMLInputElement;
const sendBtn      = document.getElementById("sendBtn") as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────
let activeDc: RTCDataChannel | null = null;

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

// Waits for ICE gathering to finish (all candidates bundled into localDescription).
// Falls back after 8 s so slow STUN lookups don't block indefinitely.
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

// ── WebRTC config ─────────────────────────────────────────────────────────────
const RTC: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ── Data channel wiring (shared) ──────────────────────────────────────────────
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

// ── Initiator flow ────────────────────────────────────────────────────────────
btnOffer.addEventListener("click", async () => {
  stepRole.hidden  = true;
  stepOffer.hidden = false;
  setStatus("connecting", "Gathering ICE candidates…");
  console.log("[offer] init");

  const pc = new RTCPeerConnection(RTC);
  wireChannel(pc.createDataChannel("icarus"));

  pc.onicecandidate = (e) => console.log("[offer:ice]", e.candidate?.type ?? "done");

  await pc.setLocalDescription(await pc.createOffer());
  const desc = await waitForIce(pc);
  offerOut.value     = JSON.stringify(desc);
  copyOffer.disabled = false;
  setStatus("ready", "Copy offer → send to peer → paste their answer → Connect");
  console.log("[offer] ready");

  answerIn.addEventListener("input", () => {
    btnConnect.disabled = !answerIn.value.trim();
  });

  btnConnect.addEventListener("click", async () => {
    try {
      await pc.setRemoteDescription(JSON.parse(answerIn.value.trim()));
      setStatus("connecting", "Connecting…");
      console.log("[offer] remote desc set, waiting for dc open");
    } catch {
      setStatus("error", "Invalid answer — check pasted text");
    }
  });
});

// ── Responder flow ────────────────────────────────────────────────────────────
btnJoin.addEventListener("click", () => {
  stepRole.hidden   = true;
  stepAccept.hidden = false;
  setStatus("ready", "Paste the offer and click Generate Answer");
});

btnGenAnswer.addEventListener("click", async () => {
  const offerStr = offerIn.value.trim();
  if (!offerStr) return;
  btnGenAnswer.disabled = true;
  setStatus("connecting", "Gathering ICE candidates…");
  console.log("[answer] init");

  const pc = new RTCPeerConnection(RTC);
  pc.ondatachannel = (e) => {
    wireChannel(e.channel);
    console.log("[answer] got data channel");
  };
  pc.onicecandidate = (e) => console.log("[answer:ice]", e.candidate?.type ?? "done");

  try {
    await pc.setRemoteDescription(JSON.parse(offerStr));
    await pc.setLocalDescription(await pc.createAnswer());
    const desc = await waitForIce(pc);
    answerOut.value      = JSON.stringify(desc);
    answerSection.hidden = false;
    setStatus("ready", "Copy answer → send back to peer. Waiting for connection…");
    console.log("[answer] ready");
  } catch {
    setStatus("error", "Invalid offer — check pasted text");
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
