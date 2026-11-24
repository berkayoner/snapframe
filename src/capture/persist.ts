import { db } from '@/src/storage/db';
import { pruneHistory } from '@/src/storage/history';
import type { CapturePayload, CaptureSource, CaptureWarning } from '@/src/shared/types';
import type { PageSnapshot } from '@/src/capture/snapshot/types';

/**
 * Shared final step for every capture mode (and image imports): write the
 * finished image straight to IndexedDB - never through
 * chrome.runtime.sendMessage, see src/storage/db.ts - and hand back the
 * small metadata payload the editor needs to load it.
 */
export async function persistCapture(
  blob: Blob,
  image: { width: number; height: number; devicePixelRatio: number },
  source: CaptureSource,
  extras: { warnings?: CaptureWarning[]; snapshot?: PageSnapshot } = {},
): Promise<CapturePayload> {
  const { warnings, snapshot } = extras;
  const captureId = crypto.randomUUID();
  const createdAt = Date.now();

  await db.captures.add({
    captureId,
    createdAt,
    blob,
    width: image.width,
    height: image.height,
    devicePixelRatio: image.devicePixelRatio,
    sourceUrl: source.url,
    sourceTitle: source.title,
    sourceType: source.type,
    warnings,
    snapshot,
  });
  await pruneHistory();

  return { captureId, createdAt, image, source, warnings };
}
