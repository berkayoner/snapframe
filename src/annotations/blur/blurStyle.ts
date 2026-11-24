export type RedactMode = 'blur' | 'pixelate';

export interface BlurStyle {
  mode: RedactMode;
  /** Blur radius, or pixel block size for pixelate - in image pixels. */
  strength: number;
}

export const DEFAULT_BLUR_STYLE: BlurStyle = { mode: 'pixelate', strength: 14 };

export const BLUR_STRENGTH_RANGE = { min: 4, max: 60 } as const;

export function readBlurStyle(style?: Record<string, unknown>): BlurStyle {
  // Projects saved before pixelate existed have no `mode` - they were blurs.
  const legacyMode: RedactMode | undefined = style && style.mode === undefined ? 'blur' : undefined;
  return {
    ...DEFAULT_BLUR_STYLE,
    ...(style as Partial<BlurStyle> | undefined),
    ...(legacyMode ? { mode: legacyMode } : {}),
  };
}
