import { useRef, useState } from 'react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { snapVectorTo45, squareVector, type Point } from '@/src/editor/tools/pointer';
import { DEFAULT_BLUR_STYLE } from '@/src/annotations/blur/blurStyle';
import { DEFAULT_MAGNIFY_STYLE, MAGNIFY_DEFAULT_SIZE } from '@/src/annotations/magnify/magnifyStyle';
import { DEFAULT_SPOTLIGHT_STYLE } from '@/src/annotations/spotlight/spotlightStyle';
import { canvasBoxes, snapThreshold } from '@/src/editor/smart/canvasBoxes';
import { boxAtPoint, expandRect, snapRect, type Rect, type SnapGuide } from '@/src/editor/smart/snap';
import type { EditorObject, EditorObjectType } from '@/src/shared/types';

/** Drag-to-create tools. */
export type DrawableTool = 'rectangle' | 'ellipse' | 'arrow' | 'highlight' | 'blur' | 'magnify' | 'spotlight';

export const DRAWABLE_TOOLS = new Set<string>([
  'rectangle',
  'ellipse',
  'arrow',
  'highlight',
  'blur',
  'magnify',
  'spotlight',
]);

/** Tools that can frame a page element with a single click. */
export const FRAMING_TOOLS = new Set<string>(['rectangle', 'ellipse', 'highlight', 'blur', 'spotlight']);

const OBJECT_TYPE_BY_TOOL: Record<DrawableTool, EditorObjectType> = {
  rectangle: 'shape',
  ellipse: 'ellipse',
  arrow: 'arrow',
  highlight: 'highlight',
  blur: 'blur',
  magnify: 'magnify',
  spotlight: 'spotlight',
};

/** Minimum drag distance (screen px) before a drag counts as drawing rather than a click. */
const MIN_DRAW_SCREEN_PX = 4;

/** `strokeWidth` is in source-page CSS px; `unit` converts it (and blur strength) to image px. */
function styleFor(tool: DrawableTool, color: string, strokeWidth: number, unit: number): Record<string, unknown> {
  switch (tool) {
    case 'arrow':
      return { stroke: color, strokeWidth: strokeWidth * unit };
    case 'highlight':
      return { color };
    case 'blur':
      return { ...DEFAULT_BLUR_STYLE, strength: Math.round(DEFAULT_BLUR_STYLE.strength * unit) };
    case 'magnify':
      return { ...DEFAULT_MAGNIFY_STYLE, color, ringWidth: DEFAULT_MAGNIFY_STYLE.ringWidth * unit };
    case 'spotlight':
      return { ...DEFAULT_SPOTLIGHT_STYLE, radius: Math.round(DEFAULT_SPOTLIGHT_STYLE.radius * unit) };
    case 'rectangle':
    case 'ellipse':
    default:
      return { stroke: color, strokeWidth: strokeWidth * unit, fillMode: 'none', cornerRadius: 0 };
  }
}

/** The page element under `point`, when magnetic drawing is on and the capture has a page snapshot. */
export function frameTargetAt(point: Point, bypass: boolean): Rect | null {
  const { snapEnabled, pageData, objects, unit } = useEditorStore.getState();
  if (!snapEnabled || bypass || !pageData) return null;
  return boxAtPoint(point.x, point.y, canvasBoxes(pageData, objects), 12 * unit);
}

/**
 * Click-drag creation of a new shape. The in-progress shape is a local
 * draft (rendered with the same component as the final object, so the
 * preview is exact) and only committed to the store - one undo step - on
 * release, so dragging never spams the history.
 *
 * Page-aware: while dragging, edges snap to the captured page's elements
 * (with guide lines); a plain click frames the element under the pointer.
 * Holding Alt bypasses both.
 */
export function useShapeDrawingTool(activeTool: DrawableTool | null) {
  const addObject = useEditorStore((state) => state.addObject);
  const [draft, setDraft] = useState<EditorObject | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const startRef = useRef<Point | null>(null);
  const draftRef = useRef<EditorObject | null>(null);
  const bypassRef = useRef(false);

  function updateDraft(next: EditorObject | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function begin(pos: Point, bypassSnap = false) {
    if (!activeTool) return;
    const { annotationColor, strokeWidth, unit } = useEditorStore.getState();
    startRef.current = pos;
    bypassRef.current = bypassSnap;
    updateDraft({
      id: crypto.randomUUID(),
      type: OBJECT_TYPE_BY_TOOL[activeTool],
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      style: styleFor(activeTool, annotationColor, strokeWidth, unit),
    });
  }

  function move(pos: Point, constrain: boolean, bypassSnap = false) {
    const start = startRef.current;
    const current = draftRef.current;
    if (!activeTool || !start || !current) return;
    bypassRef.current = bypassSnap;

    let dx = pos.x - start.x;
    let dy = pos.y - start.y;
    // Lenses are drawn as circles.
    if (constrain || activeTool === 'magnify') {
      ({ dx, dy } = activeTool === 'arrow' ? snapVectorTo45(dx, dy) : squareVector(dx, dy));
    }

    if (activeTool === 'arrow') {
      updateDraft({ ...current, x: start.x, y: start.y, width: dx, height: dy });
      return;
    }

    let rect: Rect = {
      x: Math.min(start.x, start.x + dx),
      y: Math.min(start.y, start.y + dy),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
    const { snapEnabled, pageData, objects, zoom } = useEditorStore.getState();
    let nextGuides: SnapGuide[] = [];
    // Shift (square) wins over snapping; Alt bypasses it. Lenses never snap.
    if (snapEnabled && pageData && !constrain && !bypassSnap && activeTool !== 'magnify') {
      const snapped = snapRect(rect, canvasBoxes(pageData, objects), snapThreshold(zoom));
      rect = snapped.rect;
      nextGuides = snapped.guides;
    }
    setGuides(nextGuides);
    updateDraft({ ...current, ...rect });
  }

  function end() {
    const current = draftRef.current;
    const start = startRef.current;
    const { zoom, unit } = useEditorStore.getState();
    const minSize = MIN_DRAW_SCREEN_PX / zoom;
    const isClick = current && Math.abs(current.width) < minSize && Math.abs(current.height) < minSize;

    if (current && !isClick) {
      addObject(current);
    } else if (current && start && activeTool === 'magnify') {
      // A click drops a lens of the default size, centered on the pointer.
      const size = MAGNIFY_DEFAULT_SIZE * unit;
      addObject(
        { ...current, x: start.x - size / 2, y: start.y - size / 2, width: size, height: size },
        { animate: true },
      );
    } else if (current && start && activeTool && FRAMING_TOOLS.has(activeTool)) {
      // A click frames the element under the pointer.
      const target = frameTargetAt(start, bypassRef.current);
      if (target) {
        const style = current.style ?? {};
        const outset =
          activeTool === 'rectangle' || activeTool === 'ellipse'
            ? Number(style.strokeWidth ?? 0) / 2 + 3 * unit
            : activeTool === 'spotlight'
              ? 6 * unit
              : 0;
        addObject({ ...current, ...expandRect(target, outset) }, { animate: true });
      }
    }
    startRef.current = null;
    setGuides([]);
    updateDraft(null);
  }

  return { draft, guides, begin, move, end };
}
