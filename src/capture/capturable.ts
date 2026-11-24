import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { captureErrors } from '@/src/capture/errors';

/** Browser-internal pages the extension platform never lets us capture or script. */
const UNCAPTURABLE_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-search://',
  'chrome-untrusted://',
  'edge://',
  'brave://',
  'opera://',
  'vivaldi://',
  'about:',
  'devtools://',
  'view-source:',
];

const UNCAPTURABLE_HOSTS = new Set(['chrome.google.com', 'chromewebstore.google.com', 'microsoftedge.microsoft.com']);

export type CapturableTab = Browser.tabs.Tab & { id: number; url: string; windowId: number };

export function isCapturableUrl(url: string | undefined): boolean {
  if (!url || UNCAPTURABLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return false;
  try {
    return !UNCAPTURABLE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function assertCapturable(tab: Browser.tabs.Tab | undefined): asserts tab is CapturableTab {
  if (!tab?.id || tab.windowId === undefined || !isCapturableUrl(tab.url)) {
    throw captureErrors.unsupportedPage();
  }
}

/** Shared by every capture mode: find the active tab and confirm we can actually capture it. */
export async function getActiveCapturableTab(): Promise<CapturableTab> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw captureErrors.noActiveTab();
  assertCapturable(tab);
  return tab;
}

/** Delays before retrying a capture whose frame wasn't ready yet. Spaced to respect the 2 calls/sec quota. */
const CAPTURE_RETRY_DELAYS_MS = [300, 700];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * captureVisibleTab as a Blob, with any platform error mapped to a friendly
 * CaptureError. Right after a navigation or tab switch the compositor may
 * not have a frame yet ("image readback failed"), so transient failures are
 * retried a couple of times before giving up.
 */
export async function captureTabBlob(windowId: number): Promise<Blob> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CAPTURE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(CAPTURE_RETRY_DELAYS_MS[attempt - 1] ?? 500);
    try {
      const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
      return await (await fetch(dataUrl)).blob();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // Permission/policy errors won't fix themselves - fail fast.
      if (/permission|cannot access|not allowed/i.test(message)) break;
    }
  }
  throw captureErrors.captureFailed(lastError);
}
