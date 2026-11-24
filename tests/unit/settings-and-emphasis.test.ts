import { describe, expect, it } from 'vitest';
import { renderOrder } from '@/src/annotations/order';
import { magnifySource, readMagnifyStyle } from '@/src/annotations/magnify/magnifyStyle';
import { readSpotlightStyle } from '@/src/annotations/spotlight/spotlightStyle';
import { colorPatch, readObjectColor, supportsColor } from '@/src/annotations/styleOps';
import { buildFileName, DEFAULT_FILE_NAME_TEMPLATE } from '@/src/export/fileName';
import { contentPlacement, framedSize } from '@/src/export/layout';
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/src/shared/settings';
import { DEFAULT_BEAUTIFY_SETTINGS, type BeautifySettings } from '@/src/editor/beautify/presets';
import { getMockupById, MOCKUPS } from '@/src/mockups/registry';
import type { EditorObject, EditorObjectType } from '@/src/shared/types';

const object = (id: string, type: EditorObjectType, style?: Record<string, unknown>): EditorObject => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style,
});

describe('drawing order', () => {
  it('keeps redactions on the screenshot, spotlights above them and annotations on top', () => {
    const objects = [
      object('arrow', 'arrow'),
      object('spot', 'spotlight'),
      object('image', 'image'),
      object('label', 'text'),
      object('blur', 'blur'),
      object('lens', 'magnify'),
    ];
    expect(renderOrder(objects).map((entry) => entry.id)).toEqual(['image', 'blur', 'spot', 'arrow', 'label', 'lens']);
  });

  it('keeps the document order within a layer', () => {
    const objects = [object('b', 'blur'), object('a', 'blur'), object('image', 'image')];
    expect(renderOrder(objects).map((entry) => entry.id)).toEqual(['image', 'b', 'a']);
  });
});

describe('magnifier', () => {
  it('shows the area under its center, zoom times smaller', () => {
    expect(magnifySource({ x: 100, y: 200, width: 200, height: 100 }, 2)).toEqual({
      x: 150,
      y: 225,
      width: 100,
      height: 50,
    });
  });

  it('reads styles defensively', () => {
    expect(readMagnifyStyle(undefined)).toMatchObject({ zoom: 2, shape: 'circle' });
    expect(readMagnifyStyle({ zoom: 99, shape: 'rounded' })).toMatchObject({ zoom: 4, shape: 'rounded' });
    expect(readMagnifyStyle({ zoom: 'x' }).zoom).toBe(2);
  });

  it('takes the palette color as its ring color', () => {
    const lens = object('lens', 'magnify', { zoom: 2, color: '#ffffff' });
    expect(supportsColor(lens)).toBe(true);
    expect(colorPatch(lens, '#ff3b30')).toMatchObject({ color: '#ff3b30', zoom: 2 });
    expect(readObjectColor(lens)).toBe('#ffffff');
  });
});

describe('spotlight', () => {
  it('reads styles defensively', () => {
    expect(readSpotlightStyle(undefined)).toMatchObject({ dim: 0.55, shape: 'rounded' });
    expect(readSpotlightStyle({ dim: 2, shape: 'ellipse' })).toMatchObject({ dim: 0.85, shape: 'ellipse' });
    expect(readSpotlightStyle({ dim: 0 }).dim).toBe(0.2);
  });

  it('is not recolored by the palette', () => {
    expect(supportsColor(object('spot', 'spotlight'))).toBe(false);
  });
});

describe('file name templates', () => {
  const source = {
    sourceUrl: 'https://www.example.com/pricing',
    sourceTitle: 'Plans: Pro / Team?',
    createdAt: new Date(2026, 8, 4, 14, 32, 5).getTime(),
  };

  it('keeps the classic naming by default', () => {
    expect(buildFileName(DEFAULT_FILE_NAME_TEMPLATE, source, 'png')).toBe(
      'snapframe-example-com-2026-09-04-143205.png',
    );
  });

  it('fills in every placeholder and makes the result safe', () => {
    expect(buildFileName('{title} ({site}) {date} {time}', source, 'jpg')).toBe(
      'Plans-Pro-Team-(example-com)-2026-09-04-143205.jpg',
    );
  });

  it('never produces an empty or path-like name', () => {
    expect(buildFileName('///', source, 'png')).toBe('snapframe.png');
    expect(buildFileName('../{site}', source, 'png')).toBe('example-com.png');
    expect(buildFileName('x'.repeat(400), source, 'png')).toHaveLength(124);
  });

  it('falls back to the site when there is no title', () => {
    expect(buildFileName('{title}', { createdAt: source.createdAt }, 'png')).toBe('screenshot.png');
  });
});

describe('settings', () => {
  it('uses defaults for missing or invalid values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ afterCapture: 'print', historyLimit: 31, pageAware: 'yes', fileNameTemplate: '  ' }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    expect(
      sanitizeSettings({ afterCapture: 'copy', historyLimit: 120, pageAware: false, fileNameTemplate: '{site}' }),
    ).toEqual({ afterCapture: 'copy', historyLimit: 120, pageAware: false, fileNameTemplate: '{site}' });
  });
});

describe('content placement', () => {
  const framed: BeautifySettings = {
    ...DEFAULT_BEAUTIFY_SETTINGS,
    background: { type: 'solid', color: '#ffffff' },
    padding: 40,
    radius: 12,
  };

  it('is the whole picture without a frame', () => {
    expect(contentPlacement(800, 600, 2, DEFAULT_BEAUTIFY_SETTINGS)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      radii: [0, 0, 0, 0],
    });
  });

  it('sits inside the padding with rounded corners', () => {
    expect(contentPlacement(800, 600, 2, framed)).toEqual({
      x: 80,
      y: 80,
      width: 800,
      height: 600,
      radii: [24, 24, 24, 24],
    });
  });

  it('stays inside every device frame', () => {
    for (const mockup of MOCKUPS) {
      const config = getMockupById(mockup.id)!;
      const size = framedSize(1200, 800, 1, framed, config);
      const placement = contentPlacement(1200, 800, 1, framed, config);
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x + placement.width).toBeLessThanOrEqual(size.width);
      expect(placement.y + placement.height).toBeLessThanOrEqual(size.height);
    }
  });
});
