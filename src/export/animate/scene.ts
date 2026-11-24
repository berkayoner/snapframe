import Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { NO_BACKGROUND } from '@/src/editor/beautify/presets';
import { composeFrame, renderFinalCanvas } from '@/src/export/render';
import { contentPlacement, type ContentPlacement } from '@/src/export/layout';
import { getMockupById } from '@/src/mockups/registry';
import { renderOrder } from '@/src/annotations/order';
import { drawCursor } from '@/src/export/animate/cursor';
import type { EditorObject } from '@/src/shared/types';
import {
  buildScrollTimeline,
  buildTimeline,
  cameraAt,
  canScroll,
  scrollScreenHeight,
  easeOutBack,
  easeOutCubic,
  itemProgress,
  scrollOffsetAt,
  type AnimationSpeed,
  type Rect,
  type Timeline,
  type TimelineInput,
} from '@/src/export/animate/timeline';

/** Annotation types that animate in. Redactions are never animated: they stay on from the first frame. */
export const ANIMATED_TYPES = new Set([
  'shape',
  'ellipse',
  'arrow',
  'text',
  'step',
  'highlight',
  'magnify',
  'spotlight',
]);

/** `notes`: annotations appear one by one. `scroll`: a tall capture scrolls by inside a fixed screen. */
export type AnimationMode = 'notes' | 'scroll';

export interface PlaybackOptions {
  speed: AnimationSpeed;
  /** Notes mode: the camera zooms towards each annotation. */
  focus: boolean;
  /** Notes mode: a pointer clicks each annotation into place. */
  cursor: boolean;
}

export interface SceneOptions extends PlaybackOptions {
  mode: AnimationMode;
  /** The capture's browser viewport in CSS px (full-page captures) - sizes the scroll mode's screen. */
  viewport?: { width: number; height: number };
}

export interface AnimationScene {
  mode: AnimationMode;
  /** The finished picture's size (frame and mockup included). */
  width: number;
  height: number;
  itemCount: number;
  timeline: Timeline;
  setOptions: (options: PlaybackOptions) => void;
  /** Draws the frame at `time` (seconds) into `target`, scaled to `outWidth` x `outHeight`. */
  renderFrame: (time: number, target: CanvasRenderingContext2D, outWidth: number, outHeight: number) => void;
  dispose: () => void;
}

interface AnimatedNode {
  node: Konva.Node;
  object: EditorObject;
  /** Local size (for scaling around the center). */
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  /** Outline length, for the "drawing" stroke reveal. */
  perimeter: number;
  /** The shape's own dash (a dashed outline), restored once the reveal is done. */
  dash: number[];
  dashEnabled: boolean;
}

function perimeterOf(object: EditorObject): number {
  const w = Math.abs(object.width);
  const h = Math.abs(object.height);
  if (object.type === 'ellipse') {
    const a = w / 2;
    const b = h / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  return 2 * (w + h);
}

/**
 * A shape's own dash pattern (a dashed outline), to restore after the
 * outline-drawing reveal. Konva leaves `dash` undefined on shapes that never
 * set one (highlights, lenses, spotlights, ...).
 */
function ownDash(node: Konva.Node): { dash: number[]; dashEnabled: boolean } {
  if (!(node instanceof Konva.Shape)) return { dash: [], dashEnabled: false };
  const dash = (node.dash() as number[] | undefined) ?? [];
  return { dash, dashEnabled: node.dashEnabled() && dash.length > 0 };
}

/** Puts one annotation into its entrance state at progress `p` (0..1). */
function applyEntrance(entry: AnimatedNode, p: number): void {
  const { node, object } = entry;
  if (p <= 0) {
    node.visible(false);
    return;
  }
  node.visible(true);
  const done = p >= 1;

  switch (object.type) {
    case 'arrow': {
      const e = easeOutCubic(p);
      (node as Konva.Arrow).points([0, 0, object.width * e, object.height * e]);
      node.opacity(entry.opacity * Math.min(1, p * 4));
      break;
    }
    case 'shape':
    case 'ellipse': {
      // The outline draws itself; a fill fades in with it.
      const shape = node as Konva.Shape;
      const length = entry.perimeter;
      if (done) {
        shape.dash(entry.dash);
        shape.dashEnabled(entry.dashEnabled);
      } else {
        shape.dash([length, length]);
        shape.dashOffset(length * (1 - easeOutCubic(p)));
        shape.dashEnabled(true);
      }
      node.opacity(entry.opacity * Math.min(1, 0.4 + p));
      break;
    }
    case 'highlight': {
      // A marker sweep from left to right.
      node.scaleX(done ? 1 : easeOutCubic(p));
      node.opacity(entry.opacity);
      break;
    }
    case 'spotlight': {
      // The page dims around the spotlight.
      node.opacity(entry.opacity * easeOutCubic(p));
      break;
    }
    default: {
      // Steps, labels and lenses pop in around their center.
      const scale = done ? 1 : 0.5 + 0.5 * easeOutBack(p);
      node.scale({ x: scale, y: scale });
      node.position({
        x: entry.x + (entry.width * (1 - scale)) / 2,
        y: entry.y + (entry.height * (1 - scale)) / 2,
      });
      node.opacity(entry.opacity * Math.min(1, p * 3));
    }
  }
}

/** Where an annotation draws its stroke from and to (arrows and highlights), offset into picture space. */
function strokeOf(object: EditorObject, bounds: Rect, dx: number, dy: number): TimelineInput['stroke'] {
  if (object.type === 'arrow') {
    return {
      from: { x: object.x + dx, y: object.y + dy },
      to: { x: object.x + object.width + dx, y: object.y + object.height + dy },
    };
  }
  if (object.type === 'highlight') {
    const y = bounds.y + bounds.height / 2;
    return { from: { x: bounds.x, y }, to: { x: bounds.x + bounds.width, y } };
  }
  return undefined;
}

/**
 * Builds the animated version of the current editor document. The static
 * picture (screenshot, redactions, frame, mockup) is rendered once with the
 * export pipeline; the animated annotations are cloned into a private,
 * off-screen Konva stage and re-drawn per frame - the editor itself is
 * never touched, so editing state can't leak into (or flicker during) the
 * export.
 *
 * In scroll mode the frame is rendered once around an empty screen, and
 * every frame draws the scrolled slice of the content into that screen.
 */
export async function createAnimationScene(stage: Konva.Stage, options: SceneOptions): Promise<AnimationScene> {
  const editor = useEditorStore.getState();
  const mockup = getMockupById(editor.mockupId);
  const animated = renderOrder(editor.objects).filter((object) => ANIMATED_TYPES.has(object.type));
  const contentWidth = Math.round(editor.canvasWidth);
  const contentHeight = Math.round(editor.canvasHeight);
  const scroll = options.mode === 'scroll' && canScroll(contentWidth, contentHeight, editor.unit, options.viewport);

  const render = (plain: boolean) =>
    renderFinalCanvas(stage, {
      canvasWidth: editor.canvasWidth,
      canvasHeight: editor.canvasHeight,
      zoom: editor.zoom,
      unit: editor.unit,
      exportScale: 1,
      beautify: plain ? { ...editor.beautify, background: NO_BACKGROUND } : editor.beautify,
      mockup: plain ? undefined : mockup,
      hideObjectIds: animated.map((object) => object.id),
    });

  // `base` is the whole static picture (notes) or the frame around an empty screen (scroll).
  let base: HTMLCanvasElement;
  let content: HTMLCanvasElement | null = null;
  let screenHeight = contentHeight;
  let placement: ContentPlacement;
  if (scroll) {
    screenHeight = scrollScreenHeight(contentWidth, contentHeight, editor.unit, options.viewport);
    content = await render(true);
    const screen = document.createElement('canvas');
    screen.width = contentWidth;
    screen.height = screenHeight;
    const screenCtx = screen.getContext('2d');
    if (!screenCtx) throw new Error('Canvas 2D context unavailable.');
    screenCtx.fillStyle = '#ffffff';
    screenCtx.fillRect(0, 0, contentWidth, screenHeight);
    base = composeFrame(screen, editor.beautify, mockup, editor.unit);
    placement = contentPlacement(contentWidth, screenHeight, editor.unit, editor.beautify, mockup);
  } else {
    base = await render(false);
    placement = contentPlacement(contentWidth, contentHeight, editor.unit, editor.beautify, mockup);
  }

  // Private stage holding clones of the animated annotations (in drawing order).
  const container = document.createElement('div');
  const offStage = new Konva.Stage({ container, width: contentWidth, height: contentHeight });
  const offLayer = new Konva.Layer({ listening: false });
  offStage.add(offLayer);
  offLayer.getCanvas().setPixelRatio(1);

  const entries: AnimatedNode[] = [];
  for (const object of animated) {
    const original = stage.findOne((node: Konva.Node) => node.id() === object.id);
    if (!original) continue;
    const node = original.clone({ draggable: false, listening: false, visible: true });
    offLayer.add(node);
    const rect = node.getClientRect({ relativeTo: offLayer, skipShadow: true });
    entries.push({
      node,
      object,
      width: rect.width,
      height: rect.height,
      x: node.x(),
      y: node.y(),
      opacity: object.opacity ?? 1,
      perimeter: perimeterOf(object),
      ...ownDash(node),
    });
  }

  // Notes timelines work in picture space; scroll timelines in content space.
  const dx = scroll ? 0 : placement.x;
  const dy = scroll ? 0 : placement.y;
  const inputs: TimelineInput[] = entries.map((entry) => {
    const rect = entry.node.getClientRect({ relativeTo: offLayer, skipShadow: true });
    const bounds = { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
    return { id: entry.object.id, type: entry.object.type, bounds, stroke: strokeOf(entry.object, bounds, dx, dy) };
  });

  const full: Rect = { x: 0, y: 0, width: base.width, height: base.height };
  const buildFor = (playback: PlaybackOptions) =>
    scroll
      ? buildScrollTimeline(inputs, { speed: playback.speed, contentHeight, viewportHeight: screenHeight })
      : buildTimeline(inputs, { ...playback, width: base.width, height: base.height });

  const picture = document.createElement('canvas');
  picture.width = base.width;
  picture.height = base.height;
  const pictureCtx = picture.getContext('2d');
  if (!pictureCtx) throw new Error('Canvas 2D context unavailable.');

  const scene: AnimationScene = {
    mode: scroll ? 'scroll' : 'notes',
    width: base.width,
    height: base.height,
    itemCount: entries.length,
    timeline: buildFor(options),
    setOptions(next) {
      scene.timeline = buildFor(next);
    },
    renderFrame(time, target, outWidth, outHeight) {
      const timeline = scene.timeline;
      const items = new Map(timeline.items.map((item) => [item.id, item]));
      for (const entry of entries) {
        const item = items.get(entry.object.id);
        applyEntrance(entry, item ? itemProgress(item, time) : 1);
      }
      offLayer.draw();
      const annotations = offLayer.getNativeCanvasElement();

      pictureCtx.clearRect(0, 0, picture.width, picture.height);
      pictureCtx.drawImage(base, 0, 0);
      pictureCtx.save();
      pictureCtx.beginPath();
      pictureCtx.roundRect(placement.x, placement.y, placement.width, screenHeight, placement.radii);
      pictureCtx.clip();
      if (content && timeline.scroll) {
        const offset = scrollOffsetAt(timeline.scroll, time);
        const slice = [
          0,
          offset,
          contentWidth,
          screenHeight,
          placement.x,
          placement.y,
          contentWidth,
          screenHeight,
        ] as const;
        pictureCtx.drawImage(content, ...slice);
        pictureCtx.drawImage(annotations, ...slice);
      } else {
        pictureCtx.drawImage(annotations, placement.x, placement.y);
      }
      pictureCtx.restore();

      const camera = cameraAt(timeline, time, full);
      // Video has no alpha: transparent frame areas become white, not black.
      target.fillStyle = '#ffffff';
      target.fillRect(0, 0, outWidth, outHeight);
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = 'high';
      target.drawImage(picture, camera.x, camera.y, camera.width, camera.height, 0, 0, outWidth, outHeight);
      if (timeline.cursor) drawCursor(target, timeline.cursor, time, camera, full.width, outWidth, outHeight);
    },
    dispose() {
      offStage.destroy();
    },
  };
  return scene;
}

/** Output size that fits within `maxSide`, with even dimensions (required by H.264). */
export function fitOutputSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
