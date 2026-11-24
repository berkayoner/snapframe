import { db, type CaptureRecord } from '@/src/storage/db';
import { loadSettings } from '@/src/shared/settings';
import { thumbnailFromBlob } from '@/src/storage/thumbnails';

/**
 * Call after every new capture is persisted: keeps the most recent captures
 * (the library size from the settings, unless `limit` is given) and evicts
 * the rest, with their autosaved edits.
 */
export async function pruneHistory(limit?: number): Promise<void> {
  const max = limit ?? (await loadSettings()).historyLimit;
  await db.transaction('rw', db.captures, db.projects, async () => {
    const count = await db.captures.count();
    if (count <= max) return;
    const oldestIds = await db.captures
      .orderBy('createdAt')
      .limit(count - max)
      .primaryKeys();
    await db.captures.bulkDelete(oldestIds);
    await db.projects.bulkDelete(oldestIds);
  });
}

export function listRecentCaptures(limit = 8): Promise<CaptureRecord[]> {
  return db.captures.orderBy('createdAt').reverse().limit(limit).toArray();
}

export interface CapturePreview {
  record: CaptureRecord;
  /** What to show on a card: the edited picture's thumbnail, else the capture's, else the capture itself. */
  image: Blob;
  edited: boolean;
}

export async function withPreviews(records: CaptureRecord[]): Promise<CapturePreview[]> {
  const projects = await db.projects.bulkGet(records.map((record) => record.captureId));
  return records.map((record, index) => {
    const edited = projects[index]?.thumbnail;
    return { record, image: edited ?? record.thumbnail ?? record.blob, edited: !!edited };
  });
}

/** Captures saved before thumbnails existed get one, one at a time, in the background. */
export async function backfillThumbnails(records: CaptureRecord[]): Promise<void> {
  for (const record of records) {
    if (record.thumbnail) continue;
    const thumbnail = await thumbnailFromBlob(record.blob);
    if (thumbnail) await db.captures.update(record.captureId, { thumbnail }).catch(() => undefined);
  }
}

export function listAllCaptures(): Promise<CaptureRecord[]> {
  return db.captures.orderBy('createdAt').reverse().toArray();
}

/** Deletes a capture and its autosaved edits. */
export async function deleteCapture(captureId: string): Promise<void> {
  await db.transaction('rw', db.captures, db.projects, async () => {
    await db.captures.delete(captureId);
    await db.projects.delete(captureId);
  });
}

export async function clearAllCaptures(): Promise<void> {
  await db.transaction('rw', db.captures, db.projects, async () => {
    await db.captures.clear();
    await db.projects.clear();
  });
}
