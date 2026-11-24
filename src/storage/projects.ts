import { db } from '@/src/storage/db';
import type { EditorObject } from '@/src/shared/types';
import type { BeautifySettings } from '@/src/editor/beautify/presets';

export interface ProjectState {
  canvasWidth: number;
  canvasHeight: number;
  objects: EditorObject[];
  beautify: BeautifySettings;
  mockupId: string | null;
}

/** Saves the edits, with a fresh preview when one is given (otherwise the last preview is kept). */
export async function saveProject(captureId: string, state: ProjectState, thumbnail?: Blob): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const preview = thumbnail ?? (await db.projects.get(captureId))?.thumbnail;
    await db.projects.put({ captureId, updatedAt: Date.now(), ...state, thumbnail: preview });
  });
}

export async function saveProjectThumbnail(captureId: string, thumbnail: Blob): Promise<void> {
  await db.projects.update(captureId, { thumbnail });
}

export async function loadProject(captureId: string): Promise<ProjectState | undefined> {
  const record = await db.projects.get(captureId);
  if (!record) return undefined;
  const { canvasWidth, canvasHeight, objects, beautify, mockupId } = record;
  return { canvasWidth, canvasHeight, objects, beautify, mockupId };
}
