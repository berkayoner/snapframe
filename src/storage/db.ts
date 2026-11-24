import Dexie, { type Table } from 'dexie';
import type { CapturePayload, CaptureSourceType, CaptureWarning, EditorObject } from '@/src/shared/types';
import type { BeautifySettings } from '@/src/editor/beautify/presets';
import type { PageSnapshot } from '@/src/capture/snapshot/types';

/**
 * Raw storage row for a capture. Image bytes live here as a Blob - they are
 * never sent through chrome.runtime.sendMessage (Chrome disables Blob
 * support in structured-clone messaging when a service worker is an
 * endpoint). Whichever context finishes producing the image writes it here
 * directly, and every other context reads it back by captureId.
 */
export interface CaptureRecord {
  captureId: string;
  createdAt: number;
  blob: Blob;
  width: number;
  height: number;
  devicePixelRatio: number;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType: CaptureSourceType;
  warnings?: CaptureWarning[];
  /** Element boxes + sensitive-data positions taken at capture time (absent for imports and older captures). */
  snapshot?: PageSnapshot;
  /** The browser viewport in CSS px, for full-page captures (sizes the scrolling video's "screen"). */
  viewport?: { width: number; height: number };
  /** Small preview for the library and popup (see src/storage/thumbnails.ts); added just after saving. */
  thumbnail?: Blob;
}

/**
 * Autosaved editor state for a capture, keyed 1:1 by captureId. Lets
 * closing/reopening the editor tab (or the whole browser) recover
 * in-progress edits rather than just the raw screenshot - see
 * src/storage/autosave.ts and src/storage/projects.ts.
 */
export interface ProjectRecord {
  captureId: string;
  updatedAt: number;
  canvasWidth: number;
  canvasHeight: number;
  objects: EditorObject[];
  beautify: BeautifySettings;
  mockupId: string | null;
  /** Preview of the edited picture (annotations, frame, mockup), refreshed by autosave. */
  thumbnail?: Blob;
}

/** Extension settings (see src/shared/settings.ts) - in IndexedDB so the service worker can read them too. */
export interface SettingsRecord {
  key: 'settings';
  value: unknown;
}

class SnapFrameDatabase extends Dexie {
  captures!: Table<CaptureRecord, string>;
  projects!: Table<ProjectRecord, string>;
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super('snapframe');
    this.version(1).stores({
      captures: 'captureId, createdAt',
    });
    this.version(2).stores({
      captures: 'captureId, createdAt',
      projects: 'captureId, updatedAt',
    });
    this.version(3).stores({
      captures: 'captureId, createdAt',
      projects: 'captureId, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new SnapFrameDatabase();

export function toCapturePayload(record: CaptureRecord): CapturePayload {
  return {
    captureId: record.captureId,
    createdAt: record.createdAt,
    image: {
      width: record.width,
      height: record.height,
      devicePixelRatio: record.devicePixelRatio,
    },
    source: {
      url: record.sourceUrl,
      title: record.sourceTitle,
      type: record.sourceType,
    },
    warnings: record.warnings,
  };
}
