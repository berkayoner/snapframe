import { browser } from 'wxt/browser';
import { captureTabBlob, type CapturableTab } from '@/src/capture/capturable';
import { captureErrors } from '@/src/capture/errors';
import { buildScrollSteps, maxCaptureCssHeight } from '@/src/capture/geometry';
import { persistCapture } from '@/src/capture/persist';
import { takeSnapshot } from '@/src/capture/snapshot/take';
import {
  CAPTURE_STYLE_ID,
  ORIGINAL_VISIBILITY_ATTR,
  PIN_ATTR,
  preparePage,
  restorePage,
  scrollToSlice,
} from '@/src/capture/full-page/pageFunctions';
import type { CapturePayload, CaptureWarning } from '@/src/shared/types';

/** captureVisibleTab is hard-limited to 2 calls/sec; stay comfortably under it. */
const CAPTURE_MIN_INTERVAL_MS = 550;
/** Time for the page to repaint (and lazy content to settle) after each scroll. */
const SLICE_SETTLE_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInPage<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result,
  args: Args,
): Promise<Result> {
  let results;
  try {
    results = await browser.scripting.executeScript({ target: { tabId }, func, args });
  } catch (error) {
    throw captureErrors.captureFailed(error);
  }
  const first = results[0];
  if (!first) throw captureErrors.captureFailed();
  return first.result as Result;
}

export type ProgressCallback = (done: number, total: number) => void;

/**
 * Scroll-and-stitch full-page capture, orchestrated from the service
 * worker: it drives scrolling via `scripting.executeScript`, captures each
 * viewport slice and composites them on an OffscreenCanvas. Every
 * extension API call keeps the worker alive, so long pages don't get the
 * worker torn down mid-capture.
 *
 * Slices are drawn at the scroll position the page *actually* reached
 * (not the requested one), so pages that end early or clamp scrolling
 * still stitch without gaps. The page is always restored, even on failure.
 */
export async function captureFullPage(tab: CapturableTab, onProgress?: ProgressCallback): Promise<CapturePayload> {
  const page = await runInPage(tab.id, preparePage, [PIN_ATTR, ORIGINAL_VISIBILITY_ATTR, CAPTURE_STYLE_ID]);

  try {
    const { innerWidth, innerHeight, devicePixelRatio } = page;
    const maxHeight = maxCaptureCssHeight(innerWidth, devicePixelRatio);
    const truncated = page.scrollHeight > maxHeight;
    const totalHeight = Math.max(innerHeight, Math.min(page.scrollHeight, maxHeight));
    const steps = buildScrollSteps(totalHeight, innerHeight);
    // Page-aware data in document coordinates, taken at the top before slicing. Bars that only
    // appear in the last slice (cookie banners, chat bubbles) sit elsewhere in the stitch: skip them.
    const snapshot = await takeSnapshot(
      tab.id,
      { x: 0, y: 0, width: innerWidth, height: totalHeight },
      { documentCoords: true, skipSelector: `[${PIN_ATTR}="bottom"]` },
    );

    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    let scale = devicePixelRatio;
    let lastCaptureAt = 0;
    onProgress?.(0, steps.length);

    for (let index = 0; index < steps.length; index++) {
      const actualY = await runInPage(tab.id, scrollToSlice, [
        PIN_ATTR,
        ORIGINAL_VISIBILITY_ATTR,
        steps[index] ?? 0,
        index,
        steps.length,
      ]);
      const wait = Math.max(SLICE_SETTLE_MS, CAPTURE_MIN_INTERVAL_MS - (Date.now() - lastCaptureAt));
      await sleep(wait);

      const slice = await createImageBitmap(await captureTabBlob(tab.windowId));
      lastCaptureAt = Date.now();

      if (!canvas || !ctx) {
        // Size the canvas from the real bitmap: exact under browser zoom and fractional scaling.
        scale = slice.width / innerWidth;
        canvas = new OffscreenCanvas(slice.width, Math.max(1, Math.round(totalHeight * scale)));
        ctx = canvas.getContext('2d');
        if (!ctx) {
          slice.close();
          throw captureErrors.captureFailed();
        }
      }
      ctx.drawImage(slice, 0, Math.round(actualY * scale));
      slice.close();
      onProgress?.(index + 1, steps.length);
    }

    if (!canvas) throw captureErrors.captureFailed();
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const warnings: CaptureWarning[] | undefined = truncated ? ['truncated-max-height'] : undefined;

    return await persistCapture(
      blob,
      { width: canvas.width, height: canvas.height, devicePixelRatio: scale },
      { url: tab.url, title: tab.title, type: 'full-page' },
      { warnings, snapshot },
    );
  } finally {
    await runInPage(tab.id, restorePage, [
      PIN_ATTR,
      ORIGINAL_VISIBILITY_ATTR,
      CAPTURE_STYLE_ID,
      page.scrollX,
      page.scrollY,
    ]).catch(() => undefined);
  }
}
