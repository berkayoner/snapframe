import { captureTabBlob, type CapturableTab } from '@/src/capture/capturable';
import { persistCapture } from '@/src/capture/persist';
import type { CapturePayload } from '@/src/shared/types';
import type { PageSnapshot } from '@/src/capture/snapshot/types';

/**
 * Pixels in the captured bitmap per CSS pixel of the page, measured from the
 * bitmap and the page's viewport width (`window.innerWidth`, which spans the
 * same area captureVisibleTab captures). Exact even when the reported
 * devicePixelRatio doesn't match what the browser actually captured (page
 * zoom, fractional OS scaling, headless). Falls back to the reported ratio
 * when the viewport is unknown.
 */
export function measureCaptureScale(bitmapWidth: number, viewportWidth: number | undefined, fallback: number): number {
  if (!viewportWidth || viewportWidth <= 0 || bitmapWidth <= 0) return fallback > 0 ? fallback : 1;
  return Math.round((bitmapWidth / viewportWidth) * 1000) / 1000;
}

/**
 * Captures the tab's visible area and persists it straight to IndexedDB.
 * The caller reads the page's viewport (a service worker has no `window`);
 * the reported devicePixelRatio is only a fallback for unscriptable pages.
 */
export async function captureVisibleArea(
  tab: CapturableTab,
  page: { viewportWidth?: number; devicePixelRatio: number },
  getSnapshot?: () => Promise<PageSnapshot | undefined>,
): Promise<CapturePayload> {
  const blob = await captureTabBlob(tab.windowId);
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  const snapshot = await getSnapshot?.();

  return persistCapture(
    blob,
    { ...size, devicePixelRatio: measureCaptureScale(size.width, page.viewportWidth, page.devicePixelRatio) },
    { url: tab.url, title: tab.title, type: 'visible' },
    { snapshot },
  );
}
