import { describe, expect, it } from 'vitest';
import { planThumbnail, THUMBNAIL_WIDTH } from '@/src/storage/thumbnails';
import { dashPattern, readArrowStyle, readShapeStyle } from '@/src/annotations/shapes/shapeStyle';

describe('thumbnails', () => {
  it('scales wide images down to the card width without cropping', () => {
    expect(planThumbnail(2560, 1200)).toEqual({ sourceWidth: 2560, sourceHeight: 1200, width: 640, height: 300 });
  });

  it('keeps the top 16:10 of tall (full-page) captures', () => {
    expect(planThumbnail(1280, 9000)).toEqual({ sourceWidth: 1280, sourceHeight: 800, width: 640, height: 400 });
  });

  it('never upscales small images', () => {
    expect(planThumbnail(200, 100)).toEqual({ sourceWidth: 200, sourceHeight: 100, width: 200, height: 100 });
    expect(planThumbnail(THUMBNAIL_WIDTH, 400).width).toBe(THUMBNAIL_WIDTH);
  });
});

describe('line styles', () => {
  it('keeps projects saved before line styles existed solid, with one arrowhead', () => {
    expect(readArrowStyle({ stroke: '#000', strokeWidth: 4 })).toMatchObject({ heads: 'end', dashed: false });
    expect(readShapeStyle({ stroke: '#000', strokeWidth: 4, fillMode: 'none' }).dashed).toBe(false);
  });

  it('spaces dashes by stroke width, leaving visible gaps with round caps', () => {
    const [dash, gap] = dashPattern(8, true);
    // Round caps add half a width on each end of a dash.
    expect(gap! - 8).toBeGreaterThan(8);
    expect(dash! + 8).toBeGreaterThan(gap! - 8);
    expect(dashPattern(0)).toEqual(dashPattern(1));
  });
});
