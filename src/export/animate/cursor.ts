import { cursorAt, easeOutCubic, type CursorPath, type Point, type Rect } from '@/src/export/animate/timeline';

/** A classic arrow pointer, tip at (0, 0), about 19 units tall. */
const ARROW: Array<[number, number]> = [
  [0, 0],
  [0, 16.2],
  [4.1, 12.4],
  [6.9, 18.9],
  [9.6, 17.8],
  [6.8, 11.4],
  [12.2, 11.4],
];
const ARROW_HEIGHT = 19;
const RIPPLE_SECONDS = 0.55;
/** Keep in sync with --sf-accent. */
const ACCENT = '122, 91, 255';

/**
 * Draws the virtual pointer (and its click ripples) on top of a finished
 * video frame. Positions come from the picture; the pointer is drawn in
 * output space so it stays crisp, growing only slightly as the camera zooms.
 */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  path: CursorPath,
  time: number,
  camera: Rect,
  pictureWidth: number,
  outWidth: number,
  outHeight: number,
): void {
  const state = cursorAt(path, time);
  if (state.opacity <= 0) return;
  const sx = outWidth / camera.width;
  const sy = outHeight / camera.height;
  const toOutput = (point: Point) => ({ x: (point.x - camera.x) * sx, y: (point.y - camera.y) * sy });
  const zoomLevel = pictureWidth / camera.width;
  const size = Math.max(14, Math.min(outWidth, outHeight) * 0.036) * zoomLevel ** 0.3;

  for (const click of path.clicks) {
    const age = time - click.time;
    if (age < 0 || age > RIPPLE_SECONDS) continue;
    const progress = age / RIPPLE_SECONDS;
    const at = toOutput(click.point);
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - progress) * state.opacity;
    ctx.beginPath();
    ctx.arc(at.x, at.y, size * (0.3 + 1.3 * easeOutCubic(progress)), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT}, 0.3)`;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.strokeStyle = `rgb(${ACCENT})`;
    ctx.stroke();
    ctx.restore();
  }

  const at = toOutput(state.point);
  const scale = (size / ARROW_HEIGHT) * (1 - 0.14 * state.pressed);
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.translate(at.x, at.y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ARROW.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.05;
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#16131f';
  ctx.fill();
  ctx.restore();
}
