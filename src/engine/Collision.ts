export interface Rect { x: number; y: number; width: number; height: number; }

export const Collision = {
  overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
  },

  contains(r: Rect, px: number, py: number): boolean {
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
  },
};
