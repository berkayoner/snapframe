/**
 * Timelines for animated exports (pure, unit-tested).
 *
 * - Notes: annotations appear one after another. An optional "camera" glides
 *   to each one before it appears and pulls back at the end, and an optional
 *   pointer moves to each one and "clicks" it into place (arrows and
 *   highlights are dragged along their stroke).
 * - Scroll: a tall capture scrolls from top to bottom inside a fixed screen,
 *   and annotations appear as they come into view.
 *
 * Notes rects are in the finished picture's coordinates (frame and device
 * mockup included); scroll rects are in the content's own coordinates.
 * Times are in seconds.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnimationSpeed = 'slow' | 'normal' | 'fast';

export interface TimelineInput {
  id: string;
  type: string;
  bounds: Rect;
  /** For annotations that draw along a line (arrows, highlights): where the stroke starts and ends. */
  stroke?: { from: Point; to: Point };
}

export interface TimelineItem extends TimelineInput {
  /** When the entrance starts. */
  start: number;
  /** Entrance length. */
  duration: number;
}

export interface CameraKey {
  time: number;
  rect: Rect;
}

export interface CursorKey {
  time: number;
  point: Point;
  /** Reaching this key drags along a stroke (straight, eased like the stroke) instead of gliding. */
  drag?: boolean;
}

export interface CursorPath {
  keys: CursorKey[];
  /** While pressed, the pointer shrinks slightly. */
  presses: Array<{ start: number; end: number }>;
  /** Click moments, shown as a ripple. */
  clicks: Array<{ time: number; point: Point }>;
  /** The pointer fades out from this time. */
  fadeOut: number;
}

export interface ScrollPlan {
  /** Content px scrolled in total. */
  distance: number;
  start: number;
  end: number;
  /** Seconds spent speeding up (and slowing down). */
  ramp: number;
}

export interface Timeline {
  duration: number;
  items: TimelineItem[];
  /** Camera keyframes (rects to show); empty when the camera stays on the whole picture. */
  camera: CameraKey[];
  cursor: CursorPath | null;
  scroll: ScrollPlan | null;
}

export interface TimelineOptions {
  speed: AnimationSpeed;
  /** Zoom towards each annotation as it appears. */
  focus: boolean;
  /** A pointer moves to each annotation and clicks it into place. */
  cursor?: boolean;
  /** The finished picture's size. */
  width: number;
  height: number;
}

const SPEED_FACTOR: Record<AnimationSpeed, number> = { slow: 1.35, normal: 1, fast: 0.7 };

/** Entrance lengths per type: arrows "draw", badges pop. */
function entranceFor(type: string): number {
  if (type === 'arrow') return 0.6;
  if (type === 'shape' || type === 'ellipse') return 0.55;
  if (type === 'spotlight') return 0.5;
  if (type === 'highlight' || type === 'magnify') return 0.45;
  return 0.4;
}

/**
 * The camera rect that frames `bounds` with breathing room, matching the
 * picture's aspect ratio, never closer than ~2.2x, and kept inside the picture.
 */
export function focusRect(bounds: Rect, width: number, height: number): Rect {
  const aspect = width / height;
  const margin = Math.max(bounds.width, bounds.height) * 0.6 + Math.min(width, height) * 0.06;
  let w = bounds.width + margin * 2;
  let h = bounds.height + margin * 2;
  // Match the output aspect ratio.
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  // Don't zoom in too far (keeps context), and never past the whole picture.
  const minW = width / 2.2;
  if (w < minW) {
    w = minW;
    h = w / aspect;
  }
  if (w > width || h > height) {
    w = width;
    h = height;
  }
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const x = Math.min(width - w, Math.max(0, cx - w / 2));
  const y = Math.min(height - h, Math.max(0, cy - h / 2));
  return { x, y, width: w, height: h };
}

export function buildTimeline(inputs: TimelineInput[], options: TimelineOptions): Timeline {
  const factor = SPEED_FACTOR[options.speed];
  const full: Rect = { x: 0, y: 0, width: options.width, height: options.height };
  const items: TimelineItem[] = [];
  const camera: CameraKey[] = [];
  const withCursor = !!options.cursor && inputs.length > 0;
  // Long sequences move faster so the clip stays watchable.
  const crowd = inputs.length > 8 ? 8 / inputs.length : 1;

  let time = 0.6 * factor;
  if (options.focus && inputs.length > 0) {
    camera.push({ time: 0, rect: full }, { time, rect: full });
    for (const input of inputs) {
      const travel = 0.75 * factor * crowd;
      const target = focusRect(input.bounds, options.width, options.height);
      const arrive = time + travel;
      camera.push({ time: arrive, rect: target });
      const duration = entranceFor(input.type) * factor;
      items.push({ ...input, start: arrive - 0.12 * factor, duration });
      time = arrive + duration + 0.55 * factor * crowd;
      camera.push({ time, rect: target });
    }
    const pullBack = time + 0.85 * factor;
    camera.push({ time: pullBack, rect: full });
    time = pullBack + 1.4 * factor;
  } else {
    // The pointer needs time to travel to each annotation.
    const travel = withCursor ? 0.75 * factor * Math.max(0.6, crowd) : 0;
    time += travel;
    for (const input of inputs) {
      const duration = entranceFor(input.type) * factor;
      items.push({ ...input, start: time, duration });
      time += Math.max(0.3, (duration + 0.25) * crowd) * factor + travel;
    }
    time += 1.6 * factor;
  }

  return {
    duration: Math.max(time, 1.5),
    items,
    camera,
    cursor: withCursor ? buildCursorPath(items, options.width, options.height, factor) : null,
    scroll: null,
  };
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The pointer's choreography: it starts low on the picture, glides to each
 * annotation just before it appears, clicks badges, boxes and labels into
 * place, and drags arrows and highlights along their stroke while they draw.
 */
export function buildCursorPath(items: TimelineItem[], width: number, height: number, factor = 1): CursorPath {
  const startPoint = { x: width * 0.66, y: height * 0.84 };
  const keys: CursorKey[] = [{ time: 0, point: startPoint }];
  const presses: CursorPath['presses'] = [];
  const clicks: CursorPath['clicks'] = [];
  let lastTime = 0;
  let lastPoint = startPoint;

  for (const item of items) {
    const target = item.stroke ? item.stroke.from : center(item.bounds);
    const arrive = Math.max(lastTime + 0.08, item.start - 0.1 * factor);
    const depart = Math.max(lastTime, arrive - 0.7 * factor);
    if (depart > lastTime) keys.push({ time: depart, point: lastPoint });
    keys.push({ time: arrive, point: target });

    if (item.stroke) {
      const begin = Math.max(arrive, item.start);
      const end = Math.max(begin + 0.05, item.start + item.duration);
      if (begin > arrive) keys.push({ time: begin, point: target });
      keys.push({ time: end, point: item.stroke.to, drag: true });
      presses.push({ start: begin - 0.05, end });
      lastTime = end;
      lastPoint = item.stroke.to;
    } else {
      const at = Math.max(arrive, item.start);
      presses.push({ start: at - 0.06, end: at + 0.1 });
      clicks.push({ time: at, point: target });
      lastTime = at + 0.1;
      lastPoint = target;
    }
  }
  return { keys, presses, clicks, fadeOut: lastTime + 0.7 * factor };
}

export interface CursorState {
  point: Point;
  /** 0 = released, 1 = fully pressed. */
  pressed: number;
  opacity: number;
}

/** A slightly curved glide from `a` to `b` (hand movements are rarely straight). */
function glide(a: Point, b: Point, t: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = (a.x + b.x) / 2 - dy * 0.16;
  const cy = (a.y + b.y) / 2 + dx * 0.16;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y };
}

export function cursorAt(path: CursorPath, time: number): CursorState {
  const { keys } = path;
  let point = keys[keys.length - 1]?.point ?? { x: 0, y: 0 };
  if (keys[0] && time <= keys[0].time) {
    point = keys[0].point;
  } else {
    for (let i = 1; i < keys.length; i++) {
      const previous = keys[i - 1]!;
      const next = keys[i]!;
      if (time > next.time) continue;
      const span = next.time - previous.time;
      const t = span <= 0 ? 1 : (time - previous.time) / span;
      if (next.drag) {
        const e = easeOutCubic(t);
        point = {
          x: previous.point.x + (next.point.x - previous.point.x) * e,
          y: previous.point.y + (next.point.y - previous.point.y) * e,
        };
      } else {
        point = glide(previous.point, next.point, easeInOutCubic(t));
      }
      break;
    }
  }

  let pressed = 0;
  for (const press of path.presses) {
    if (time <= press.start || time >= press.end) continue;
    pressed = Math.max(pressed, Math.min(1, (time - press.start) / 0.06, (press.end - time) / 0.06));
  }
  const opacity = Math.max(0, Math.min(1, time / 0.25, 1 - (time - path.fadeOut) / 0.4));
  return { point, pressed, opacity };
}

/**
 * Height of the "screen" a scroll video shows, in content px: the captured
 * browser viewport when known, otherwise a laptop-like 16:10 (or a phone-like
 * 9:16 for narrow, mobile-width pages).
 */
export function scrollScreenHeight(
  contentWidth: number,
  contentHeight: number,
  unit: number,
  viewport?: { width: number; height: number },
): number {
  const height =
    viewport && viewport.width > 0 && viewport.height > 0
      ? viewport.height * unit
      : contentWidth / unit >= 700
        ? (contentWidth * 10) / 16
        : (contentWidth * 16) / 9;
  return Math.round(Math.min(contentHeight, Math.max(height, contentWidth * 0.3)));
}

/** A scroll video only makes sense when there is at least a quarter screen to scroll. */
export function canScroll(
  contentWidth: number,
  contentHeight: number,
  unit: number,
  viewport?: { width: number; height: number },
): boolean {
  return contentHeight >= scrollScreenHeight(contentWidth, contentHeight, unit, viewport) * 1.25;
}

/** Viewport heights scrolled per second. */
const SCROLL_RATE: Record<AnimationSpeed, number> = { slow: 0.55, normal: 0.8, fast: 1.2 };

export interface ScrollTimelineOptions {
  speed: AnimationSpeed;
  /** Content height and the visible screen's height, in content px. */
  contentHeight: number;
  viewportHeight: number;
}

/** Scroll position (content px) at `time`: holds, eases into a steady scroll, eases out, holds. */
export function scrollOffsetAt(plan: ScrollPlan, time: number): number {
  const total = plan.end - plan.start;
  if (plan.distance <= 0 || total <= 0 || time <= plan.start) return 0;
  if (time >= plan.end) return plan.distance;
  const t = time - plan.start;
  const ramp = Math.min(plan.ramp, total / 2);
  const speed = plan.distance / (total - ramp);
  if (t < ramp) return (speed / (2 * ramp)) * t * t;
  if (t > total - ramp) {
    const remaining = total - t;
    return plan.distance - (speed / (2 * ramp)) * remaining * remaining;
  }
  return speed * (t - ramp / 2);
}

/** The first moment the scroll reaches `offset` (the scroll only moves down). */
export function timeAtOffset(plan: ScrollPlan, offset: number): number {
  if (offset <= 0) return plan.start;
  if (offset >= plan.distance) return plan.end;
  let low = plan.start;
  let high = plan.end;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (scrollOffsetAt(plan, middle) < offset) low = middle;
    else high = middle;
  }
  return high;
}

export function buildScrollTimeline(inputs: TimelineInput[], options: ScrollTimelineOptions): Timeline {
  const factor = SPEED_FACTOR[options.speed];
  const viewport = Math.max(1, options.viewportHeight);
  const distance = Math.max(0, options.contentHeight - viewport);
  const ramp = 0.7 * factor;
  const travel = Math.min(40, Math.max(1.2, distance / viewport / SCROLL_RATE[options.speed] + ramp));
  const start = 0.9 * factor;
  const plan: ScrollPlan = { distance, start, end: start + travel, ramp: Math.min(ramp, travel / 3) };

  // Each annotation appears once its center reaches ~70% of the screen's height.
  const items: TimelineItem[] = inputs
    .map((input) => {
      const needed = input.bounds.y + input.bounds.height / 2 - viewport * 0.7;
      return {
        ...input,
        start: needed <= 0 ? 0.35 * factor : timeAtOffset(plan, needed),
        duration: entranceFor(input.type) * factor,
      };
    })
    .sort((a, b) => a.start - b.start);
  // Annotations that come into view together still appear one after another.
  for (let i = 1; i < items.length; i++) {
    const minimum = items[i - 1]!.start + 0.14 * factor;
    if (items[i]!.start < minimum) items[i]!.start = minimum;
  }

  const lastEntrance = items.reduce((latest, item) => Math.max(latest, item.start + item.duration), 0);
  return {
    duration: Math.max(plan.end, lastEntrance) + 1.4 * factor,
    items,
    camera: [],
    cursor: null,
    scroll: plan,
  };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Overshoots slightly, then settles - for badges and labels. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** 0 before the item starts, 1 once its entrance is done. */
export function itemProgress(item: TimelineItem, time: number): number {
  if (time <= item.start) return 0;
  if (time >= item.start + item.duration) return 1;
  return (time - item.start) / item.duration;
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/** The camera rect at `time` (the whole picture when there is no camera). */
export function cameraAt(timeline: Timeline, time: number, full: Rect): Rect {
  const keys = timeline.camera;
  if (keys.length === 0) return full;
  if (time <= keys[0]!.time) return keys[0]!.rect;
  for (let i = 1; i < keys.length; i++) {
    const previous = keys[i - 1]!;
    const next = keys[i]!;
    if (time <= next.time) {
      const span = next.time - previous.time;
      const t = span <= 0 ? 1 : (time - previous.time) / span;
      return lerpRect(previous.rect, next.rect, easeInOutCubic(t));
    }
  }
  return keys[keys.length - 1]!.rect;
}
