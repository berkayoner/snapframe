import { browser } from 'wxt/browser';
import type { CaptureResponse, RuntimeMessage, ViewportRect } from '@/src/shared/messages';
import { t } from '@/src/shared/i18n';

type OverlayMode = 'area' | 'element';

/**
 * On-page selection overlay, in two modes:
 *  - area: drag a rectangle;
 *  - element: hover to highlight the element under the cursor (↑/↓ or the
 *    wheel walk to its parent/child), click to capture exactly that element.
 *
 * An "unlisted script" - not a declared content script - so it needs no
 * host permissions: the background injects it on demand under the
 * activeTab grant, into that one tab only. The mode is set by the
 * background in the same isolated world just before injection.
 *
 * The UI lives in a closed shadow root so page CSS can't restyle it.
 * Crucially, the overlay removes itself and waits for a repaint *before*
 * asking for the capture, so it is never part of the screenshot.
 */
export default defineUnlistedScript(() => {
  const HOST_ID = 'snapframe-capture-overlay';
  const MIN_SELECTION_SIZE = 4;
  const MIN_ELEMENT_SIZE = 12;
  const mode: OverlayMode =
    (globalThis as { __snapframeOverlayMode?: OverlayMode }).__snapframeOverlayMode === 'element' ? 'element' : 'area';

  // Re-injection replaces any overlay left over from a previous run.
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .layer { position: fixed; inset: 0; cursor: crosshair; background: rgba(12, 12, 20, 0.38);
      animation: sf-fade .18s ease-out; }
    .layer.element { cursor: pointer; background: transparent; }
    .layer.selecting { background: transparent; }
    .guide { position: fixed; background: rgba(255, 255, 255, 0.55); pointer-events: none; mix-blend-mode: difference; }
    .guide-x { left: 0; right: 0; height: 1px; }
    .guide-y { top: 0; bottom: 0; width: 1px; }
    .layer.selecting .guide, .layer.element .guide { display: none; }
    .box {
      position: fixed; display: none; pointer-events: none;
      border: 1px solid #ffffff;
      outline: 1.5px solid #7a5bff;
      border-radius: 2px;
      box-shadow: 0 0 0 200vmax rgba(12, 12, 20, 0.45);
    }
    .layer.element .box {
      background: rgba(122, 91, 255, 0.10);
      transition: left .09s ease-out, top .09s ease-out, width .09s ease-out, height .09s ease-out;
      box-shadow: 0 0 0 200vmax rgba(12, 12, 20, 0.32);
    }
    .size {
      position: absolute; left: -1px; top: -28px;
      padding: 4px 7px; border-radius: 6px;
      background: #6640f5; color: #fff;
      font: 600 11px/1.2 ui-monospace, "SF Mono", Consolas, monospace;
      box-shadow: 0 4px 12px rgba(80, 52, 230, 0.35);
      white-space: nowrap;
    }
    .size b { font-weight: 700; opacity: .75; margin-right: 6px; }
    .size.inside { top: 6px; left: 6px; }
    .hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; border-radius: 999px;
      background: rgba(23, 22, 43, 0.94); color: #fff;
      font: 500 13px/1.3 "Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      pointer-events: none; white-space: nowrap;
      animation: sf-drop .32s cubic-bezier(.2, .8, .2, 1);
      transition: opacity .15s;
    }
    .hint kbd {
      padding: 1px 6px; border-radius: 4px;
      background: rgba(255, 255, 255, 0.16);
      font: 600 11px/1.4 ui-monospace, Consolas, monospace;
    }
    .hint .sep { opacity: .35; }
    .hint.error { background: #d93d42; }
    .layer.selecting .hint { opacity: 0; }
    .hint svg { width: 18px; height: 18px; flex-shrink: 0; margin-left: -4px; }
    @keyframes sf-fade { from { opacity: 0; } }
    @keyframes sf-drop { from { opacity: 0; transform: translate(-50%, -10px); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  const layer = document.createElement('div');
  layer.className = mode === 'element' ? 'layer element' : 'layer';
  const guideX = document.createElement('div');
  guideX.className = 'guide guide-x';
  const guideY = document.createElement('div');
  guideY.className = 'guide guide-y';
  const box = document.createElement('div');
  box.className = 'box';
  const sizeLabel = document.createElement('div');
  sizeLabel.className = 'size';
  box.append(sizeLabel);

  const hint = document.createElement('div');
  hint.className = 'hint';
  const textSpan = (text: string, className?: string) => {
    const span = document.createElement('span');
    span.textContent = text;
    if (className) span.className = className;
    return span;
  };
  const kbd = (text: string) => {
    const key = document.createElement('kbd');
    key.textContent = text;
    return key;
  };

  // Brand mark (same artwork as src/shared/Logo.tsx, small master) - built with DOM APIs, no innerHTML.
  const svgNs = 'http://www.w3.org/2000/svg';
  const mark = document.createElementNS(svgNs, 'svg');
  mark.setAttribute('viewBox', '0 0 16 16');
  const markShapes: Array<[string, Record<string, string>]> = [
    ['rect', { width: '16', height: '16', rx: '4', fill: '#6640f5' }],
    [
      'path',
      {
        d: 'M3.75 8V5.5a1.75 1.75 0 0 1 1.75-1.75H8M12.25 8v2.5a1.75 1.75 0 0 1-1.75 1.75H8',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '1.9',
        'stroke-linecap': 'round',
      },
    ],
    ['path', { d: 'M10.5 3Q10.95 5.05 13 5.5Q10.95 5.95 10.5 8Q10.05 5.95 8 5.5Q10.05 5.05 10.5 3Z', fill: '#ffd34e' }],
  ];
  for (const [tag, attributes] of markShapes) {
    const shape = document.createElementNS(svgNs, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    mark.append(shape);
  }

  if (mode === 'element') {
    hint.append(
      mark,
      textSpan(t('overlayElementHint')),
      textSpan('·', 'sep'),
      kbd('↑'),
      kbd('↓'),
      textSpan(t('overlayElementNavigate')),
      textSpan('·', 'sep'),
      kbd('Esc'),
      textSpan(t('overlayCancel')),
    );
  } else {
    hint.append(mark, textSpan(t('overlayHint')), kbd('Esc'), textSpan(t('overlayCancel')));
  }

  layer.append(guideX, guideY, box, hint);
  root.append(style, layer);
  document.documentElement.append(host);

  let start: { x: number; y: number } | null = null;
  let finished = false;
  /** Element mode: the highlighted element, and the trail walked with ↑ so ↓ can come back. */
  let target: Element | null = null;
  let trail: Element[] = [];

  function cleanup() {
    finished = true;
    window.removeEventListener('keydown', handleKeyDown, true);
    host.remove();
  }

  function rectFrom(x0: number, y0: number, x1: number, y1: number): ViewportRect {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  }

  function showBox(rect: ViewportRect, label?: string) {
    box.style.display = 'block';
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    sizeLabel.replaceChildren();
    if (label) {
      const name = document.createElement('b');
      name.textContent = label;
      sizeLabel.append(name);
    }
    sizeLabel.append(`${Math.round(rect.width)} × ${Math.round(rect.height)}`);
    sizeLabel.classList.toggle('inside', rect.y < 34);
  }

  function showError(message: string) {
    document.documentElement.append(host);
    layer.className = 'layer';
    layer.style.background = 'transparent';
    layer.style.pointerEvents = 'none';
    box.style.display = 'none';
    guideX.style.display = 'none';
    guideY.style.display = 'none';
    hint.className = 'hint error';
    hint.replaceChildren(message);
    setTimeout(cleanup, 3000);
  }

  /** Two animation frames: one to apply the removal, one to guarantee it has been painted. */
  function nextPaint(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  async function capture(rect: ViewportRect) {
    finished = true;
    window.removeEventListener('keydown', handleKeyDown, true);
    host.remove();
    await nextPaint();
    try {
      const request: RuntimeMessage = {
        type: 'area-selected',
        mode,
        rect,
        devicePixelRatio: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
      };
      const response = (await browser.runtime.sendMessage(request)) as CaptureResponse | undefined;
      if (!response?.ok) showError(response?.error ?? t('errorCaptureFailed'));
    } catch {
      showError(t('errorCaptureFailed'));
    }
  }

  // ---------- Element mode ----------

  /** The element's box, clipped to the viewport. */
  function visibleRect(element: Element): ViewportRect | null {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    return right - left >= 2 && bottom - top >= 2
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : null;
  }

  function describe(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : '';
    const label = className ? `${tag}.${className}` : tag;
    return label.length > 28 ? `${label.slice(0, 27)}…` : label;
  }

  /** Small inline bits (an icon, a word) are rarely what people mean: grow to a sensible box. */
  function meaningful(element: Element | null): Element | null {
    let current = element;
    while (current && current !== document.documentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= MIN_ELEMENT_SIZE && rect.height >= MIN_ELEMENT_SIZE) return current;
      current = current.parentElement;
    }
    return current;
  }

  function elementAt(x: number, y: number): Element | null {
    // Look through our own overlay at the page underneath.
    host.style.pointerEvents = 'none';
    const found = document.elementFromPoint(x, y);
    host.style.pointerEvents = '';
    return found && found !== host ? found : null;
  }

  function highlight(element: Element | null) {
    target = element;
    const rect = element ? visibleRect(element) : null;
    if (!element || !rect) {
      box.style.display = 'none';
      return;
    }
    showBox(rect, describe(element));
  }

  function walk(direction: 'up' | 'down') {
    if (!target) return;
    if (direction === 'up') {
      let parent = target.parentElement;
      // Skip wrappers that are pixel-identical to the current box.
      while (parent && parent !== document.documentElement) {
        const a = target.getBoundingClientRect();
        const b = parent.getBoundingClientRect();
        if (Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1) break;
        parent = parent.parentElement;
      }
      if (!parent || parent === document.documentElement) return;
      trail.push(target);
      highlight(parent);
    } else {
      const child = trail.pop();
      if (child) highlight(child);
    }
  }

  // ---------- Events ----------

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
      return;
    }
    if (mode !== 'element') return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      walk(event.key === 'ArrowUp' ? 'up' : 'down');
    } else if (event.key === 'Enter' && target) {
      event.preventDefault();
      event.stopPropagation();
      const rect = visibleRect(target);
      if (rect) void capture(rect);
    }
  }

  layer.addEventListener('mousemove', (event) => {
    if (mode === 'element') {
      const element = meaningful(elementAt(event.clientX, event.clientY));
      if (element !== target && !trail.includes(element as Element)) {
        trail = [];
        highlight(element);
      }
      return;
    }
    if (!start) {
      guideX.style.top = `${event.clientY}px`;
      guideY.style.left = `${event.clientX}px`;
      return;
    }
    showBox(rectFrom(start.x, start.y, event.clientX, event.clientY));
  });

  layer.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (mode === 'element') {
      const rect = target ? visibleRect(target) : null;
      if (rect) void capture(rect);
      return;
    }
    start = { x: event.clientX, y: event.clientY };
    layer.classList.add('selecting');
    showBox({ ...start, width: 0, height: 0 });
  });

  layer.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cleanup();
  });

  // The page never scrolls under the overlay; in element mode the wheel walks parent/child.
  layer.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (mode === 'element' && Math.abs(event.deltaY) > 2) walk(event.deltaY < 0 ? 'up' : 'down');
    },
    { passive: false },
  );

  layer.addEventListener('mouseup', (event) => {
    if (mode !== 'area' || !start || finished) return;
    const rect = rectFrom(start.x, start.y, event.clientX, event.clientY);
    start = null;
    if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
      layer.classList.remove('selecting');
      box.style.display = 'none';
      return;
    }
    void capture(rect);
  });

  window.addEventListener('keydown', handleKeyDown, true);
});
