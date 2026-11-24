import type { MessageKey } from '@/src/shared/i18n';

export type BeautifyBackground =
  /** No frame at all: the screenshot is exported as-is (padding, radius and shadow are kept for later but not applied). */
  | { type: 'none' }
  | { type: 'transparent' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number };

export type ShadowPreset = 'none' | 'soft' | 'medium' | 'strong';

/**
 * Frame settings. `padding` and `radius` are in the *source page's* CSS
 * pixels, so they look the same on screen at any zoom level and in the
 * export at any scale (they're multiplied by the capture's device pixel
 * ratio and the export scale when rendered). The frame is off until a
 * background is chosen (`background.type !== 'none'`).
 */
export interface BeautifySettings {
  background: BeautifyBackground;
  padding: number;
  radius: number;
  shadow: ShadowPreset;
}

export const NO_BACKGROUND: BeautifyBackground = { type: 'none' };

export const DEFAULT_BEAUTIFY_SETTINGS: BeautifySettings = {
  background: NO_BACKGROUND,
  padding: 48,
  radius: 12,
  shadow: 'medium',
};

export const PADDING_RANGE = { min: 0, max: 160, step: 4 } as const;
export const RADIUS_RANGE = { min: 0, max: 40, step: 1 } as const;
export const SHADOW_PRESETS: ShadowPreset[] = ['none', 'soft', 'medium', 'strong'];

export const BACKGROUND_PRESETS: Array<{ id: string; label: MessageKey; background: BeautifyBackground }> = [
  { id: 'lavender', label: 'bgLavender', background: { type: 'gradient', from: '#a18cd1', to: '#fbc2eb', angle: 135 } },
  { id: 'sunset', label: 'bgSunset', background: { type: 'gradient', from: '#ff9a8b', to: '#ff6a88', angle: 135 } },
  { id: 'peach', label: 'bgPeach', background: { type: 'gradient', from: '#ffecd2', to: '#fcb69f', angle: 135 } },
  { id: 'ocean', label: 'bgOcean', background: { type: 'gradient', from: '#2193b0', to: '#6dd5ed', angle: 135 } },
  { id: 'mint', label: 'bgMint', background: { type: 'gradient', from: '#84fab0', to: '#8fd3f4', angle: 135 } },
  { id: 'violet', label: 'bgViolet', background: { type: 'gradient', from: '#7f00ff', to: '#e100ff', angle: 135 } },
  { id: 'midnight', label: 'bgMidnight', background: { type: 'gradient', from: '#232526', to: '#414345', angle: 135 } },
  { id: 'aurora', label: 'bgAurora', background: { type: 'gradient', from: '#0f2027', to: '#2c5364', angle: 135 } },
  { id: 'white', label: 'bgWhite', background: { type: 'solid', color: '#ffffff' } },
  { id: 'gray', label: 'bgGray', background: { type: 'solid', color: '#e4e4e7' } },
  { id: 'black', label: 'bgBlack', background: { type: 'solid', color: '#0a0a0a' } },
  { id: 'transparent', label: 'bgTransparent', background: { type: 'transparent' } },
];

const SHADOW_CONFIG: Record<ShadowPreset, { blur: number; offsetY: number; alpha: number }> = {
  none: { blur: 0, offsetY: 0, alpha: 0 },
  soft: { blur: 24, offsetY: 8, alpha: 0.18 },
  medium: { blur: 40, offsetY: 16, alpha: 0.26 },
  strong: { blur: 64, offsetY: 28, alpha: 0.36 },
};

export function getShadowConfig(shadow: ShadowPreset) {
  return SHADOW_CONFIG[shadow];
}

/** Whether the frame (background, padding, radius, shadow) is applied at all. */
export function isFrameActive(settings: BeautifySettings): boolean {
  return settings.background.type !== 'none';
}

export function backgroundToCss(background: BeautifyBackground): string {
  if (background.type === 'transparent' || background.type === 'none') return 'transparent';
  if (background.type === 'solid') return background.color;
  return `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`;
}

export function isSameBackground(a: BeautifyBackground, b: BeautifyBackground): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Defensive parse for settings coming back from storage (older saves, hand-edited prefs). */
export function sanitizeBeautify(value: unknown): BeautifySettings {
  const fallback = DEFAULT_BEAUTIFY_SETTINGS;
  if (typeof value !== 'object' || value === null) return fallback;
  const candidate = value as Partial<BeautifySettings>;
  const background = candidate.background;
  const validBackground =
    background &&
    (background.type === 'none' ||
      background.type === 'transparent' ||
      (background.type === 'solid' && typeof background.color === 'string') ||
      (background.type === 'gradient' &&
        typeof background.from === 'string' &&
        typeof background.to === 'string' &&
        typeof background.angle === 'number'));
  return {
    background: validBackground ? background : fallback.background,
    padding: clampNumber(candidate.padding, PADDING_RANGE.min, PADDING_RANGE.max, fallback.padding),
    radius: clampNumber(candidate.radius, RADIUS_RANGE.min, RADIUS_RANGE.max, fallback.radius),
    shadow: SHADOW_PRESETS.includes(candidate.shadow as ShadowPreset)
      ? (candidate.shadow as ShadowPreset)
      : fallback.shadow,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
