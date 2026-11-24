import { browser } from 'wxt/browser';
import type { ViewportRect } from '@/src/shared/messages';

/** How long the editor waits so the user sees the shutter before the new tab takes over. */
export const SHUTTER_DURATION_MS = 320;

/**
 * Injected into the page right *after* the pixels are captured (so it's
 * never in the screenshot): a soft white flash, and the captured region
 * shrinking towards the toolbar - the "it's in the box" moment. Must stay
 * self-contained: executeScript serializes the function body.
 */
export function playShutterInPage(rect: ViewportRect | null): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;';
  root.append(flash);
  document.documentElement.append(host);

  flash.animate([{ opacity: reduce ? 0.25 : 0.6 }, { opacity: 0 }], {
    duration: reduce ? 160 : 300,
    easing: 'ease-out',
  });

  if (rect && !reduce) {
    const card = document.createElement('div');
    card.style.cssText =
      `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;` +
      'border:2px solid #7a5bff;border-radius:8px;background:rgba(122,91,255,.08);' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.7),0 18px 40px rgba(80,52,230,.35);transform-origin:100% 0;';
    root.append(card);
    // Fly towards the top-right corner, where the toolbar button lives.
    const dx = window.innerWidth - 24 - (rect.x + rect.width);
    const dy = 4 - rect.y;
    card.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, 0) scale(0.97)', opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.06)`, opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(.55,0,.2,1)', fill: 'forwards' },
    );
  }
  setTimeout(() => host.remove(), 700);
}

/** Plays the shutter in the tab; never throws (purely cosmetic). */
export async function playShutter(tabId: number, rect: ViewportRect | null): Promise<void> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, func: playShutterInPage, args: [rect] });
    await new Promise((resolve) => setTimeout(resolve, SHUTTER_DURATION_MS));
  } catch {
    // Cosmetic only.
  }
}
