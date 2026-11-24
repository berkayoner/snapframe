import { hexToRgba } from '@/src/annotations/color';

export type FillMode = 'none' | 'tint' | 'solid';

/** Style for rectangles and ellipses. Sizes are in image pixels. */
export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fillMode: FillMode;
  cornerRadius: number;
  /** Explicit fill color written by pre-1.0 projects; only honored when `fillMode` is absent. */
  fill?: string;
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  stroke: '#ff3b30',
  strokeWidth: 4,
  fillMode: 'none',
  cornerRadius: 0,
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

export interface ArrowStyle {
  stroke: string;
  strokeWidth: number;
}

export const DEFAULT_ARROW_STYLE: ArrowStyle = {
  stroke: '#ff3b30',
  strokeWidth: 4,
};

export function readArrowStyle(style?: Record<string, unknown>): ArrowStyle {
  return { ...DEFAULT_ARROW_STYLE, ...(style as Partial<ArrowStyle> | undefined) };
}

/** Arrowhead size grows with the stroke so thick arrows don't end in tiny heads. */
export function arrowPointerSize(strokeWidth: number): number {
  return Math.max(10, strokeWidth * 3.2);
}
