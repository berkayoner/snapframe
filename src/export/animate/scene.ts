import Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { isFrameActive } from '@/src/editor/beautify/presets';
import { renderFinalCanvas } from '@/src/export/render';
import { deviceGeometry, type CornerRadii } from '@/src/mockups/geometry';
import { getMockupById } from '@/src/mockups/registry';
import type { EditorObject } from '@/src/shared/types';
import {
  buildTimeline,
  cameraAt,
  easeOutBack,
  easeOutCubic,
  itemProgress,
  type AnimationSpeed,
  type Rect,
  type Timeline,
} from '@/src/export/animate/timeline';

/** Annotation types that animate in. Redactions are never animated: they stay on from the first frame. */
export const ANIMATED_TYPES = new Set(['shape', 'ellipse', 'arrow', 'text', 'step', 'highlight']);

export interface SceneOptions {
  speed: AnimationSpeed;
  focus: boolean;
}

export interface AnimationScene {
  /** The finished picture's size (frame and mockup included). */
  width: number;
  height: number;
  itemCount: number;
  timeline: Timeline;
  setOptions: (options: SceneOptions) => void;
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
        shape.dashEnabled(false);
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
    default: {
      // Steps and labels pop in around their center.
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

/**
 * Builds the animated version of the current editor document. The static
 * picture (screenshot, redactions, frame, mockup) is rendered once with the
 * export pipeline; the animated annotations are cloned into a private,
 * off-screen Konva stage and re-drawn per frame - the editor itself is
 * never touched, so editing state can't leak into (or flicker during) the
 * export.
 */
export async function createAnimationScene(stage: Konva.Stage, options: SceneOptions): Promise<AnimationScene> {
  const editor = useEditorStore.getState();
  const mockup = getMockupById(editor.mockupId);
  const animated = editor.objects.filter((object) => ANIMATED_TYPES.has(object.type));

  const base = await renderFinalCanvas(stage, {
    canvasWidth: editor.canvasWidth,
    canvasHeight: editor.canvasHeight,
    zoom: editor.zoom,
    unit: editor.unit,
    exportScale: 1,
    beautify: editor.beautify,
    mockup,
    hideObjectIds: animated.map((object) => object.id),
  });

  // Where the screenshot sits inside the finished picture (same math as the export compositors).
  const contentWidth = Math.round(editor.canvasWidth);
  const contentHeight = Math.round(editor.canvasHeight);
  const padding = isFrameActive(editor.beautify) ? Math.round(editor.beautify.padding * editor.unit) : 0;
  let layout: Rect & { radii: CornerRadii };
  if (mockup) {
    const geometry = deviceGeometry(mockup.type, contentWidth, contentHeight, editor.unit);
    layout = {
      x: padding + geometry.screen.x,
      y: padding + geometry.screen.y,
      width: contentWidth,
      height: contentHeight,
      radii: geometry.screen.radii,
    };
  } else {
    const radius = isFrameActive(editor.beautify) ? Math.round(editor.beautify.radius * editor.unit) : 0;
    layout = {
      x: padding,
      y: padding,
      width: contentWidth,
      height: contentHeight,
      radii: [radius, radius, radius, radius],
    };
  }

  // Private stage holding clones of the animated annotations.
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
    });
  }

  const full: Rect = { x: 0, y: 0, width: base.width, height: base.height };
  const inputs = entries.map((entry) => {
    const rect = entry.node.getClientRect({ relativeTo: offLayer, skipShadow: true });
    return {
      id: entry.object.id,
      type: entry.object.type,
      bounds: { x: rect.x + layout.x, y: rect.y + layout.y, width: rect.width, height: rect.height },
    };
  });

  const picture = document.createElement('canvas');
  picture.width = base.width;
  picture.height = base.height;
  const pictureCtx = picture.getContext('2d');
  if (!pictureCtx) throw new Error('Canvas 2D context unavailable.');

  const scene: AnimationScene = {
    width: base.width,
    height: base.height,
    itemCount: entries.length,
    timeline: buildTimeline(inputs, { ...options, width: base.width, height: base.height }),
    setOptions(next) {
      scene.timeline = buildTimeline(inputs, { ...next, width: base.width, height: base.height });
    },
    renderFrame(time, target, outWidth, outHeight) {
      const items = new Map(scene.timeline.items.map((item) => [item.id, item]));
      for (const entry of entries) {
        const item = items.get(entry.object.id);
        applyEntrance(entry, item ? itemProgress(item, time) : 1);
      }
      offLayer.draw();

      pictureCtx.clearRect(0, 0, picture.width, picture.height);
      pictureCtx.drawImage(base, 0, 0);
      pictureCtx.save();
      pictureCtx.beginPath();
      pictureCtx.roundRect(layout.x, layout.y, layout.width, layout.height, layout.radii);
      pictureCtx.clip();
      pictureCtx.drawImage(offLayer.getNativeCanvasElement(), layout.x, layout.y);
      pictureCtx.restore();

      const camera = cameraAt(scene.timeline, time, full);
      // Video has no alpha: transparent frame areas become white, not black.
      target.fillStyle = '#ffffff';
      target.fillRect(0, 0, outWidth, outHeight);
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = 'high';
      target.drawImage(picture, camera.x, camera.y, camera.width, camera.height, 0, 0, outWidth, outHeight);
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
