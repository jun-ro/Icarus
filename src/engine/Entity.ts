import { Container } from "pixi.js";
import type { Scene } from "./Scene.ts";

export abstract class Entity {
  readonly container = new Container();
  protected scene!: Scene;

  get x(): number { return this.container.x; }
  set x(v: number) { this.container.x = v; }
  get y(): number { return this.container.y; }
  set y(v: number) { this.container.y = v; }

  /** @internal */
  _init(scene: Scene): void { this.scene = scene; this.onInit(); }
  /** @internal */
  _update(dt: number): void { this.onUpdate(dt); }
  /** @internal */
  _destroy(): void {
    this.onDestroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  protected onInit(): void {}
  protected onUpdate(_dt: number): void {}
  protected onDestroy(): void {}
}
