/**
 * Pure capture math (unit-tested in tests/unit/capture-geometry.test.ts).
 */

/** Chrome canvas limits: 32,767px per side, 268,435,456 px total. Stay a little under both. */
export const MAX_CANVAS_SIDE = 32_000;
export const MAX_CANVAS_AREA = 260_000_000;

/**
 * Tallest full-page capture (in CSS px) whose stitched canvas still fits the
 * browser's limits at the given viewport width and pixel ratio. Both limits
 * are in *device* pixels, so the pixel ratio applies to width and height.
 */
export function maxCaptureCssHeight(viewportWidth: number, devicePixelRatio: number): number {
  const dpr = Math.max(0.1, devicePixelRatio);
  const deviceWidth = Math.max(1, viewportWidth * dpr);
  const byHeight = MAX_CANVAS_SIDE / dpr;
  const byArea = MAX_CANVAS_AREA / deviceWidth / dpr;
  return Math.floor(Math.min(byHeight, byArea));
}

/**
 * Scroll offsets for each slice: 0, vh, 2vh, ... with the final step flush
 * against the bottom (it may overlap the previous slice - later slices are
 * drawn over earlier ones, so the overlap is harmless).
 */
export function buildScrollSteps(totalHeight: number, viewportHeight: number): number[] {
  if (viewportHeight <= 0 || totalHeight <= viewportHeight) return [0];
  const steps: number[] = [];
  let y = 0;
  while (y < totalHeight - viewportHeight) {
    steps.push(y);
    y += viewportHeight;
  }
  steps.push(totalHeight - viewportHeight);
  return steps;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converts a viewport-relative CSS rect to bitmap pixels and clamps it to the bitmap's bounds. */
export function toDevicePixelRect(rect: PixelRect, scale: number, maxWidth: number, maxHeight: number): PixelRect {
  const left = Math.min(maxWidth, Math.max(0, Math.round(rect.x * scale)));
  const top = Math.min(maxHeight, Math.max(0, Math.round(rect.y * scale)));
  const right = Math.min(maxWidth, Math.max(left, Math.round((rect.x + rect.width) * scale)));
  const bottom = Math.min(maxHeight, Math.max(top, Math.round((rect.y + rect.height) * scale)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
