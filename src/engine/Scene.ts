import { Container } from "pixi.js";
import type { Engine } from "./Engine.ts";
import type { Entity } from "./Entity.ts";

export abstract class Scene {
  protected engine!: Engine;
  readonly container = new Container();
  private entities: Entity[] = [];

  /** @internal */
  _init(engine: Engine): void {
    this.engine = engine;
    engine.app.stage.addChild(this.container);
    this.onInit();
  }

  /** @internal */
  _update(dt: number): void {
    this.onUpdate(dt);
    for (const e of this.entities) e._update(dt);
  }

  /** @internal */
  _destroy(): void {
    this.onDestroy();
    for (const e of this.entities) e._destroy();
    this.entities = [];
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: false });
  }

  spawn<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    this.container.addChild(entity.container);
    if (this.engine) entity._init(this);
    return entity;
  }

  despawn(entity: Entity): void {
    this.entities = this.entities.filter(e => e !== entity);
    entity._destroy();
  }

  protected onInit(): void {}
  protected onUpdate(_dt: number): void {}
  protected onDestroy(): void {}
}
