import { DEFAULT_BEAUTIFY_SETTINGS, sanitizeBeautify, type BeautifySettings } from '@/src/editor/beautify/presets';
import { ANNOTATION_COLORS, STROKE_WIDTHS } from '@/src/annotations/color';

export type ExportFormat = 'png' | 'jpg';
export type ExportScale = 1 | 2;

/**
 * Per-user preferences remembered between captures (last used colors,
 * frame, export settings). Every extension page shares one origin, so
 * localStorage is visible to the popup, editor and library alike - no
 * `storage` permission needed. All access is guarded: storage can be
 * unavailable, and the UI must work with defaults when it is.
 */
export interface Prefs {
  annotationColor: string;
  strokeWidth: number;
  beautify: BeautifySettings;
  exportFormat: ExportFormat;
  exportScale: ExportScale;
  jpgQuality: number;
  /** Magnetic drawing (snap shapes to page elements). */
  snapEnabled: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  annotationColor: ANNOTATION_COLORS[0] ?? '#ff3b30',
  strokeWidth: STROKE_WIDTHS[1] ?? 4,
  beautify: DEFAULT_BEAUTIFY_SETTINGS,
  exportFormat: 'png',
  exportScale: 1,
  jpgQuality: 90,
  snapEnabled: true,
};

const STORAGE_KEY = 'snapframe-prefs';

function sanitize(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const value = raw as Partial<Prefs>;
  return {
    annotationColor:
      typeof value.annotationColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.annotationColor)
        ? value.annotationColor
        : DEFAULT_PREFS.annotationColor,
    strokeWidth:
      typeof value.strokeWidth === 'number' && value.strokeWidth > 0 && value.strokeWidth <= 40
        ? value.strokeWidth
        : DEFAULT_PREFS.strokeWidth,
    beautify: value.beautify ? sanitizeBeautify(value.beautify) : DEFAULT_PREFS.beautify,
    exportFormat: value.exportFormat === 'jpg' ? 'jpg' : 'png',
    exportScale: value.exportScale === 2 ? 2 : 1,
    jpgQuality:
      typeof value.jpgQuality === 'number' && value.jpgQuality >= 10 && value.jpgQuality <= 100
        ? value.jpgQuality
        : DEFAULT_PREFS.jpgQuality,
    snapEnabled: typeof value.snapEnabled === 'boolean' ? value.snapEnabled : DEFAULT_PREFS.snapEnabled,
  };
}

export function loadPrefs(): Prefs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? sanitize(JSON.parse(stored)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(partial: Partial<Prefs>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadPrefs(), ...partial }));
  } catch {
    // Non-fatal: the preference just won't be remembered.
  }
}
