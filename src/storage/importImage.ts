import { persistCapture } from '@/src/capture/persist';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '@/src/capture/geometry';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export class ImportError extends Error {
  constructor(readonly reason: 'unsupported' | 'too-large' | 'unreadable') {
    super(reason);
  }
}

/**
 * Brings an existing image (file picker, drag & drop, clipboard paste) into
 * SnapFrame so it can be annotated and framed like a capture. Stored with
 * a pixel ratio of 1 - an imported file has no "source page" scale.
 */
export async function importImageBlob(blob: Blob, name?: string): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(blob.type)) throw new ImportError('unsupported');

  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    throw new ImportError('unreadable');
  }
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA) {
    throw new ImportError('too-large');
  }

  const title = name?.replace(/\.[a-z0-9]+$/i, '');
  const payload = await persistCapture(blob, { width, height, devicePixelRatio: 1 }, { type: 'upload', title });
  return payload.captureId;
}
