/**
 * Typed messages between extension contexts (popup / on-page overlay /
 * extension pages <-> background). Image bytes never travel through these
 * messages - only small, structured-clone-safe values. Captured pixels go
 * straight to IndexedDB (see src/storage/db.ts) and are looked up by id.
 */

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How the on-page overlay selects: drag a rectangle, or click a page element. */
export type SelectionMode = 'area' | 'element';

export type RuntimeMessage =
  /** Popup -> background. DPR comes from the popup (same display as the tab); a service worker has no window. */
  | { type: 'capture-visible-area'; devicePixelRatio: number }
  /** Popup -> background: inject the selection overlay (drag an area, or pick an element) into the active tab. */
  | { type: 'start-area-selection'; mode?: SelectionMode }
  /** Overlay -> background, once the user has selected. `rect` is in CSS px relative to the viewport. */
  | { type: 'area-selected'; mode?: SelectionMode; rect: ViewportRect; devicePixelRatio: number; viewportWidth: number }
  /** Popup -> background: scroll-and-stitch the active tab. */
  | { type: 'start-full-page-capture' }
  /** Background -> any open extension page: full-page progress. */
  | { type: 'capture-progress'; done: number; total: number }
  /** In-page quick-action card -> background: open this capture in the editor, next to the tab. */
  | { type: 'open-editor'; captureId: string }
  /** Background -> offscreen document: make a blob URL for a stored capture (answers `{ url }`). */
  | { type: 'offscreen-blob-url'; captureId: string };

export type RuntimeMessageType = RuntimeMessage['type'];
export type MessageOf<T extends RuntimeMessageType> = Extract<RuntimeMessage, { type: T }>;

/** Every request the background answers resolves to one of these. Errors are already user-facing text. */
export type CaptureResponse = { ok: true; captureId?: string } | { ok: false; error: string };

export function isMessage<T extends RuntimeMessageType>(message: unknown, type: T): message is MessageOf<T> {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === type;
}
