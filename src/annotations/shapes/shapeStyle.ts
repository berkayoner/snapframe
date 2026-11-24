import { hexToRgba } from '@/src/annotations/color';

export type FillMode = 'none' | 'tint' | 'solid';

/** Style for rectangles and ellipses. Sizes are in image pixels. */
export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fillMode: FillMode;
  cornerRadius: number;
  /** Dashed outline. */
  dashed: boolean;
  /** Explicit fill color written by pre-1.0 projects; only honored when `fillMode` is absent. */
  fill?: string;
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  stroke: '#ff3b30',
  strokeWidth: 4,
  fillMode: 'none',
  cornerRadius: 0,
  dashed: false,
};

export function readShapeStyle(style?: Record<string, unknown>): ShapeStyle {
  return { ...DEFAULT_SHAPE_STYLE, ...(style as Partial<ShapeStyle> | undefined) };
}

/** Resolves the fill to render, honoring legacy explicit `fill` values from older autosaved projects. */
export function resolveShapeFill(style?: Record<string, unknown>): string | undefined {
  if (style && style.fillMode === undefined && typeof style.fill === 'string') return style.fill;
  const resolved = readShapeStyle(style);
  if (resolved.fillMode === 'solid') return resolved.stroke;
  if (resolved.fillMode === 'tint') return hexToRgba(resolved.stroke, 0.16);
  return undefined;
}

/** Which ends of an arrow get a head ('none' is a plain line). */
export type ArrowHeads = 'end' | 'both' | 'none';

export interface ArrowStyle {
  stroke: string;
  strokeWidth: number;
  heads: ArrowHeads;
  dashed: boolean;
}

export const DEFAULT_ARROW_STYLE: ArrowStyle = {
  stroke: '#ff3b30',
  strokeWidth: 4,
  heads: 'end',
  dashed: false,
};

/**
 * Dash pattern for a dashed stroke of the given width. Round caps grow each
 * dash by half a width on both ends, so their gaps are planned wider.
 */
export function dashPattern(strokeWidth: number, roundCaps = false): number[] {
  const width = Math.max(1, strokeWidth);
  return roundCaps ? [width * 1.4, width * 2.6] : [width * 2.4, width * 1.6];
}

export function readArrowStyle(style?: Record<string, unknown>): ArrowStyle {
  return { ...DEFAULT_ARROW_STYLE, ...(style as Partial<ArrowStyle> | undefined) };
}

/** Arrowhead size grows with the stroke so thick arrows don't end in tiny heads. */
export function arrowPointerSize(strokeWidth: number): number {
  return Math.max(10, strokeWidth * 3.2);
}
