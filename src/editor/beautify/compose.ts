import { getShadowConfig, type BeautifyBackground, type BeautifySettings } from '@/src/editor/beautify/presets';

export function applyBackground(
  ctx: CanvasRenderingContext2D,
  background: BeautifyBackground,
  width: number,
  height: number,
): void {
  if (background.type === 'transparent' || background.type === 'none') return;

  if (background.type === 'solid') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // Matches CSS linear-gradient(<angle>deg): 0deg points up, angles run clockwise,
  // and the gradient line is long enough for the corners to reach the end colors.
  const angle = (background.angle * Math.PI) / 180;
  const dirX = Math.sin(angle);
  const dirY = -Math.cos(angle);
  const halfLength = (Math.abs(width * dirX) + Math.abs(height * dirY)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const gradient = ctx.createLinearGradient(
    cx - dirX * halfLength,
    cy - dirY * halfLength,
    cx + dirX * halfLength,
    cy + dirY * halfLength,
  );
  gradient.addColorStop(0, background.from);
  gradient.addColorStop(1, background.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  return [canvas, ctx];
}

/**
 * Composites the rendered editor content onto a padded / backgrounded /
 * shadowed frame - a presentation wrapper applied only at export time, so
 * annotation and crop tools never deal with padding offsets.
 *
 * `scale` converts the settings (source-page CSS px) to output pixels:
 * capture DPR x export scale.
 */
export function composeBeautifiedCanvas(
  content: HTMLCanvasElement,
  settings: BeautifySettings,
  scale: number,
): HTMLCanvasElement {
  const padding = Math.round(settings.padding * scale);
  const radius = Math.round(settings.radius * scale);
  const [canvas, ctx] = createCanvas(content.width + padding * 2, content.height + padding * 2);

  applyBackground(ctx, settings.background, canvas.width, canvas.height);

  const shadow = getShadowConfig(settings.shadow);
  if (shadow.alpha > 0 && padding > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${shadow.alpha})`;
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowOffsetY = shadow.offsetY * scale;
    roundedRectPath(ctx, padding, padding, content.width, content.height, radius);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundedRectPath(ctx, padding, padding, content.width, content.height, radius);
  ctx.clip();
  // Clear what the shadow pass painted under the content, so transparent
  // screenshots/corners don't show a black plate.
  ctx.clearRect(padding, padding, content.width, content.height);
  applyBackground(ctx, settings.background, canvas.width, canvas.height);
  ctx.drawImage(content, padding, padding);
  ctx.restore();

  return canvas;
}

/**
 * Frames an already-shaped image (e.g. a device mockup with transparent
 * corners): background + padding, with a drop shadow that follows the
 * image's own alpha instead of a rounded rect.
 */
export function composeFramedObject(
  content: HTMLCanvasElement,
  settings: BeautifySettings,
  scale: number,
): HTMLCanvasElement {
  const padding = Math.round(settings.padding * scale);
  const [canvas, ctx] = createCanvas(content.width + padding * 2, content.height + padding * 2);
  applyBackground(ctx, settings.background, canvas.width, canvas.height);

  const shadow = getShadowConfig(settings.shadow);
  ctx.save();
  if (shadow.alpha > 0) {
    ctx.shadowColor = `rgba(0, 0, 0, ${shadow.alpha})`;
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowOffsetY = shadow.offsetY * scale;
  }
  ctx.drawImage(content, padding, padding);
  ctx.restore();
  return canvas;
}

/** JPEG has no alpha: flatten onto white so transparent areas don't turn black. */
export function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(source.width, source.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}
