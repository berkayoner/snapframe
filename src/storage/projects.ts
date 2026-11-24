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

export async function saveProject(captureId: string, state: ProjectState): Promise<void> {
  await db.projects.put({ captureId, updatedAt: Date.now(), ...state });
}

export async function loadProject(captureId: string): Promise<ProjectState | undefined> {
  const record = await db.projects.get(captureId);
  if (!record) return undefined;
  const { canvasWidth, canvasHeight, objects, beautify, mockupId } = record;
  return { canvasWidth, canvasHeight, objects, beautify, mockupId };
}
