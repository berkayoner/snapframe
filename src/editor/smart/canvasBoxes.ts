import type { EditorObject } from '@/src/shared/types';
import type { PageData, SensitiveRegion } from '@/src/editor/smart/pageData';
import type { Rect } from '@/src/editor/smart/snap';

/**
 * Page boxes and sensitive regions in *canvas* coordinates: the snapshot is
 * relative to the screenshot, and the screenshot moves on the canvas after
 * a crop, so add its current offset. Cached - called on every pointer move.
 */
let boxCache: { data: PageData; dx: number; dy: number; boxes: Rect[] } | null = null;

function imageOffset(objects: EditorObject[]): { dx: number; dy: number } {
  const image = objects.find((object) => object.type === 'image');
  return { dx: image?.x ?? 0, dy: image?.y ?? 0 };
}

export function canvasBoxes(pageData: PageData | null, objects: EditorObject[]): Rect[] {
  if (!pageData) return [];
  const { dx, dy } = imageOffset(objects);
  if (boxCache && boxCache.data === pageData && boxCache.dx === dx && boxCache.dy === dy) return boxCache.boxes;
  const boxes = pageData.boxes.map((box) => ({ ...box, x: box.x + dx, y: box.y + dy }));
  boxCache = { data: pageData, dx, dy, boxes };
  return boxes;
}

export function canvasSensitive(pageData: PageData | null, objects: EditorObject[]): SensitiveRegion[] {
  if (!pageData) return [];
  const { dx, dy } = imageOffset(objects);
  return pageData.sensitive.map((region) => ({ ...region, x: region.x + dx, y: region.y + dy }));
}

/** Snap distance in image px: a constant feel on screen at any zoom. */
export function snapThreshold(zoom: number): number {
  return 8 / Math.max(0.05, zoom);
}
