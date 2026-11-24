/**
 * Small previews for the library and the popup, so they never decode
 * full-size (possibly very tall, full-page) screenshots just to show a card.
 * Library cards are 16:10: thumbnails keep the top of taller images.
 */
export const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_ASPECT = 10 / 16;

export interface ThumbnailPlan {
  /** Source rect (always anchored at the top-left). */
  sourceWidth: number;
  sourceHeight: number;
  /** Output size (never upscaled). */
  width: number;
  height: number;
}

export function planThumbnail(width: number, height: number): ThumbnailPlan {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.min(Math.round(height), Math.round(sourceWidth * THUMBNAIL_ASPECT)));
  const scale = Math.min(1, THUMBNAIL_WIDTH / sourceWidth);
  return {
    sourceWidth,
    sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function encode(source: CanvasImageSource, plan: ThumbnailPlan): Promise<Blob> {
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, plan.sourceWidth, plan.sourceHeight, 0, 0, plan.width, plan.height);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
}

/** A thumbnail of an image file (works in pages and in the service worker). */
export async function thumbnailFromBlob(blob: Blob): Promise<Blob | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      return await encode(bitmap, planThumbnail(bitmap.width, bitmap.height));
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * A thumbnail of a rendered canvas (the editor's finished picture), made
 * synchronously so it can be saved together with the edits - even from a
 * tab that is closing.
 */
export function thumbnailFromCanvas(source: HTMLCanvasElement): Blob | undefined {
  try {
    const plan = planThumbnail(source.width, source.height);
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, plan.sourceWidth, plan.sourceHeight, 0, 0, plan.width, plan.height);
    const [header, base64 = ''] = canvas.toDataURL('image/webp', 0.86).split(',');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: /data:([^;]+)/.exec(header ?? '')?.[1] ?? 'image/png' });
  } catch {
    return undefined;
  }
}
