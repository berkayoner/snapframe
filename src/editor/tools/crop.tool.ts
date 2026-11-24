import { create } from 'zustand';
import type { CropRect } from '@/src/editor/store/editorStore';
import type { Point } from '@/src/editor/tools/pointer';

export const CROP_PRESETS: Array<{ id: string; label: string | null; ratio: number | null }> = [
  { id: 'free', label: null, ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

export const MIN_CROP_SIZE = 8;

export function clampRect(rect: CropRect, canvasWidth: number, canvasHeight: number): CropRect {
  const x = Math.max(0, Math.min(rect.x, canvasWidth));
  const y = Math.max(0, Math.min(rect.y, canvasHeight));
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.width, canvasWidth - x)),
    height: Math.max(0, Math.min(rect.height, canvasHeight - y)),
  };
}

/** Largest centered rect of the given aspect ratio that fits the canvas. */
export function fitRatioRect(ratio: number, canvasWidth: number, canvasHeight: number): CropRect {
  let width = canvasWidth;
  let height = width / ratio;
  if (height > canvasHeight) {
    height = canvasHeight;
    width = height * ratio;
  }
  return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}

/** Rect spanned by a drag from `start` to `pos`, optionally locked to `ratio`, clamped to the canvas. */
export function dragRect(
  start: Point,
  pos: Point,
  ratio: number | null,
  canvasWidth: number,
  canvasHeight: number,
): CropRect {
  let width = pos.x - start.x;
  let height = pos.y - start.y;
  if (ratio) {
    const signW = width < 0 ? -1 : 1;
    const signH = height < 0 ? -1 : 1;
    if (Math.abs(width) / ratio > Math.abs(height)) height = (Math.abs(width) / ratio) * signH;
    else width = Math.abs(height) * ratio * signW;
  }
  return clampRect(
    {
      x: Math.min(start.x, start.x + width),
      y: Math.min(start.y, start.y + height),
      width: Math.abs(width),
      height: Math.abs(height),
    },
    canvasWidth,
    canvasHeight,
  );
}

interface CropState {
  /** Pending crop, in image px. Empty until the user drags one (or picks a ratio preset). */
  rect: CropRect | null;
  ratio: number | null;
  dragStart: Point | null;
  open: () => void;
  close: () => void;
  setRect: (rect: CropRect | null) => void;
  setRatio: (ratio: number | null, canvasWidth: number, canvasHeight: number) => void;
  beginDrag: (pos: Point) => void;
  drag: (pos: Point, canvasWidth: number, canvasHeight: number) => void;
  endDrag: () => void;
}

/**
 * Pending-crop state, shared by the on-canvas crop layer (Konva) and the
 * floating crop bar (DOM). Nothing touches the document until Apply, which
 * commits one `applyCrop` - a single undo step.
 */
export const useCropStore = create<CropState>((set, get) => ({
  rect: null,
  ratio: null,
  dragStart: null,
  open: () => set({ rect: null, ratio: null, dragStart: null }),
  close: () => set({ rect: null, dragStart: null }),
  setRect: (rect) => set({ rect }),
  setRatio: (ratio, canvasWidth, canvasHeight) =>
    set({ ratio, rect: ratio ? fitRatioRect(ratio, canvasWidth, canvasHeight) : get().rect }),
  beginDrag: (pos) => set({ dragStart: pos, rect: { x: pos.x, y: pos.y, width: 0, height: 0 } }),
  drag: (pos, canvasWidth, canvasHeight) => {
    const { dragStart, ratio } = get();
    if (!dragStart) return;
    set({ rect: dragRect(dragStart, pos, ratio, canvasWidth, canvasHeight) });
  },
  endDrag: () => set({ dragStart: null }),
}));

export function isUsableCrop(rect: CropRect | null): rect is CropRect {
  return !!rect && rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE;
}
