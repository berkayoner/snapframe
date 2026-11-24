import { describe, expect, it } from 'vitest';
import {
  buildScrollTimeline,
  buildTimeline,
  canScroll,
  cursorAt,
  scrollOffsetAt,
  scrollScreenHeight,
  timeAtOffset,
  type TimelineInput,
} from '@/src/export/animate/timeline';

const PICTURE = { width: 1600, height: 1000 };

const inputs: TimelineInput[] = [
  { id: 'box', type: 'shape', bounds: { x: 100, y: 100, width: 300, height: 200 } },
  {
    id: 'arrow',
    type: 'arrow',
    bounds: { x: 600, y: 300, width: 200, height: 100 },
    stroke: { from: { x: 600, y: 300 }, to: { x: 800, y: 400 } },
  },
  { id: 'step', type: 'step', bounds: { x: 1200, y: 700, width: 40, height: 40 } },
];

describe('virtual pointer', () => {
  const timeline = buildTimeline(inputs, { speed: 'normal', focus: false, cursor: true, ...PICTURE });
  const path = timeline.cursor!;

  it('is only planned when asked for', () => {
    expect(buildTimeline(inputs, { speed: 'normal', focus: false, ...PICTURE }).cursor).toBeNull();
    expect(path).not.toBeNull();
  });

  it('moves forward in time and stays inside the picture', () => {
    for (let i = 1; i < path.keys.length; i++) {
      expect(path.keys[i]!.time).toBeGreaterThanOrEqual(path.keys[i - 1]!.time);
    }
    for (const key of path.keys) {
      expect(key.point.x).toBeGreaterThanOrEqual(0);
      expect(key.point.x).toBeLessThanOrEqual(PICTURE.width);
      expect(key.point.y).toBeGreaterThanOrEqual(0);
      expect(key.point.y).toBeLessThanOrEqual(PICTURE.height);
    }
  });

  it('clicks badges and boxes at their center, right as they appear', () => {
    const step = timeline.items.find((item) => item.id === 'step')!;
    const click = path.clicks.find((candidate) => Math.abs(candidate.time - step.start) < 1e-9)!;
    expect(click.point).toEqual({ x: 1220, y: 720 });
    const state = cursorAt(path, step.start);
    expect(state.point.x).toBeCloseTo(1220, 5);
    expect(state.point.y).toBeCloseTo(720, 5);
    expect(state.pressed).toBeCloseTo(1, 6);
  });

  it('drags arrows from tail to tip while they draw', () => {
    const arrow = timeline.items.find((item) => item.id === 'arrow')!;
    const atStart = cursorAt(path, arrow.start);
    const atEnd = cursorAt(path, arrow.start + arrow.duration);
    expect(atStart.point.x).toBeCloseTo(600, 5);
    expect(atStart.point.y).toBeCloseTo(300, 5);
    expect(atEnd.point.x).toBeCloseTo(800, 5);
    expect(atEnd.point.y).toBeCloseTo(400, 5);
    expect(cursorAt(path, arrow.start + arrow.duration / 2).pressed).toBe(1);
    expect(path.clicks.some((click) => Math.abs(click.time - arrow.start) < 1e-9)).toBe(false);
  });

  it('fades in at the start and out before the clip ends', () => {
    expect(cursorAt(path, 0).opacity).toBe(0);
    expect(cursorAt(path, 0.5).opacity).toBe(1);
    expect(path.fadeOut).toBeLessThan(timeline.duration);
    expect(cursorAt(path, timeline.duration).opacity).toBe(0);
  });

  it('leaves time to travel between annotations', () => {
    const plain = buildTimeline(inputs, { speed: 'normal', focus: false, ...PICTURE });
    expect(timeline.duration).toBeGreaterThan(plain.duration);
    for (let i = 1; i < timeline.items.length; i++) {
      const previous = timeline.items[i - 1]!;
      expect(timeline.items[i]!.start - (previous.start + previous.duration)).toBeGreaterThan(0.5);
    }
  });

  it('follows the camera timeline when focus is on', () => {
    const focused = buildTimeline(inputs, { speed: 'normal', focus: true, cursor: true, ...PICTURE });
    expect(focused.camera.length).toBeGreaterThan(0);
    expect(focused.cursor?.clicks).toHaveLength(2);
  });
});

describe('page scroll', () => {
  const plan = { distance: 3000, start: 1, end: 6, ramp: 0.7 };

  it('holds, eases in, scrolls steadily, eases out and holds', () => {
    expect(scrollOffsetAt(plan, 0)).toBe(0);
    expect(scrollOffsetAt(plan, 1)).toBe(0);
    expect(scrollOffsetAt(plan, 6)).toBe(3000);
    expect(scrollOffsetAt(plan, 9)).toBe(3000);
    let previous = 0;
    for (let time = 1; time <= 6; time += 1 / 60) {
      const offset = scrollOffsetAt(plan, time);
      expect(offset).toBeGreaterThanOrEqual(previous - 1e-9);
      // No jumps between frames.
      expect(offset - previous).toBeLessThan(15);
      previous = offset;
    }
  });

  it('finds when the scroll reaches an offset', () => {
    for (const offset of [0, 10, 1500, 2999, 3000]) {
      expect(scrollOffsetAt(plan, timeAtOffset(plan, offset))).toBeCloseTo(offset, 1);
    }
  });

  it('reveals annotations as they come into view', () => {
    const tall: TimelineInput[] = [
      { id: 'bottom', type: 'shape', bounds: { x: 0, y: 3400, width: 100, height: 100 } },
      { id: 'top', type: 'step', bounds: { x: 0, y: 100, width: 40, height: 40 } },
      { id: 'top2', type: 'step', bounds: { x: 60, y: 100, width: 40, height: 40 } },
    ];
    const timeline = buildScrollTimeline(tall, { speed: 'normal', contentHeight: 4000, viewportHeight: 1000 });
    const plan = timeline.scroll!;
    expect(plan.distance).toBe(3000);
    const [first, second, third] = timeline.items;
    expect(first!.id).toBe('top');
    // Annotations visible together still appear one after another.
    expect(second!.start).toBeGreaterThan(first!.start);
    expect(third!.id).toBe('bottom');
    // The bottom box shows up once its center is ~70% down the screen.
    expect(scrollOffsetAt(plan, third!.start) + 700).toBeCloseTo(3450, 0);
    expect(timeline.duration).toBeGreaterThan(plan.end);
    expect(timeline.camera).toHaveLength(0);
    expect(timeline.cursor).toBeNull();
  });

  it('sizes the screen from the captured viewport, or a sensible default', () => {
    // 2x capture of a 1440 x 900 viewport.
    expect(scrollScreenHeight(2880, 12000, 2, { width: 1440, height: 900 })).toBe(1800);
    // Desktop-width page without viewport data: 16:10.
    expect(scrollScreenHeight(1600, 8000, 1)).toBe(1000);
    // Mobile-width page: 9:16.
    expect(scrollScreenHeight(390, 5000, 1)).toBe(693);
    // Never taller than the content.
    expect(scrollScreenHeight(1600, 700, 1)).toBe(700);
    expect(canScroll(1600, 8000, 1)).toBe(true);
    expect(canScroll(1600, 1100, 1)).toBe(false);
  });
});
