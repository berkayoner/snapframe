import { findSensitive } from '@/src/capture/snapshot/sensitive';
import type { PageSnapshot, SnapshotOptions, SnapshotRect } from '@/src/capture/snapshot/types';

const MAX_BOXES = 3000;
const MAX_SENSITIVE = 400;
const MIN_BOX = 10;
const SKIPPED_TAGS = new Set([
  'HTML',
  'BODY',
  'HEAD',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'BR',
  'WBR',
  'META',
  'LINK',
]);

function isVisible(element: Element): boolean {
  const checkVisibility = (element as Element & { checkVisibility?: (options?: object) => boolean }).checkVisibility;
  if (checkVisibility) return checkVisibility.call(element, { opacityProperty: true, visibilityProperty: true });
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
}

/**
 * Runs inside the page (injected by the background via the page-snapshot
 * unlisted script). Collects element boxes and sensitive-data positions
 * inside `region`, in CSS px relative to the region's top-left.
 */
export function collectPageSnapshot(region: SnapshotRect, options: SnapshotOptions): PageSnapshot {
  const offsetX = options.documentCoords ? window.scrollX : 0;
  const offsetY = options.documentCoords ? window.scrollY : 0;

  /** Viewport rect -> region-relative rect, clipped to the region; null if (nearly) outside. */
  const toLocal = (rect: DOMRect | DOMRectReadOnly, minSize: number): SnapshotRect | null => {
    const left = Math.max(0, rect.left + offsetX - region.x);
    const top = Math.max(0, rect.top + offsetY - region.y);
    const right = Math.min(region.width, rect.right + offsetX - region.x);
    const bottom = Math.min(region.height, rect.bottom + offsetY - region.y);
    const width = right - left;
    const height = bottom - top;
    if (width < minSize || height < minSize) return null;
    return { x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) };
  };

  const skipped = (element: Element | null) => !!(options.skipSelector && element?.closest(options.skipSelector));

  // ---- Element boxes ----
  const boxes: number[] = [];
  const seen = new Set<string>();
  const elements = document.body ? document.body.getElementsByTagName('*') : [];
  for (const element of Array.from(elements)) {
    if (boxes.length >= MAX_BOXES * 4) break;
    // Shapes inside an <svg> aren't useful targets; the <svg> box itself is.
    const svgRoot = element.closest('svg');
    if (SKIPPED_TAGS.has(element.tagName) || (svgRoot && svgRoot !== element) || skipped(element)) continue;
    const local = toLocal(element.getBoundingClientRect(), MIN_BOX);
    if (!local) continue;
    // Wrappers that fill the whole region make useless snap targets.
    if (local.width >= region.width - 2 && local.height >= region.height - 2) continue;
    const key = `${local.x},${local.y},${local.width},${local.height}`;
    if (seen.has(key) || !isVisible(element)) continue;
    seen.add(key);
    boxes.push(local.x, local.y, local.width, local.height);
  }

  // ---- Sensitive data ----
  const sensitive: PageSnapshot['sensitive'] = [];
  const range = document.createRange();
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || SKIPPED_TAGS.has(parent.tagName) || skipped(parent)) return NodeFilter.FILTER_REJECT;
        return (node.nodeValue?.length ?? 0) >= 6 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    for (let node = walker.nextNode(); node && sensitive.length < MAX_SENSITIVE; node = walker.nextNode()) {
      for (const match of findSensitive(node.nodeValue ?? '')) {
        range.setStart(node, match.start);
        range.setEnd(node, match.end);
        for (const rect of Array.from(range.getClientRects())) {
          const local = toLocal(rect, 2);
          if (local) sensitive.push({ kind: match.kind, ...local });
        }
      }
    }
  }

  // Form fields show values that aren't text nodes.
  for (const field of Array.from(document.querySelectorAll('input, textarea'))) {
    if (sensitive.length >= MAX_SENSITIVE) break;
    const input = field as HTMLInputElement | HTMLTextAreaElement;
    if ((input as HTMLInputElement).type === 'password' || !input.value || skipped(input)) continue;
    const [first] = findSensitive(input.value);
    if (!first) continue;
    const local = toLocal(input.getBoundingClientRect(), 4);
    if (local && isVisible(input)) sensitive.push({ kind: first.kind, ...local });
  }

  return { boxes, sensitive };
}
