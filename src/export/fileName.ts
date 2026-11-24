/** The naming SnapFrame has always used: "snapframe-example-com-2026-09-04-143205.png". */
export const DEFAULT_FILE_NAME_TEMPLATE = 'snapframe-{site}-{date}-{time}';

/** Placeholders a file name template can use. */
export const FILE_NAME_TOKENS = ['{site}', '{title}', '{date}', '{time}'] as const;

export interface FileNameSource {
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt: number;
}

const MAX_BASE_LENGTH = 120;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function siteOf(url: string | undefined): string {
  if (!url) return 'screenshot';
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'screenshot';
  } catch {
    return 'screenshot';
  }
}

/** Makes text safe as part of a file name on every OS (no path separators or reserved characters). */
function sanitizePart(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
  );
}

/**
 * Builds an export file name from a template such as
 * "snapframe-{site}-{date}-{time}". Dates use local time so names sort
 * chronologically. Unknown placeholders are kept as text; the result is
 * always a safe, non-empty file name with the given extension.
 */
export function buildFileName(template: string, source: FileNameSource, extension: string): string {
  const date = new Date(source.createdAt);
  const values: Record<string, string> = {
    '{site}': siteOf(source.sourceUrl),
    '{title}': source.sourceTitle?.trim() || siteOf(source.sourceUrl),
    '{date}': `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    '{time}': `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  };
  let base = template;
  for (const token of FILE_NAME_TOKENS) base = base.split(token).join(values[token] ?? '');
  base = sanitizePart(base)
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^[-.\s]+|[-.\s]+$/g, '');
  return `${base || 'snapframe'}.${extension}`;
}
