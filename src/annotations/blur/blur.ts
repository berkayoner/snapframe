import type { RedactMode } from '@/src/annotations/blur/blurStyle';

export interface BlurRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SizedImageSource = CanvasImageSource & { width: number; height: number };

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  return [canvas, ctx];
}

/**
 * Renders a redacted copy of `rect` (in the source image's own pixel space),
 * sampled fresh from the original screenshot every time - never from a
 * previously-redacted bitmap - so moving/resizing a region always redacts
 * real pixels. The result is a new bitmap drawn *over* the screenshot, so
 * the exported image never contains the original pixels underneath.
 *
 * - `blur` blurs a padded region and crops back, so the filter doesn't fade
 *   to transparent at the selection edges.
 * - `pixelate` downsamples to blocks of `strength` pixels and scales back up
 *   without smoothing - the safer choice for text, since blocks can't be
 *   "un-blurred".
 */
export function renderRedactedRegion(
  source: SizedImageSource,
  rect: BlurRect,
  strength: number,
  mode: RedactMode,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  if (mode === 'pixelate') {
    const block = Math.max(2, Math.round(strength));
    const smallWidth = Math.max(1, Math.ceil(width / block));
    const smallHeight = Math.max(1, Math.ceil(height / block));
    const [small, smallCtx] = createCanvas(smallWidth, smallHeight);
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.imageSmoothingQuality = 'medium';
    smallCtx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, smallWidth, smallHeight);

    const [result, resultCtx] = createCanvas(width, height);
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.drawImage(small, 0, 0, smallWidth, smallHeight, 0, 0, smallWidth * block, smallHeight * block);
    return result;
  }

  const padding = Math.ceil(strength * 2);
  const srcX = Math.max(0, rect.x - padding);
  const srcY = Math.max(0, rect.y - padding);
  const srcRight = Math.min(source.width, rect.x + rect.width + padding);
  const srcBottom = Math.min(source.height, rect.y + rect.height + padding);
  const srcWidth = Math.max(1, srcRight - srcX);
  const srcHeight = Math.max(1, srcBottom - srcY);

  const [padded, paddedCtx] = createCanvas(srcWidth, srcHeight);
  paddedCtx.filter = `blur(${strength}px)`;
  paddedCtx.drawImage(source, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);

  const [result, resultCtx] = createCanvas(width, height);
  resultCtx.drawImage(padded, rect.x - srcX, rect.y - srcY, rect.width, rect.height, 0, 0, width, height);
  return result;
}
