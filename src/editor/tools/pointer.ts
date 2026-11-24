export interface Point {
  x: number;
  y: number;
}

/** Snaps a drag vector to the nearest 45 degrees (Shift while drawing arrows). */
export function snapVectorTo45(dx: number, dy: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { dx, dy };
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { dx: Math.cos(angle) * length, dy: Math.sin(angle) * length };
}

/** Forces a drag vector to a square (Shift while drawing boxes/ellipses). */
export function squareVector(dx: number, dy: number): { dx: number; dy: number } {
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { dx: Math.sign(dx || 1) * size, dy: Math.sign(dy || 1) * size };
}
