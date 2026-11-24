/**
 * Timeline for animated exports (pure, unit-tested): annotations appear one
 * after another, and an optional "camera" glides to each one before it
 * appears, then pulls back to the whole picture at the end.
 *
 * All rects are in the coordinates of the finished picture (frame and
 * device mockup included). Times are in seconds.
 */

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

export interface Timeline {
  duration: number;
  items: TimelineItem[];
  /** Camera keyframes (rects to show); empty when the camera stays on the whole picture. */
  camera: CameraKey[];
}

export interface TimelineOptions {
  speed: AnimationSpeed;
  /** Zoom towards each annotation as it appears. */
  focus: boolean;
  /** The finished picture's size. */
  width: number;
  height: number;
}

const SPEED_FACTOR: Record<AnimationSpeed, number> = { slow: 1.35, normal: 1, fast: 0.7 };

/** Entrance lengths per type: arrows "draw", badges pop. */
function entranceFor(type: string): number {
  if (type === 'arrow') return 0.6;
  if (type === 'shape' || type === 'ellipse') return 0.55;
  if (type === 'highlight') return 0.45;
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
    for (const input of inputs) {
      const duration = entranceFor(input.type) * factor;
      items.push({ ...input, start: time, duration });
      time += Math.max(0.3, (duration + 0.25) * crowd) * factor;
    }
    time += 1.6 * factor;
  }

  return { duration: Math.max(time, 1.5), items, camera };
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
