import { describe, expect, it } from 'vitest';
import { contrastTextColor, hexToRgba, isLightColor } from '@/src/annotations/color';
import { readBlurStyle } from '@/src/annotations/blur/blurStyle';
import { resolveShapeFill } from '@/src/annotations/shapes/shapeStyle';
import { resolveHighlightFill } from '@/src/annotations/highlight/highlightStyle';
import { nextStepNumber } from '@/src/annotations/step/stepStyle';
import { colorPatch, objectBounds, rectsIntersect } from '@/src/annotations/styleOps';
import { dragRect, fitRatioRect } from '@/src/editor/tools/crop.tool';
import { snapVectorTo45, squareVector } from '@/src/editor/tools/pointer';
import { sanitizeBeautify, DEFAULT_BEAUTIFY_SETTINGS } from '@/src/editor/beautify/presets';
import type { EditorObject } from '@/src/shared/types';

describe('colors', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#ff3b30', 0.5)).toBe('rgba(255, 59, 48, 0.5)');
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('picks readable text colors', () => {
    expect(isLightColor('#ffcc00')).toBe(true);
    expect(contrastTextColor('#ffcc00')).toBe('#111111');
    expect(contrastTextColor('#007aff')).toBe('#ffffff');
  });
});

describe('styles stay compatible with projects saved by older versions', () => {
  it('treats blur objects without a mode as blur', () => {
    expect(readBlurStyle({ strength: 18 }).mode).toBe('blur');
    expect(readBlurStyle(undefined).mode).toBe('pixelate');
  });

  it('honors legacy explicit fills', () => {
    expect(resolveShapeFill({ fill: 'rgba(255, 59, 48, 0.12)', stroke: '#ff3b30' })).toBe('rgba(255, 59, 48, 0.12)');
    expect(resolveShapeFill({ stroke: '#ff3b30', fillMode: 'none' })).toBeUndefined();
    expect(resolveShapeFill({ stroke: '#ff3b30', fillMode: 'solid' })).toBe('#ff3b30');
    expect(resolveHighlightFill({ fill: 'rgba(255, 224, 0, 0.35)' })).toBe('rgba(255, 224, 0, 0.35)');
  });

  it('sanitizes stored frame settings', () => {
    expect(sanitizeBeautify({ padding: 9999, radius: -5, shadow: 'huge', background: { type: 'nope' } })).toEqual({
      ...DEFAULT_BEAUTIFY_SETTINGS,
      padding: 160,
      radius: 0,
    });
  });
});

describe('step numbers', () => {
  it('continues after the highest existing step', () => {
    const steps: EditorObject[] = [3, 1].map((number, index) => ({
      id: `s${index}`,
      type: 'step',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      style: { number },
    }));
    expect(nextStepNumber(steps)).toBe(4);
    expect(nextStepNumber([])).toBe(1);
  });
});

describe('selection geometry', () => {
  it('normalizes arrows with negative vectors', () => {
    const arrow: EditorObject = { id: 'a', type: 'arrow', x: 100, y: 100, width: -50, height: -20 };
    expect(objectBounds(arrow)).toEqual({ x: 50, y: 80, width: 50, height: 20 });
    expect(rectsIntersect(objectBounds(arrow), { x: 0, y: 0, width: 60, height: 90 })).toBe(true);
    expect(rectsIntersect(objectBounds(arrow), { x: 0, y: 0, width: 40, height: 40 })).toBe(false);
  });

  it('only recolors objects the palette applies to', () => {
    const blur: EditorObject = { id: 'b', type: 'blur', x: 0, y: 0, width: 1, height: 1 };
    expect(colorPatch(blur, '#000000')).toBeNull();
  });
});

describe('drawing constraints', () => {
  it('snaps arrows to 45 degrees', () => {
    const { dx, dy } = snapVectorTo45(100, 10);
    expect(dy).toBeCloseTo(0);
    expect(dx).toBeCloseTo(Math.hypot(100, 10));
  });

  it('squares boxes in the drag direction', () => {
    expect(squareVector(-30, 10)).toEqual({ dx: -30, dy: 30 });
  });
});

describe('crop helpers', () => {
  it('fits the largest centered rect of a ratio', () => {
    expect(fitRatioRect(1, 400, 200)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
  });

  it('locks drags to the chosen ratio and clamps to the canvas', () => {
    const rect = dragRect({ x: 10, y: 10 }, { x: 170, y: 30 }, 16 / 9, 1000, 1000);
    expect(rect.width / rect.height).toBeCloseTo(16 / 9);
    const clamped = dragRect({ x: 900, y: 900 }, { x: 1200, y: 1300 }, null, 1000, 1000);
    expect(clamped).toEqual({ x: 900, y: 900, width: 100, height: 100 });
  });
});
