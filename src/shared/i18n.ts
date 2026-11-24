import { browser } from 'wxt/browser';
import type enMessages from '@/public/_locales/en/messages.json';

/** Every UI string key. Typed from the English catalog, so a missing/renamed key is a compile error. */
export type MessageKey = keyof typeof enMessages;

type Substitution = string | number;

/**
 * Thin wrapper over `chrome.i18n.getMessage` - all user-facing copy lives in
 * `public/_locales/<lang>/messages.json` so the extension follows the
 * browser's UI language (English and Turkish ship today). Outside an
 * extension context (unit tests) it falls back to the key itself.
 */
export function t(key: MessageKey, substitutions?: Substitution | Substitution[]): string {
  const subs =
    substitutions === undefined
      ? undefined
      : (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  try {
    const message = browser.i18n.getMessage(key, subs);
    if (message) return message;
  } catch {
    // Not running inside an extension (e.g. unit tests).
  }
  return key;
}

export function getUiLanguage(): string {
  try {
    return browser.i18n.getUILanguage() || 'en';
  } catch {
    return 'en';
  }
}

/** Sets `<html lang>` so screen readers and hyphenation follow the UI language. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = getUiLanguage();
}

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

export function formatDateTime(timestamp: number, options: Intl.DateTimeFormatOptions = {}): string {
  const cacheKey = JSON.stringify(options);
  let format = dateTimeFormatCache.get(cacheKey);
  if (!format) {
    format = new Intl.DateTimeFormat(getUiLanguage(), { dateStyle: 'medium', timeStyle: 'short', ...options });
    dateTimeFormatCache.set(cacheKey, format);
  }
  return format.format(timestamp);
}
