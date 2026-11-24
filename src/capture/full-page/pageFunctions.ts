/**
 * Functions injected into the page via `chrome.scripting.executeScript`.
 * Chrome serializes each function body and re-runs it in the page, so
 * every one of these MUST be fully self-contained - no references to
 * anything outside its own parameters (imports and closures don't survive
 * the trip). State that must persist between calls lives in the DOM:
 * pinned elements are tagged with an attribute, and a <style> element
 * freezes scrolling behavior until restorePage removes it.
 */

export const PIN_ATTR = 'data-snapframe-pin';
export const ORIGINAL_VISIBILITY_ATTR = 'data-snapframe-visibility';
export const CAPTURE_STYLE_ID = 'snapframe-capture-style';

export interface PageMeasurement {
  scrollHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

/**
 * Runs once before the first slice:
 * - remembers the user's scroll position, then scrolls to the top;
 * - disables smooth scrolling (slices must land exactly where requested)
 *   and hides scrollbars (so none gets baked into the right edge);
 * - tags fixed/sticky elements that are on screen. Top-anchored ones
 *   (headers, nav bars) are shown only in the first slice, bottom-anchored
 *   ones (cookie bars, chat bubbles) only in the last, so they appear once
 *   instead of repeating down the stitched page.
 */
export function preparePage(pinAttr: string, visibilityAttr: string, styleId: string): PageMeasurement {
  const originalX = window.scrollX;
  const originalY = window.scrollY;

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent =
      'html, body { scroll-behavior: auto !important; scrollbar-width: none !important; }' +
      'html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
    (document.head ?? document.documentElement).append(style);
  }

  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const elements = document.body ? document.body.querySelectorAll('*') : [];
  for (const element of Array.from(elements)) {
    if (!(element instanceof HTMLElement)) continue;
    const position = getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    const rect = element.getBoundingClientRect();
    const onScreen =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < viewportHeight &&
      rect.right > 0 &&
      rect.left < viewportWidth;
    if (!onScreen) continue;
    const anchor = position === 'fixed' && rect.top + rect.height / 2 > viewportHeight / 2 ? 'bottom' : 'top';
    element.setAttribute(pinAttr, anchor);
    element.setAttribute(
      visibilityAttr,
      `${element.style.getPropertyValue('visibility')}|${element.style.getPropertyPriority('visibility')}`,
    );
  }

  const root = document.documentElement;
  const body = document.body;
  return {
    scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0, viewportHeight),
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollX: originalX,
    scrollY: originalY,
  };
}

/** Runs before each slice: shows/hides pinned elements for this slice, scrolls, and reports where it actually landed. */
export function scrollToSlice(
  pinAttr: string,
  visibilityAttr: string,
  y: number,
  sliceIndex: number,
  sliceCount: number,
): number {
  const isFirst = sliceIndex === 0;
  const isLast = sliceIndex === sliceCount - 1;
  document.querySelectorAll(`[${pinAttr}]`).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const show = element.getAttribute(pinAttr) === 'bottom' ? isLast : isFirst;
    if (!show) {
      element.style.setProperty('visibility', 'hidden', 'important');
      return;
    }
    const [value = '', priority = ''] = (element.getAttribute(visibilityAttr) ?? '').split('|');
    if (value) element.style.setProperty('visibility', value, priority);
    else element.style.removeProperty('visibility');
  });
  window.scrollTo({ left: 0, top: y, behavior: 'instant' });
  return window.scrollY;
}

/** Runs once after the last slice (or on failure): undoes every change and restores the user's scroll position. */
export function restorePage(
  pinAttr: string,
  visibilityAttr: string,
  styleId: string,
  scrollX: number,
  scrollY: number,
): void {
  document.querySelectorAll(`[${pinAttr}]`).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const [value = '', priority = ''] = (element.getAttribute(visibilityAttr) ?? '').split('|');
    if (value) element.style.setProperty('visibility', value, priority);
    else element.style.removeProperty('visibility');
    element.removeAttribute(pinAttr);
    element.removeAttribute(visibilityAttr);
  });
  document.getElementById(styleId)?.remove();
  window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
}
