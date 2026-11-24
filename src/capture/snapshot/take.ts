import { browser } from 'wxt/browser';
import {
  isPageSnapshot,
  type PageSnapshot,
  type SnapshotOptions,
  type SnapshotRect,
} from '@/src/capture/snapshot/types';

/**
 * Collects the page snapshot (element boxes + sensitive-data positions) for
 * a captured region. Best effort by design: any failure (restricted frame,
 * navigation mid-capture, odd page) just means the capture has no snapshot
 * and the editor's smart features stay quiet - the capture itself never
 * fails because of it.
 */
export async function takeSnapshot(
  tabId: number,
  region: SnapshotRect,
  options: SnapshotOptions,
): Promise<PageSnapshot | undefined> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/page-snapshot.js'] });
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: (r: SnapshotRect, o: SnapshotOptions) => {
        const collect = (globalThis as { __snapframeSnapshot?: (r: SnapshotRect, o: SnapshotOptions) => unknown })
          .__snapframeSnapshot;
        return collect ? collect(r, o) : null;
      },
      args: [region, options],
    });
    return isPageSnapshot(result?.result) ? result.result : undefined;
  } catch (error) {
    console.warn('[SnapFrame] page snapshot unavailable', error);
    return undefined;
  }
}
