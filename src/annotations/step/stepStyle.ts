import type { EditorObject } from '@/src/shared/types';

/** A numbered step badge ("1", "2", "3" ...) for walkthrough-style screenshots. */
export interface StepStyle {
  color: string;
  number: number;
}

export const DEFAULT_STEP_STYLE: StepStyle = { color: '#ff3b30', number: 1 };

/** Badge diameter in source-page CSS pixels (scaled by the capture's pixel ratio). */
export const STEP_BASE_SIZE = 32;

export function readStepStyle(style?: Record<string, unknown>): StepStyle {
  return { ...DEFAULT_STEP_STYLE, ...(style as Partial<StepStyle> | undefined) };
}

/** The next free number: one past the highest step already on the canvas. */
export function nextStepNumber(objects: EditorObject[]): number {
  let highest = 0;
  for (const object of objects) {
    if (object.type !== 'step') continue;
    highest = Math.max(highest, readStepStyle(object.style).number);
  }
  return highest + 1;
}
