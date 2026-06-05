export interface Transport {
  readonly readyState: number;
  send(data: ArrayBuffer): void;
  addEventListener(type: string, listener: (e: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (e: MessageEvent) => void): void;
}

export interface RollbackConfig {
  ws: Transport;
  maxRollback?: number; // default 8

  // Called every frame to snapshot state before simulation
  saveState(): Uint8Array;
  // Called on rollback to restore a prior snapshot
  loadState(state: Uint8Array): void;
  // Advance the game by one frame with the given inputs
  simulate(p1Input: number, p2Input: number): void;
  // Called when remote input arrives outside the rollback window
  onDesynced?(): void;
}

interface Slot {
  frameNumber: number;
  state: Uint8Array;
  p1Input: number;
  p2Input: number;
  p2Confirmed: boolean;
}

export class RollbackSession {
  private readonly maxRollback: number;
  private readonly ws: Transport;
  private readonly saveState: () => Uint8Array;
  private readonly loadState: (s: Uint8Array) => void;
  private readonly simulate: (p1: number, p2: number) => void;
  private readonly onDesynced?: () => void;

  private currentFrame = 0;
  private readonly slots: Slot[];
  private readonly remoteQueue: Array<{ frame: number; input: number }> = [];
  // Holds confirmed remote inputs for frames we haven't reached yet
  private readonly futureInputs = new Map<number, number>();
  private lastP2Input = 0;
  private lastRemoteFrame = -1;
  private readonly msgHandler: (e: MessageEvent) => void;

  constructor(config: RollbackConfig) {
    this.maxRollback = config.maxRollback ?? 8;
    this.ws = config.ws;
    this.saveState = config.saveState;
    this.loadState = config.loadState;
    this.simulate = config.simulate;
    this.onDesynced = config.onDesynced;

    this.slots = Array.from({ length: this.maxRollback }, () => ({
      frameNumber: -1,
      state: new Uint8Array(0),
      p1Input: 0,
      p2Input: 0,
      p2Confirmed: false,
    }));

    this.msgHandler = ({ data }: MessageEvent) => {
      if (!(data instanceof ArrayBuffer) || data.byteLength < 5) return;
      const view = new DataView(data);
      const frame = view.getUint32(0, true);
      if (frame > this.lastRemoteFrame) this.lastRemoteFrame = frame;
      this.remoteQueue.push({ frame, input: view.getUint8(4) });
    };

    this.ws.addEventListener("message", this.msgHandler);
  }

  /** Frames local is ahead of the latest known remote frame. Positive = local is ahead. */
  get frameAdvantage(): number {
    return this.lastRemoteFrame === -1 ? 0 : this.currentFrame - this.lastRemoteFrame;
  }

  // Call once per game loop iteration with the local player's current input bitmask
  tick(localInput: number): void {
    // Drain remote input queue; trigger rollback if a past frame differs
    while (this.remoteQueue.length > 0) {
      const { frame, input } = this.remoteQueue.shift()!;
      const age = this.currentFrame - frame; // positive = past, 0 = current, negative = future
      this.lastP2Input = input;

      if (age > this.maxRollback) {
        this.onDesynced?.();
        continue;
      }

      if (age <= 0) {
        // Arrived early — park it until we reach that frame
        this.futureInputs.set(frame, input);
        continue;
      }

      // Past frame: check whether p2's input differs from what we predicted
      const slot = this.slots[frame % this.maxRollback]!;
      if (slot.frameNumber === frame && slot.p2Confirmed && slot.p2Input === input) {
        continue; // prediction was correct, nothing to do
      }

      slot.p2Input = input;
      slot.p2Confirmed = true;

      // Restore the state that existed before frame `frame` was simulated
      this.loadState(slot.state);

      // Re-simulate every frame from the rollback point up to the present
      for (let f = frame; f < this.currentFrame; f++) {
        const s = this.slots[f % this.maxRollback]!;
        // Save state before simulating f (skip the rollback frame — its state is already correct)
        if (f > frame) s.state = this.saveState();
        this.simulate(s.p1Input, s.p2Input);
      }
    }

    // Resolve p2 input for this frame: use confirmed early-arrived input, else predict
    const confirmedP2 = this.futureInputs.get(this.currentFrame);
    const p2Input = confirmedP2 !== undefined ? confirmedP2 : this.lastP2Input;
    if (confirmedP2 !== undefined) this.futureInputs.delete(this.currentFrame);

    // Save state BEFORE simulating this frame so rollback can restore it
    const slot = this.slots[this.currentFrame % this.maxRollback]!;
    slot.frameNumber = this.currentFrame;
    slot.state = this.saveState();
    slot.p1Input = localInput;
    slot.p2Input = p2Input;
    slot.p2Confirmed = confirmedP2 !== undefined;

    this.simulate(localInput, p2Input);

    // Broadcast local input to the relay
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint32(0, this.currentFrame, true);
    view.setUint8(4, localInput);
    if (this.ws.readyState === 1 /* OPEN */) this.ws.send(buf);

    this.currentFrame++;
  }

  destroy(): void {
    this.ws.removeEventListener("message", this.msgHandler);
  }
}
