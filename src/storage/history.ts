import { db, type CaptureRecord } from '@/src/storage/db';

/** Keep the most recent captures, evict the rest (with their autosaved edits). */
export const MAX_HISTORY_ITEMS = 30;

/** Call after every new capture is persisted - evicts the oldest rows past the cap. */
export async function pruneHistory(): Promise<void> {
  await db.transaction('rw', db.captures, db.projects, async () => {
    const count = await db.captures.count();
    if (count <= MAX_HISTORY_ITEMS) return;
    const oldestIds = await db.captures
      .orderBy('createdAt')
      .limit(count - MAX_HISTORY_ITEMS)
      .primaryKeys();
    await db.captures.bulkDelete(oldestIds);
    await db.projects.bulkDelete(oldestIds);
  });
}

export function listRecentCaptures(limit = 8): Promise<CaptureRecord[]> {
  return db.captures.orderBy('createdAt').reverse().limit(limit).toArray();
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
