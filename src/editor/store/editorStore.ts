import { create } from 'zustand';
import type { EditorObject } from '@/src/shared/types';
import { sanitizeBeautify, type BeautifySettings } from '@/src/editor/beautify/presets';
import { colorPatch, supportsStrokeWidth } from '@/src/annotations/styleOps';
import { loadPrefs, savePrefs } from '@/src/shared/prefs';
import type { PageData } from '@/src/editor/smart/pageData';

interface HistorySnapshot {
  objects: EditorObject[];
  selectedIds: string[];
  canvasWidth: number;
  canvasHeight: number;
}

export type EditorTool =
  | 'select'
  | 'crop'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'step'
  | 'magnify'
  | 'spotlight'
  | 'highlight'
  | 'blur';

export type ZoomMode = 'fit' | 'manual';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorStore {
  objects: EditorObject[];
  selectedIds: string[];
  /** Current scene size in image pixels - starts as the capture's size, shrinks after a crop. */
  canvasWidth: number;
  canvasHeight: number;
  /**
   * Image pixels per source-page CSS pixel (the capture's devicePixelRatio).
   * Default stroke widths, font sizes and frame padding are multiplied by
   * it so annotations look equally heavy on 1x and 2x captures.
   */
  unit: number;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  clipboard: EditorObject[];
  /** While set, `updateObjects` calls with the same coalesce key extend one undo step (e.g. a slider drag). */
  coalesceKey: string | null;

  // UI-only state below - never part of undo history.
  activeTool: EditorTool;
  /** Id of the text object currently open in the inline textarea editor, if any. */
  editingTextId: string | null;
  beautify: BeautifySettings;
  /** Selected device mockup id, or null for none. */
  mockupId: string | null;
  /** Default color/stroke for new annotations (remembered between sessions). */
  annotationColor: string;
  strokeWidth: number;
  /** Screen CSS pixels per image pixel. */
  zoom: number;
  zoomMode: ZoomMode;
  /** True while a frame slider is being dragged: fit-to-screen holds its zoom until release. */
  fitLocked: boolean;
  /** The captured page's element boxes and sensitive-data regions (null for imports / older captures). */
  pageData: PageData | null;
  /** Magnetic drawing: snap new shapes to page elements (hold Alt to bypass). Remembered. */
  snapEnabled: boolean;
  /** Objects that should play their entrance animation; `token` changes on every new batch. */
  entering: { ids: string[]; token: number };

  /** Replaces the whole scene (e.g. loading a capture). Resets history and selection. */
  initObjects: (objects: EditorObject[], canvasSize: { width: number; height: number }, unit?: number) => void;
  setPageData: (pageData: PageData | null) => void;
  setSnapEnabled: (enabled: boolean) => void;

  setActiveTool: (tool: EditorTool) => void;
  setEditingTextId: (id: string | null) => void;
  /** Updates the frame. `remember: false` (used when restoring a saved project) leaves the user's default untouched. */
  setBeautify: (partial: Partial<BeautifySettings>, options?: { remember?: boolean }) => void;
  setMockupId: (id: string | null) => void;
  setAnnotationColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setZoom: (zoom: number, mode?: ZoomMode) => void;
  setFitLocked: (locked: boolean) => void;

  select: (id: string, options?: { additive?: boolean }) => void;
  selectMany: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  /**
   * Adds one new object as a single undo step, and selects it. With
   * `coalesce`, the follow-up edit that completes it (e.g. typing a new
   * label's text) joins this same undo step.
   */
  addObject: (object: EditorObject, options?: { coalesce?: string; animate?: boolean }) => void;
  /** Adds several objects as one undo step (e.g. one-click redaction). */
  addObjects: (objects: EditorObject[], options?: { animate?: boolean; select?: boolean }) => void;
  /**
   * Removes a single object by id as a single undo step. If `coalesce`
   * matches the step that created it (an abandoned, still-empty label), the
   * creation is erased from history instead - no empty undo steps left behind.
   */
  removeObject: (id: string, options?: { coalesce?: string }) => void;
  /**
   * Applies one or more patches (e.g. after a drag/resize gesture ends) as a
   * single undo step. Pass `coalesce` for continuous edits (slider drags):
   * consecutive calls with the same key share one undo step until
   * `endCoalesce()` or any other edit.
   */
  updateObjects: (
    updates: Array<{ id: string; patch: Partial<EditorObject> }>,
    options?: { coalesce?: string },
  ) => void;
  endCoalesce: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
  deleteSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  duplicateSelection: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  /** Sets the palette color and recolors the current selection (one undo step). */
  applyColor: (color: string) => void;
  /** Sets the default stroke width and applies it to selected strokable objects (one undo step). */
  applyStrokeWidth: (width: number) => void;

  /** Shrinks the canvas to `rect` and re-bases every object's position to it, as one undo step. */
  applyCrop: (rect: CropRect) => void;

  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 100;
const PASTE_OFFSET = 16;
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

/** The base screenshot can't be selected, moved or deleted - only cropped. */
export function isLockedObject(object: EditorObject): boolean {
  return object.type === 'image';
}

function cloneObjects(objects: EditorObject[]): EditorObject[] {
  return objects.map((object) => ({ ...object }));
}

function snapshot(
  state: Pick<EditorStore, 'objects' | 'selectedIds' | 'canvasWidth' | 'canvasHeight'>,
): HistorySnapshot {
  return {
    objects: cloneObjects(state.objects),
    selectedIds: state.selectedIds,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
  };
}

function pushHistory(state: EditorStore): Pick<EditorStore, 'past' | 'future' | 'coalesceKey'> {
  return { past: [...state.past, snapshot(state)].slice(-MAX_HISTORY), future: [], coalesceKey: null };
}

function selectableIds(objects: EditorObject[], ids: Iterable<string>): string[] {
  const unlocked = new Set(objects.filter((object) => !isLockedObject(object)).map((object) => object.id));
  return Array.from(new Set(ids)).filter((id) => unlocked.has(id));
}

/** Index just above the last locked (base image) object - annotations can never go beneath the screenshot. */
function firstAnnotationIndex(objects: EditorObject[]): number {
  let index = 0;
  objects.forEach((object, i) => {
    if (isLockedObject(object)) index = i + 1;
  });
  return index;
}

const initialPrefs = loadPrefs();

export const useEditorStore = create<EditorStore>((set, get) => ({
  objects: [],
  selectedIds: [],
  canvasWidth: 0,
  canvasHeight: 0,
  unit: 1,
  past: [],
  future: [],
  clipboard: [],
  coalesceKey: null,
  activeTool: 'select',
  editingTextId: null,
  beautify: initialPrefs.beautify,
  mockupId: null,
  annotationColor: initialPrefs.annotationColor,
  strokeWidth: initialPrefs.strokeWidth,
  zoom: 1,
  zoomMode: 'fit',
  fitLocked: false,
  pageData: null,
  snapEnabled: initialPrefs.snapEnabled,
  entering: { ids: [], token: 0 },

  initObjects: (objects, canvasSize, unit = 1) =>
    set({
      objects: cloneObjects(objects),
      selectedIds: [],
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      unit: unit > 0 ? unit : 1,
      past: [],
      future: [],
      coalesceKey: null,
      editingTextId: null,
      activeTool: 'select',
      zoomMode: 'fit',
      entering: { ids: [], token: 0 },
    }),

  setPageData: (pageData) => set({ pageData }),
  setSnapEnabled: (enabled) => {
    savePrefs({ snapEnabled: enabled });
    set({ snapEnabled: enabled });
  },

  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      // Switching to a drawing tool drops the selection so new shapes aren't confused with old ones.
      selectedIds: tool === 'select' ? state.selectedIds : [],
    })),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setBeautify: (partial, options) =>
    set((state) => {
      const beautify = sanitizeBeautify({ ...state.beautify, ...partial });
      if (options?.remember !== false) savePrefs({ beautify });
      return { beautify };
    }),
  setMockupId: (id) => set({ mockupId: id }),
  setAnnotationColor: (color) => {
    savePrefs({ annotationColor: color });
    set({ annotationColor: color });
  },
  setStrokeWidth: (width) => {
    savePrefs({ strokeWidth: width });
    set({ strokeWidth: width });
  },
  setFitLocked: (locked) => set((state) => (state.fitLocked === locked ? {} : { fitLocked: locked })),
  setZoom: (zoom, mode = 'manual') => {
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), zoomMode: mode });
  },

  select: (id, options) =>
    set((state) => {
      if (selectableIds(state.objects, [id]).length === 0) return {};
      if (options?.additive) {
        const isSelected = state.selectedIds.includes(id);
        return {
          selectedIds: isSelected
            ? state.selectedIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedIds, id],
        };
      }
      return { selectedIds: [id] };
    }),

  selectMany: (ids) => set((state) => ({ selectedIds: selectableIds(state.objects, ids) })),

  selectAll: () =>
    set((state) => ({
      activeTool: 'select',
      selectedIds: selectableIds(
        state.objects,
        state.objects.map((object) => object.id),
      ),
    })),

  clearSelection: () => set((state) => (state.selectedIds.length === 0 ? {} : { selectedIds: [] })),

  addObject: (object, options) =>
    set((state) => ({
      objects: [...state.objects, object],
      selectedIds: isLockedObject(object) ? [] : [object.id],
      ...pushHistory(state),
      coalesceKey: options?.coalesce ?? null,
      ...(options?.animate ? { entering: { ids: [object.id], token: state.entering.token + 1 } } : {}),
    })),

  addObjects: (added, options) =>
    set((state) => {
      if (added.length === 0) return {};
      return {
        objects: [...state.objects, ...added],
        selectedIds: options?.select === false ? state.selectedIds : added.map((object) => object.id),
        ...pushHistory(state),
        ...(options?.animate
          ? { entering: { ids: added.map((object) => object.id), token: state.entering.token + 1 } }
          : {}),
      };
    }),

  removeObject: (id, options) =>
    set((state) => {
      if (!state.objects.some((object) => object.id === id)) return {};
      const objects = state.objects.filter((object) => object.id !== id);
      const selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      if (options?.coalesce && state.coalesceKey === options.coalesce) {
        return { objects, selectedIds, past: state.past.slice(0, -1), coalesceKey: null };
      }
      return { objects, selectedIds, ...pushHistory(state) };
    }),

  updateObjects: (updates, options) =>
    set((state) => {
      if (updates.length === 0) return {};
      const patchById = new Map(updates.map((update) => [update.id, update.patch]));
      const objects = state.objects.map((object) => {
        const patch = patchById.get(object.id);
        return patch ? { ...object, ...patch } : object;
      });
      const coalesce = options?.coalesce ?? null;
      if (coalesce && state.coalesceKey === coalesce) return { objects, future: [] };
      return { objects, ...pushHistory(state), coalesceKey: coalesce };
    }),

  endCoalesce: () => set((state) => (state.coalesceKey === null ? {} : { coalesceKey: null })),

  nudgeSelection: (dx, dy) =>
    set((state) => {
      if (state.selectedIds.length === 0) return {};
      const selected = new Set(state.selectedIds);
      const objects = state.objects.map((object) =>
        selected.has(object.id) && !isLockedObject(object) ? { ...object, x: object.x + dx, y: object.y + dy } : object,
      );
      return { objects, ...pushHistory(state) };
    }),

  deleteSelection: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return {};
      const selected = new Set(state.selectedIds);
      const objects = state.objects.filter((object) => !selected.has(object.id) || isLockedObject(object));
      return { objects, selectedIds: [], ...pushHistory(state) };
    }),

  copySelection: () =>
    set((state) => {
      const selected = new Set(state.selectedIds);
      const copied = state.objects.filter((object) => selected.has(object.id) && !isLockedObject(object));
      return copied.length === 0 ? {} : { clipboard: cloneObjects(copied) };
    }),

  paste: () =>
    set((state) => {
      if (state.clipboard.length === 0) return {};
      const offset = PASTE_OFFSET * state.unit;
      const pasted = state.clipboard.map((object) => ({
        ...object,
        id: crypto.randomUUID(),
        x: object.x + offset,
        y: object.y + offset,
      }));
      return {
        objects: [...state.objects, ...pasted],
        selectedIds: pasted.map((object) => object.id),
        // Paste again -> cascades further instead of stacking on the same spot.
        clipboard: pasted.map((object) => ({ ...object })),
        ...pushHistory(state),
        entering: { ids: pasted.map((object) => object.id), token: state.entering.token + 1 },
      };
    }),

  duplicateSelection: () => {
    get().copySelection();
    get().paste();
  },

  bringToFront: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return {};
      const selected = new Set(state.selectedIds);
      const rest = state.objects.filter((object) => !selected.has(object.id));
      const moved = state.objects.filter((object) => selected.has(object.id));
      return { objects: [...rest, ...moved], ...pushHistory(state) };
    }),

  sendToBack: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return {};
      const selected = new Set(state.selectedIds);
      const rest = state.objects.filter((object) => !selected.has(object.id));
      const moved = state.objects.filter((object) => selected.has(object.id));
      const insertAt = firstAnnotationIndex(rest);
      return { objects: [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)], ...pushHistory(state) };
    }),

  applyColor: (color) => {
    get().setAnnotationColor(color);
    const state = get();
    const selected = new Set(state.selectedIds);
    const updates = state.objects
      .filter((object) => selected.has(object.id))
      .map((object) => ({ id: object.id, style: colorPatch(object, color) }))
      .filter((update): update is { id: string; style: Record<string, unknown> } => update.style !== null)
      .map((update) => ({ id: update.id, patch: { style: update.style } }));
    if (updates.length > 0) state.updateObjects(updates);
  },

  applyStrokeWidth: (width) => {
    get().setStrokeWidth(width);
    const state = get();
    const selected = new Set(state.selectedIds);
    const updates = state.objects
      .filter((object) => selected.has(object.id) && supportsStrokeWidth(object))
      .map((object) => ({ id: object.id, patch: { style: { ...object.style, strokeWidth: width * state.unit } } }));
    if (updates.length > 0) state.updateObjects(updates);
  },

  applyCrop: (rect) =>
    set((state) => {
      if (rect.width < 1 || rect.height < 1) return {};
      const x = Math.round(rect.x);
      const y = Math.round(rect.y);
      // Objects (including the base image) simply shift by -x/-y; the
      // smaller canvas naturally clips anything now outside its bounds, so
      // nothing needs to be re-rasterized and the crop stays undoable.
      const objects = state.objects.map((object) => ({ ...object, x: object.x - x, y: object.y - y }));
      return {
        objects,
        selectedIds: [],
        canvasWidth: Math.round(rect.width),
        canvasHeight: Math.round(rect.height),
        zoomMode: 'fit',
        ...pushHistory(state),
      };
    }),

  undo: () => {
    const state = get();
    const previous = state.past[state.past.length - 1];
    if (!previous) return;
    const current = snapshot(state);
    set({
      objects: previous.objects,
      selectedIds: previous.selectedIds,
      canvasWidth: previous.canvasWidth,
      canvasHeight: previous.canvasHeight,
      past: state.past.slice(0, -1),
      future: [...state.future, current].slice(-MAX_HISTORY),
      editingTextId: null,
      zoomMode: previous.canvasWidth !== state.canvasWidth ? 'fit' : state.zoomMode,
    });
  },

  redo: () => {
    const state = get();
    const next = state.future[state.future.length - 1];
    if (!next) return;
    const current = snapshot(state);
    set({
      objects: next.objects,
      selectedIds: next.selectedIds,
      canvasWidth: next.canvasWidth,
      canvasHeight: next.canvasHeight,
      past: [...state.past, current].slice(-MAX_HISTORY),
      future: state.future.slice(0, -1),
      editingTextId: null,
      zoomMode: next.canvasWidth !== state.canvasWidth ? 'fit' : state.zoomMode,
    });
  },
}));
