import type { EditorObject } from '@/src/shared/types';

/**
 * Drawing layers, bottom to top: the screenshot, redactions, spotlights,
 * then every other annotation. Redactions sit directly on the screenshot so
 * a spotlight dims them like the rest of the page, and annotations stay
 * above the dimming so arrows and labels outside a spotlight remain bright.
 * Within a layer, the document order (front/back) applies.
 */
export function renderRank(object: EditorObject): number {
  switch (object.type) {
    case 'image':
      return 0;
    case 'blur':
      return 1;
    case 'spotlight':
      return 2;
    default:
      return 3;
  }
}

/** Objects in the order they are drawn (stable within each layer). */
export function renderOrder<T extends EditorObject>(objects: T[]): T[] {
  return objects
    .map((object, index) => ({ object, index, rank: renderRank(object) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.object);
}
