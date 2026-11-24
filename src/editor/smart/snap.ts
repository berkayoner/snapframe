/**
 * Page-aware geometry for the editor (pure, unit-tested): snapping drawn
 * rectangles to the captured page's element boxes, finding the element
 * under the pointer, and checking which sensitive regions are redacted.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  /** 'x' = a vertical line at x = value; 'y' = a horizontal line at y = value. */
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
}

export interface SnapResult {
  rect: Rect;
  guides: SnapGuide[];
}

interface EdgeCandidate {
  value: number;
  box: Rect;
}

function nearest(value: number, candidates: EdgeCandidate[], threshold: number): EdgeCandidate | null {
  let best: EdgeCandidate | null = null;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.value - value);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snaps each edge of `rect` to the closest element edge within `threshold`
 * (image px). Only boxes near the rect are considered, so far-away
 * elements that happen to share a coordinate don't pull it around.
 */
export function snapRect(rect: Rect, boxes: Rect[], threshold: number): SnapResult {
  const reach = threshold * 6;
  const nearby = boxes.filter(
    (box) =>
      box.x <= rect.x + rect.width + reach &&
      box.x + box.width >= rect.x - reach &&
      box.y <= rect.y + rect.height + reach &&
      box.y + box.height >= rect.y - reach,
  );
  if (nearby.length === 0) return { rect, guides: [] };

  const xs: EdgeCandidate[] = [];
  const ys: EdgeCandidate[] = [];
  for (const box of nearby) {
    xs.push({ value: box.x, box }, { value: box.x + box.width, box });
    ys.push({ value: box.y, box }, { value: box.y + box.height, box });
  }

  let left = rect.x;
  let right = rect.x + rect.width;
  let top = rect.y;
  let bottom = rect.y + rect.height;
  const snapped: Array<{ axis: 'x' | 'y'; hit: EdgeCandidate }> = [];

  const leftHit = nearest(left, xs, threshold);
  if (leftHit) {
    left = leftHit.value;
    snapped.push({ axis: 'x', hit: leftHit });
  }
  const rightHit = nearest(right, xs, threshold);
  if (rightHit && rightHit.value > left) {
    right = rightHit.value;
    snapped.push({ axis: 'x', hit: rightHit });
  }
  const topHit = nearest(top, ys, threshold);
  if (topHit) {
    top = topHit.value;
    snapped.push({ axis: 'y', hit: topHit });
  }
  const bottomHit = nearest(bottom, ys, threshold);
  if (bottomHit && bottomHit.value > top) {
    bottom = bottomHit.value;
    snapped.push({ axis: 'y', hit: bottomHit });
  }

  const result: Rect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  const guides = snapped.map(({ axis, hit }) =>
    axis === 'x'
      ? {
          axis,
          value: hit.value,
          from: Math.min(result.y, hit.box.y),
          to: Math.max(result.y + result.height, hit.box.y + hit.box.height),
        }
      : {
          axis,
          value: hit.value,
          from: Math.min(result.x, hit.box.x),
          to: Math.max(result.x + result.width, hit.box.x + hit.box.width),
        },
  );
  return { rect: result, guides };
}

/** The smallest box containing the point - the element the user is pointing at. */
export function boxAtPoint(x: number, y: number, boxes: Rect[], minSize = 0): Rect | null {
  let best: Rect | null = null;
  let bestArea = Infinity;
  for (const box of boxes) {
    if (box.width < minSize || box.height < minSize) continue;
    if (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) continue;
    const area = box.width * box.height;
    if (area < bestArea) {
      best = box;
      bestArea = area;
    }
  }
  return best;
}

export function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** True when `region` is (almost) entirely under one of the redaction rects. */
export function isCovered(region: Rect, redactions: Rect[], ratio = 0.9): boolean {
  const area = Math.max(1, region.width * region.height);
  return redactions.some((redaction) => intersectionArea(region, redaction) / area >= ratio);
}

export function expandRect(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

export function offsetRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}
