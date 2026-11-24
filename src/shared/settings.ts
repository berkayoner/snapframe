import { db } from '@/src/storage/db';
import { DEFAULT_FILE_NAME_TEMPLATE } from '@/src/export/fileName';

/** What happens right after a capture. */
export type AfterCapture = 'editor' | 'copy' | 'download';

/**
 * Extension settings, edited on the options page. Unlike the remembered
 * editor preferences (src/shared/prefs.ts, localStorage), these live in
 * IndexedDB because the service worker needs them too - it decides what
 * happens after a capture - and it has no localStorage.
 */
export interface Settings {
  afterCapture: AfterCapture;
  fileNameTemplate: string;
  /** How many recent captures the library keeps. */
  historyLimit: number;
  /** Read element positions (and where personal data is) at capture time - powers magnetic drawing and one-click redaction. */
  pageAware: boolean;
}

export const HISTORY_LIMITS = [30, 60, 120] as const;

export const DEFAULT_SETTINGS: Settings = {
  afterCapture: 'editor',
  fileNameTemplate: DEFAULT_FILE_NAME_TEMPLATE,
  historyLimit: 30,
  pageAware: true,
};

export function sanitizeSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const value = raw as Partial<Settings>;
  return {
    afterCapture: value.afterCapture === 'copy' || value.afterCapture === 'download' ? value.afterCapture : 'editor',
    fileNameTemplate:
      typeof value.fileNameTemplate === 'string' && value.fileNameTemplate.trim()
        ? value.fileNameTemplate.slice(0, 200)
        : DEFAULT_SETTINGS.fileNameTemplate,
    historyLimit: (HISTORY_LIMITS as readonly number[]).includes(Number(value.historyLimit))
      ? Number(value.historyLimit)
      : DEFAULT_SETTINGS.historyLimit,
    pageAware: typeof value.pageAware === 'boolean' ? value.pageAware : DEFAULT_SETTINGS.pageAware,
  };
}

const CHANNEL = 'snapframe-settings';
let cached: Settings = DEFAULT_SETTINGS;

/** Reads the settings (defaults when none are saved or storage is unavailable). */
export async function loadSettings(): Promise<Settings> {
  try {
    const row = await db.settings.get('settings');
    cached = sanitizeSettings(row?.value);
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

/** The last loaded settings - for synchronous code paths in pages that called loadSettings() at startup. */
export function cachedSettings(): Settings {
  return cached;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await loadSettings()), ...patch });
  await db.settings.put({ key: 'settings', value: next });
  cached = next;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(next);
    channel.close();
  } catch {
    // Other pages pick the change up on their next load.
  }
  return next;
}

/** Calls `listener` whenever another page saves new settings. Returns an unsubscribe function. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      cached = sanitizeSettings(event.data);
      listener(cached);
    };
    return () => channel.close();
  } catch {
    return () => undefined;
  }
}
