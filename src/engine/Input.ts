const held    = new Set<string>();
const pressed  = new Set<string>();
const released = new Set<string>();

const PREVENT = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"]);

window.addEventListener("keydown", (e) => {
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (PREVENT.has(e.code)) e.preventDefault();
});

window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  released.add(e.code);
});

export const Input = {
  isHeld(code: string):     boolean { return held.has(code); },
  isPressed(code: string):  boolean { return pressed.has(code); },
  isReleased(code: string): boolean { return released.has(code); },

  /** Build a bitmask from a { KeyCode: bitValue } map. */
  getBitmask(keyMap: Record<string, number>): number {
    let mask = 0;
    for (const code of held) {
      if (Object.prototype.hasOwnProperty.call(keyMap, code)) mask |= keyMap[code]!;
    }
    return mask;
  },

  /** Call once per render frame AFTER all game ticks have consumed pressed/released state. */
  flush(): void {
    pressed.clear();
    released.clear();
  },
};
