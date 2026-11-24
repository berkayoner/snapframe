import { useEditorStore } from '@/src/editor/store/editorStore';
import { canvasSensitive } from '@/src/editor/smart/canvasBoxes';
import { expandRect, isCovered } from '@/src/editor/smart/snap';
import type { SensitiveRegion } from '@/src/editor/smart/pageData';
import { DEFAULT_BLUR_STYLE } from '@/src/annotations/blur/blurStyle';

/** Sensitive regions (canvas coordinates) that no redaction covers yet and that are still on the canvas. */
export function uncoveredSensitive(): SensitiveRegion[] {
  const { pageData, objects, canvasWidth, canvasHeight } = useEditorStore.getState();
  const redactions = objects.filter((object) => object.type === 'blur');
  return canvasSensitive(pageData, objects).filter(
    (region) =>
      region.x + region.width > 0 &&
      region.y + region.height > 0 &&
      region.x < canvasWidth &&
      region.y < canvasHeight &&
      !isCovered(region, redactions),
  );
}

/**
 * One-click redaction: pixelates every detected sensitive region that isn't
 * covered yet, as a single undo step (with a staggered entrance). Pixelate,
 * not blur - blocks can't be reversed into readable text.
 */
export function redactSensitive(): number {
  const regions = uncoveredSensitive();
  if (regions.length === 0) return 0;
  const { unit, addObjects } = useEditorStore.getState();
  addObjects(
    regions.map((region) => ({
      id: crypto.randomUUID(),
      type: 'blur' as const,
      ...expandRect(region, 2 * unit),
      style: { ...DEFAULT_BLUR_STYLE, mode: 'pixelate', strength: Math.round(8 * unit) },
    })),
    { animate: true, select: false },
  );
  return regions.length;
}
