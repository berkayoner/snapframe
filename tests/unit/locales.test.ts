import { describe, expect, it } from 'vitest';
import en from '@/public/_locales/en/messages.json';
import tr from '@/public/_locales/tr/messages.json';

type Catalog = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const catalogs: Record<string, Catalog> = { en, tr };

describe('locale catalogs', () => {
  it('every language has exactly the English keys', () => {
    const expected = Object.keys(en).sort();
    for (const [lang, catalog] of Object.entries(catalogs)) {
      expect(Object.keys(catalog).sort(), lang).toEqual(expected);
    }
  });

  it('messages are non-empty and keys are valid chrome.i18n names', () => {
    for (const catalog of Object.values(catalogs)) {
      for (const [key, entry] of Object.entries(catalog)) {
        expect(key).toMatch(/^[A-Za-z0-9_]+$/);
        expect(entry.message.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('translations use the same placeholders as English', () => {
    for (const [key, entry] of Object.entries(en as Catalog)) {
      const english = Object.keys(entry.placeholders ?? {}).sort();
      const turkish = Object.keys((tr as Catalog)[key]?.placeholders ?? {}).sort();
      expect(turkish, key).toEqual(english);
      for (const name of english) {
        expect((tr as Catalog)[key]?.message, key).toContain(`$${name.toUpperCase()}$`);
      }
    }
  });
});

describe('message usage in code', () => {
  it('every t(key, value) call targets a message that has placeholders', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk('src');
    walk('entrypoints');
    const withArgs = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)',\s*[^)]/g)) {
        withArgs.add(match[1]!);
      }
    }
    expect(withArgs.size).toBeGreaterThan(5);
    for (const key of withArgs) {
      expect((en as Catalog)[key]?.placeholders, key).toBeDefined();
    }
  });
});
