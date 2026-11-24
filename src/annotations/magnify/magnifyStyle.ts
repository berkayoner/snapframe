export type MagnifyShapeKind = 'circle' | 'rounded';

export interface MagnifyStyle {
  /** Magnification factor. */
  zoom: number;
  shape: MagnifyShapeKind;
  /** Ring color. */
  color: string;
  /** Ring width in image pixels (scaled by the capture's pixel ratio when created). */
  ringWidth: number;
}

export const MAGNIFY_ZOOM_RANGE = { min: 1.5, max: 4, step: 0.25 } as const;

/** Lens size for a single click, in source-page CSS px. */
export const MAGNIFY_DEFAULT_SIZE = 140;

export const DEFAULT_MAGNIFY_STYLE: MagnifyStyle = { zoom: 2, shape: 'circle', color: '#ffffff', ringWidth: 3 };

export function readMagnifyStyle(style?: Record<string, unknown>): MagnifyStyle {
  const value = (style ?? {}) as Partial<MagnifyStyle>;
  const zoom = Number(value.zoom);
  return {
    zoom: Number.isFinite(zoom)
      ? Math.min(MAGNIFY_ZOOM_RANGE.max, Math.max(MAGNIFY_ZOOM_RANGE.min, zoom))
      : DEFAULT_MAGNIFY_STYLE.zoom,
    shape: value.shape === 'rounded' ? 'rounded' : 'circle',
    color: typeof value.color === 'string' ? value.color : DEFAULT_MAGNIFY_STYLE.color,
    ringWidth:
      typeof value.ringWidth === 'number' && value.ringWidth >= 0 ? value.ringWidth : DEFAULT_MAGNIFY_STYLE.ringWidth,
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the screenshot a lens shows: a rect `zoom` times smaller than
 * the lens, centered on the lens center. Both rects are in canvas pixels.
 */
export function magnifySource(lens: Rect, zoom: number): Rect {
  const width = lens.width / zoom;
  const height = lens.height / zoom;
  return {
    x: lens.x + lens.width / 2 - width / 2,
    y: lens.y + lens.height / 2 - height / 2,
    width,
    height,
  };
}
