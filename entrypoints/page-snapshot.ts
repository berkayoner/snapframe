import { collectPageSnapshot } from '@/src/capture/snapshot/collect';

/**
 * Injected on demand (never a declared content script) right after a
 * capture: registers the snapshot collector in the extension's isolated
 * world, where the background then calls it with the captured region.
 * Isolated-world globals are invisible to the page's own scripts.
 */
export default defineUnlistedScript(() => {
  (globalThis as unknown as { __snapframeSnapshot: typeof collectPageSnapshot }).__snapframeSnapshot =
    collectPageSnapshot;
});
