import { contrastTextColor } from '@/src/annotations/color';
import { hasTextBackground, readTextData } from '@/src/annotations/text/textStyle';
import type { EditorObject } from '@/src/shared/types';

/** Object types whose main color can be changed from the palette. */
export function supportsColor(object: EditorObject): boolean {
  return ['shape', 'ellipse', 'arrow', 'text', 'step', 'highlight'].includes(object.type);
}

export function supportsStrokeWidth(object: EditorObject): boolean {
  return object.type === 'shape' || object.type === 'ellipse' || object.type === 'arrow';
}

/** Returns a style patch that recolors `object`, or null if the palette doesn't apply to it. */
export function colorPatch(object: EditorObject, color: string): Record<string, unknown> | null {
  const style = object.style ?? {};
  switch (object.type) {
    case 'shape':
    case 'ellipse':
    case 'arrow':
      return { ...style, stroke: color };
    case 'step':
    case 'highlight':
      return { ...style, color };
    case 'text': {
      const data = readTextData(style);
      // Labels recolor their background (keeping the text readable); plain text recolors the glyphs.
      return hasTextBackground(data)
        ? { ...data, backgroundColor: color, color: contrastTextColor(color) }
        : { ...data, color };
    }
    default:
      return null;
  }
}

/** Returns the primary color of an object (what the palette should show as active). */
export function readObjectColor(object: EditorObject): string | undefined {
  const style = object.style ?? {};
  switch (object.type) {
    case 'shape':
    case 'ellipse':
    case 'arrow':
      return typeof style.stroke === 'string' ? style.stroke : undefined;
    case 'step':
    case 'highlight':
      return typeof style.color === 'string' ? style.color : undefined;
    case 'text': {
      const data = readTextData(style);
      return hasTextBackground(data) ? data.backgroundColor : data.color;
    }
    default:
      return undefined;
  }
}

/** Axis-aligned bounds, normalizing arrows (whose width/height may be negative vectors). */
export function objectBounds(object: EditorObject): { x: number; y: number; width: number; height: number } {
  const x = Math.min(object.x, object.x + object.width);
  const y = Math.min(object.y, object.y + object.height);
  return { x, y, width: Math.abs(object.width), height: Math.abs(object.height) };
}

export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
