import { describe, expect, it } from 'vitest';
import { computeFitZoom, nextZoomStep, safeStagePixelRatio, zoomToPercent } from '@/src/editor/zoom';
import { fitsCanvasLimits, predictOutputSize } from '@/src/export/render';
import { buildExportFileName } from '@/src/export/png';
import { framedSize } from '@/src/export/layout';
import { deviceGeometry } from '@/src/mockups/geometry';
import { getMockupById, MOCKUPS } from '@/src/mockups/registry';
import { DEFAULT_BEAUTIFY_SETTINGS, NO_BACKGROUND, type BeautifySettings } from '@/src/editor/beautify/presets';

const withBackground: BeautifySettings = {
  ...DEFAULT_BEAUTIFY_SETTINGS,
  background: { type: 'solid', color: '#ffffff' },
};

describe('computeFitZoom', () => {
  const base = { viewportWidth: 1002, viewportHeight: 702, unit: 1, marginX: 0, marginY: 0 };
  const fit = (width: number, height: number, extra: Partial<Parameters<typeof computeFitZoom>[0]> = {}) =>
    computeFitZoom({
      ...base,
      framedWidth: width,
      framedHeight: height,
      contentWidth: width,
      contentHeight: height,
      ...extra,
    });

  it('fits both dimensions for normal screenshots', () => {
    expect(fit(2000, 1000)).toBeCloseTo(0.5);
    expect(fit(1400, 1400)).toBeCloseTo(0.5);
  });

  it('fits very tall (full-page) captures to width instead of shrinking to a sliver', () => {
    expect(fit(2000, 20_000)).toBeCloseTo(0.5);
  });

  it('never upscales past the source page size', () => {
    expect(fit(200, 100)).toBe(1);
    expect(fit(200, 100, { unit: 2 })).toBe(0.5);
  });

  it('fits the finished picture (frame and device included), not just the screenshot', () => {
    expect(fit(1000, 100, { framedWidth: 2000 })).toBeCloseTo(0.5);
  });

  it('keeps the layout margins and a little slack, so a scrollbar can never appear', () => {
    const zoom = fit(2000, 1000, { viewportWidth: 1066, marginX: 64 });
    expect(2000 * zoom).toBeLessThanOrEqual(1066 - 64 - 1);
  });
});

describe('framedSize', () => {
  it('is just the screenshot when no background or mockup is chosen', () => {
    expect(framedSize(1280, 800, 1, { ...DEFAULT_BEAUTIFY_SETTINGS, background: NO_BACKGROUND })).toEqual({
      width: 1280,
      height: 800,
    });
  });

  it('adds padding only once a background is chosen', () => {
    expect(framedSize(1280, 800, 2, { ...withBackground, padding: 40 })).toEqual({ width: 1440, height: 960 });
  });

  it('adds the device frame around the screenshot', () => {
    const browser = getMockupById('browser-minimal');
    const size = framedSize(1280, 800, 1, { ...DEFAULT_BEAUTIFY_SETTINGS, background: NO_BACKGROUND }, browser);
    expect(size.width).toBe(1280);
    expect(size.height).toBeGreaterThan(800);
  });
});

describe('deviceGeometry', () => {
  it('never crops or scales the screenshot: the screen is exactly the content size', () => {
    for (const mockup of MOCKUPS) {
      for (const [width, height] of [
        [1280, 800],
        [390, 844],
        [1280, 6000],
        [120, 80],
      ] as const) {
        const geometry = deviceGeometry(mockup.type, width, height, 1);
        expect(geometry.screen.width, mockup.id).toBe(width);
        expect(geometry.screen.height, mockup.id).toBe(height);
        expect(geometry.screen.x + width, mockup.id).toBeLessThanOrEqual(geometry.width);
        expect(geometry.screen.y + height, mockup.id).toBeLessThanOrEqual(geometry.height);
      }
    }
  });

  it('turns phones and tablets to landscape for wide screenshots', () => {
    expect(deviceGeometry('phone', 1280, 800, 1).orientation).toBe('landscape');
    expect(deviceGeometry('phone', 390, 844, 1).orientation).toBe('portrait');
    const landscape = deviceGeometry('phone', 1280, 800, 1);
    expect(landscape.camera?.cx).toBeLessThan(landscape.screen.x);
  });

  it('scales with the capture pixel ratio and export scale', () => {
    const at1x = deviceGeometry('laptop', 1000, 600, 1);
    const at2x = deviceGeometry('laptop', 2000, 1200, 2);
    expect(at2x.width).toBeCloseTo(at1x.width * 2);
    expect(at2x.height).toBeCloseTo(at1x.height * 2);
  });
});

describe('zoom steps', () => {
  it('moves to the next preset in either direction', () => {
    expect(nextZoomStep(100, 1)).toBe(125);
    expect(nextZoomStep(100, -1)).toBe(75);
    expect(nextZoomStep(80, -1)).toBe(75);
    expect(nextZoomStep(400, 1)).toBe(400);
  });

  it('reports percentages relative to the source page', () => {
    expect(zoomToPercent(0.5, 2)).toBe(100);
  });
});

describe('safeStagePixelRatio', () => {
  it('uses the screen DPR for normal stages', () => {
    expect(safeStagePixelRatio(1200, 800, 2)).toBe(2);
  });

  it('drops the ratio for huge stages so the canvas never exceeds browser limits', () => {
    const ratio = safeStagePixelRatio(1400, 26_000, 2);
    expect(26_000 * ratio).toBeLessThanOrEqual(16_384);
    expect(1400 * 26_000 * ratio * ratio).toBeLessThanOrEqual(64_000_000 + 1);
  });
});

describe('export sizing', () => {
  it('adds the frame padding in output pixels (capture DPR x export scale)', () => {
    const size = predictOutputSize({
      canvasWidth: 2000,
      canvasHeight: 1000,
      zoom: 0.3,
      unit: 2,
      exportScale: 2,
      beautify: { ...withBackground, padding: 40 },
    });
    expect(size).toEqual({ width: 4000 + 320, height: 2000 + 320 });
  });

  it('exports the screenshot untouched by default', () => {
    const size = predictOutputSize({
      canvasWidth: 2000,
      canvasHeight: 1000,
      zoom: 0.3,
      unit: 2,
      exportScale: 1,
      beautify: DEFAULT_BEAUTIFY_SETTINGS,
    });
    expect(size).toEqual({ width: 2000, height: 1000 });
  });

  it('flags outputs that exceed browser canvas limits', () => {
    expect(fitsCanvasLimits(4000, 3000)).toBe(true);
    expect(fitsCanvasLimits(5760, 64_000)).toBe(false);
    expect(fitsCanvasLimits(30_000, 30_000)).toBe(false);
  });
});

describe('buildExportFileName', () => {
  const createdAt = new Date(2026, 8, 4, 14, 32, 5).getTime();

  it('uses the host and a sortable local timestamp', () => {
    expect(buildExportFileName('https://www.example.com/a/b?c=1', createdAt)).toBe(
      'snapframe-example-com-2026-09-04-143205.png',
    );
  });

  it('falls back for missing or invalid URLs', () => {
    expect(buildExportFileName(undefined, createdAt, 'jpg')).toBe('snapframe-screenshot-2026-09-04-143205.jpg');
    expect(buildExportFileName('not a url', createdAt)).toBe('snapframe-screenshot-2026-09-04-143205.png');
  });
});
