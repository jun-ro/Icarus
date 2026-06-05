import { Application } from "pixi.js";
import type { Scene } from "./Scene.ts";

export interface EngineOptions {
  width:       number;
  height:      number;
  background?: number;
}

export class Engine {
  readonly app: Application;
  private scene: Scene | null = null;
  private readonly opts: EngineOptions;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.app = new Application();
  }

  async mount(container: HTMLElement): Promise<void> {
    const dpr   = window.devicePixelRatio || 1;
    const scale = Math.max(
      window.innerWidth  / this.opts.width,
      window.innerHeight / this.opts.height,
    );

    await this.app.init({
      width:       this.opts.width,
      height:      this.opts.height,
      background:  this.opts.background ?? 0x0d1117,
      antialias:   true,
      // Buffer = game_size × resolution = game_size × scale × dpr ≈ screen physical pixels
      resolution:  scale * dpr,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas);
    this.app.ticker.add((ticker) => {
      if (this.scene) this.scene._update(ticker.deltaMS / 1000);
    });
  }

  loadScene(scene: Scene): void {
    if (this.scene) this.scene._destroy();
    this.scene = scene;
    scene._init(this);
  }

  get width():  number { return this.opts.width;  }
  get height(): number { return this.opts.height; }
}
