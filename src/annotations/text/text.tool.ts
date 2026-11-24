import { useEditorStore } from '@/src/editor/store/editorStore';
import type { Point } from '@/src/editor/tools/pointer';
import { DEFAULT_TEXT_DATA } from '@/src/annotations/text/textStyle';
import { contrastTextColor } from '@/src/annotations/color';

/** Base font size in source-page CSS px; scaled by the capture's pixel ratio. */
const BASE_FONT_SIZE = 18;

/** Undo-coalescing key that ties a new label's creation to its first text commit. */
export function newTextCoalesceKey(id: string): string {
  return `text:${id}`;
}

/** Text tool: adds a label at the click point and opens it for editing right away. */
export function placeText(pos: Point): void {
  const store = useEditorStore.getState();
  const fontSize = Math.round(BASE_FONT_SIZE * store.unit);
  const id = crypto.randomUUID();
  store.addObject(
    {
      id,
      type: 'text',
      x: pos.x,
      y: pos.y - fontSize,
      width: fontSize * 8,
      height: fontSize * 2,
      style: {
        ...DEFAULT_TEXT_DATA,
        fontSize,
        padding: Math.round(fontSize * 0.45),
        cornerRadius: Math.round(fontSize * 0.35),
        backgroundColor: store.annotationColor,
        color: contrastTextColor(store.annotationColor),
      },
    },
    { coalesce: newTextCoalesceKey(id), animate: true },
  );
  // Return to Select so the next action (typing, then clicking away) edits rather than places more boxes.
  store.setActiveTool('select');
  store.select(id);
  store.setEditingTextId(id);
}
