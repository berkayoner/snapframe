export type SpotlightShapeKind = 'rect' | 'rounded' | 'ellipse';

export interface SpotlightStyle {
  /** Opacity of the darkening outside the spotlight (0..1). */
  dim: number;
  shape: SpotlightShapeKind;
  /** Corner radius for `rounded`, in image pixels. */
  radius: number;
}

export const SPOTLIGHT_DIM_RANGE = { min: 20, max: 85, step: 5 } as const;

export const DEFAULT_SPOTLIGHT_STYLE: SpotlightStyle = { dim: 0.55, shape: 'rounded', radius: 10 };

export function readSpotlightStyle(style?: Record<string, unknown>): SpotlightStyle {
  const value = (style ?? {}) as Partial<SpotlightStyle>;
  const dim = Number(value.dim);
  return {
    dim: Number.isFinite(dim)
      ? Math.min(SPOTLIGHT_DIM_RANGE.max / 100, Math.max(SPOTLIGHT_DIM_RANGE.min / 100, dim))
      : DEFAULT_SPOTLIGHT_STYLE.dim,
    shape: value.shape === 'rect' || value.shape === 'ellipse' ? value.shape : 'rounded',
    radius: typeof value.radius === 'number' && value.radius >= 0 ? value.radius : DEFAULT_SPOTLIGHT_STYLE.radius,
  };
}
