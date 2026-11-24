import { useEditorStore } from '@/src/editor/store/editorStore';
import type { Point } from '@/src/editor/tools/pointer';
import { nextStepNumber, STEP_BASE_SIZE } from '@/src/annotations/step/stepStyle';

/** Step tool: each click adds the next numbered badge. The tool stays active for quick sequences. */
export function placeStep(pos: Point): void {
  const store = useEditorStore.getState();
  const size = Math.round(STEP_BASE_SIZE * store.unit);
  store.addObject(
    {
      id: crypto.randomUUID(),
      type: 'step',
      x: pos.x - size / 2,
      y: pos.y - size / 2,
      width: size,
      height: size,
      style: { color: store.annotationColor, number: nextStepNumber(store.objects) },
    },
    { animate: true },
  );
}
