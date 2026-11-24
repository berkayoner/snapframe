import { captureTabBlob, type CapturableTab } from '@/src/capture/capturable';
import { captureErrors } from '@/src/capture/errors';
import { toDevicePixelRect } from '@/src/capture/geometry';
import { persistCapture } from '@/src/capture/persist';
import type { ViewportRect } from '@/src/shared/messages';
import type { CapturePayload } from '@/src/shared/types';
import type { PageSnapshot } from '@/src/capture/snapshot/types';

/**
 * Captures the tab's visible area and crops it to a user-selected rect.
 * The on-page overlay has already removed itself before asking for this,
 * so the selection UI is never part of the pixels. The crop runs on an
 * OffscreenCanvas in the service worker - a single crop is fast enough to
 * need no offscreen document.
 *
 * The CSS->bitmap scale is measured (bitmap width / viewport width) rather
 * than assumed from devicePixelRatio, which stays exact under browser zoom
 * and fractional OS scaling.
 */
export async function captureArea(
  tab: CapturableTab,
  rect: ViewportRect,
  devicePixelRatio: number,
  viewportWidth: number,
  options: { type: 'area' | 'element'; getSnapshot?: () => Promise<PageSnapshot | undefined> } = { type: 'area' },
): Promise<CapturePayload> {
  const fullBlob = await captureTabBlob(tab.windowId);
  const bitmap = await createImageBitmap(fullBlob);
  const scale = viewportWidth > 0 ? bitmap.width / viewportWidth : devicePixelRatio;
  const crop = toDevicePixelRect(rect, scale, bitmap.width, bitmap.height);

  try {
    if (crop.width < 2 || crop.height < 2) throw captureErrors.areaTooSmall();

    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw captureErrors.captureFailed();
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const snapshot = await options.getSnapshot?.();

    return await persistCapture(
      blob,
      { width: crop.width, height: crop.height, devicePixelRatio: scale },
      { url: tab.url, title: tab.title, type: options.type },
      { snapshot },
    );
  } finally {
    bitmap.close();
  }
}
