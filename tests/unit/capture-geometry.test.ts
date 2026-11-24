import { describe, expect, it } from 'vitest';
import {
  buildScrollSteps,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  maxCaptureCssHeight,
  toDevicePixelRect,
} from '@/src/capture/geometry';

describe('buildScrollSteps', () => {
  it('captures a single slice when the page fits the viewport', () => {
    expect(buildScrollSteps(600, 800)).toEqual([0]);
    expect(buildScrollSteps(800, 800)).toEqual([0]);
  });

  it('steps by one viewport and ends flush with the bottom', () => {
    expect(buildScrollSteps(2000, 800)).toEqual([0, 800, 1200]);
    expect(buildScrollSteps(2400, 800)).toEqual([0, 800, 1600]);
  });

  it('never produces a step past the end of the page', () => {
    const steps = buildScrollSteps(10_001, 777);
    expect(steps.at(-1)).toBe(10_001 - 777);
    expect(Math.max(...steps)).toBeLessThanOrEqual(10_001 - 777);
  });
});

describe('maxCaptureCssHeight', () => {
  it('keeps the stitched canvas under the per-side limit on HiDPI screens', () => {
    const cssHeight = maxCaptureCssHeight(1440, 2);
    expect(cssHeight * 2).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });

  it('keeps the stitched canvas under the total area limit for wide viewports', () => {
    const width = 3840;
    const dpr = 2;
    const cssHeight = maxCaptureCssHeight(width, dpr);
    expect(width * dpr * cssHeight * dpr).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });

  it('allows much taller captures at 1x', () => {
    expect(maxCaptureCssHeight(1280, 1)).toBeGreaterThan(maxCaptureCssHeight(1280, 2));
  });
});

describe('toDevicePixelRect', () => {
  it('scales a CSS rect to bitmap pixels', () => {
    expect(toDevicePixelRect({ x: 10, y: 20, width: 100, height: 50 }, 2, 2000, 2000)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it('clamps to the bitmap bounds', () => {
    expect(toDevicePixelRect({ x: -10, y: 700, width: 100, height: 200 }, 1, 50, 800)).toEqual({
      x: 0,
      y: 700,
      width: 50,
      height: 100,
    });
  });

  it('handles fractional scales without gaps', () => {
    const rect = toDevicePixelRect({ x: 0.4, y: 0.4, width: 99.2, height: 49.6 }, 1.25, 4000, 4000);
    expect(rect.x + rect.width).toBe(Math.round(99.6 * 1.25));
  });
});

describe('measureCaptureScale', () => {
  it('derives the scale from the captured bitmap, not the reported DPR', async () => {
    const { measureCaptureScale } = await import('@/src/capture/visible');
    expect(measureCaptureScale(1280, 1280, 2)).toBe(1);
    expect(measureCaptureScale(2560, 1280, 1)).toBe(2);
    expect(measureCaptureScale(1920, 1536, 1)).toBe(1.25);
  });

  it('falls back to the reported ratio when the viewport is unknown', async () => {
    const { measureCaptureScale } = await import('@/src/capture/visible');
    expect(measureCaptureScale(2560, undefined, 2)).toBe(2);
    expect(measureCaptureScale(2560, 0, 0)).toBe(1);
  });
});
