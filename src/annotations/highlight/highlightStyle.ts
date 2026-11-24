import { hexToRgba } from '@/src/annotations/color';

export interface HighlightStyle {
  color: string;
  /** Explicit rgba fill written by pre-1.0 projects; only honored when `color` is absent. */
  fill?: string;
}

export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  color: '#ffcc00',
};

const HIGHLIGHT_ALPHA = 0.4;

export function readHighlightStyle(style?: Record<string, unknown>): HighlightStyle {
  return { ...DEFAULT_HIGHLIGHT_STYLE, ...(style as Partial<HighlightStyle> | undefined) };
}

export function resolveHighlightFill(style?: Record<string, unknown>): string {
  if (style && style.color === undefined && typeof style.fill === 'string') return style.fill;
  return hexToRgba(readHighlightStyle(style).color, HIGHLIGHT_ALPHA);
}
