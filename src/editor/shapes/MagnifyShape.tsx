import { Shape } from 'react-konva';
import type Konva from 'konva';
import { renderRedactedRegion } from '@/src/annotations/blur/blur';
import { readBlurStyle } from '@/src/annotations/blur/blurStyle';
import { magnifySource, readMagnifyStyle, type MagnifyShapeKind } from '@/src/annotations/magnify/magnifyStyle';
import { rectsIntersect } from '@/src/annotations/styleOps';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface MagnifyShapeProps extends CommonShapeProps {
  object: EditorObject;
  sourceImage: HTMLImageElement;
  /** Where the base screenshot sits on the canvas (it moves after a crop). */
  imageOffset: { x: number; y: number };
  /** The canvas's redactions: drawn over the enlarged pixels, so a lens can never reveal hidden content. */
  redactions: EditorObject[];
}

interface Redaction {
  rect: { x: number; y: number; width: number; height: number };
  canvas: HTMLCanvasElement;
}

/** Redacted bitmaps per screenshot, keyed by geometry + style (shared by every lens). */
const redactionCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
const MAX_CACHED_REDACTIONS = 48;

function redactionsFor(image: HTMLImageElement, offset: { x: number; y: number }, blurs: EditorObject[]): Redaction[] {
  let cache = redactionCache.get(image);
  if (!cache) {
    cache = new Map();
    redactionCache.set(image, cache);
  }
  return blurs.map((blur) => {
    const style = readBlurStyle(blur.style);
    const source = { x: blur.x - offset.x, y: blur.y - offset.y, width: blur.width, height: blur.height };
    const key = `${style.mode}:${style.strength}:${source.x}:${source.y}:${source.width}:${source.height}`;
    let canvas = cache.get(key);
    if (!canvas) {
      canvas = renderRedactedRegion(image, source, style.strength, style.mode);
      if (cache.size >= MAX_CACHED_REDACTIONS) cache.delete(cache.keys().next().value as string);
      cache.set(key, canvas);
    }
    return { rect: { x: blur.x, y: blur.y, width: blur.width, height: blur.height }, canvas };
  });
}

function lensPath(ctx: CanvasRenderingContext2D, width: number, height: number, kind: MagnifyShapeKind, inset = 0) {
  ctx.beginPath();
  const w = Math.max(0, width - inset * 2);
  const h = Math.max(0, height - inset * 2);
  if (kind === 'circle') {
    ctx.ellipse(width / 2, height / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(inset, inset, w, h, Math.max(0, Math.min(width, height) * 0.14 - inset));
  }
}

/**
 * A loupe: enlarges the screenshot under its own center. It reads the node's
 * live position and scale, so it updates while being dragged or resized, and
 * draws straight from the original screenshot at whatever resolution the
 * canvas is rendered (crisp in 2x exports).
 */
export function MagnifyShape({ object, sourceImage, imageOffset, redactions, ...common }: MagnifyShapeProps) {
  const style = readMagnifyStyle(object.style);
  const covers = redactionsFor(sourceImage, imageOffset, redactions);

  const sceneFunc = (context: Konva.Context, node: Konva.Shape) => {
    const ctx = context._context;
    const width = node.width();
    const height = node.height();
    if (width <= 0 || height <= 0) return;
    const lens = { x: node.x(), y: node.y(), width: width * node.scaleX(), height: height * node.scaleY() };
    const source = magnifySource(lens, style.zoom);
    const kx = width / source.width;
    const ky = height / source.height;
    const matrix = ctx.getTransform();
    const pixelScale = Math.hypot(matrix.a, matrix.b);

    // Soft drop shadow so the lens reads as floating above the page.
    ctx.save();
    lensPath(ctx, width, height, style.shape);
    ctx.shadowColor = 'rgba(16, 12, 40, 0.38)';
    ctx.shadowBlur = Math.max(4, style.ringWidth * 5) * pixelScale;
    ctx.shadowOffsetY = Math.max(1, style.ringWidth * 1.6) * pixelScale;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // The enlarged pixels, with redactions re-applied on top.
    ctx.save();
    lensPath(ctx, width, height, style.shape);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      sourceImage,
      source.x - imageOffset.x,
      source.y - imageOffset.y,
      source.width,
      source.height,
      0,
      0,
      width,
      height,
    );
    for (const cover of covers) {
      if (!rectsIntersect(cover.rect, source)) continue;
      ctx.drawImage(
        cover.canvas,
        (cover.rect.x - source.x) * kx,
        (cover.rect.y - source.y) * ky,
        cover.rect.width * kx,
        cover.rect.height * ky,
      );
    }
    ctx.restore();

    if (style.ringWidth > 0) {
      ctx.save();
      // A faint outer hairline keeps light rings visible on light pages.
      const hairline = Math.max(0.5, style.ringWidth / 3);
      lensPath(ctx, width, height, style.shape, hairline / 2);
      ctx.lineWidth = hairline;
      ctx.strokeStyle = 'rgba(16, 12, 40, 0.22)';
      ctx.stroke();
      lensPath(ctx, width, height, style.shape, hairline + style.ringWidth / 2);
      ctx.lineWidth = style.ringWidth;
      ctx.strokeStyle = style.color;
      ctx.stroke();
      ctx.restore();
    }
  };

  const hitFunc = (context: Konva.Context, node: Konva.Shape) => {
    context.beginPath();
    if (style.shape === 'circle') {
      context.arc(
        node.width() / 2,
        node.height() / 2,
        Math.min(node.width(), node.height()) / 2,
        0,
        Math.PI * 2,
        false,
      );
    } else {
      context.rect(0, 0, node.width(), node.height());
    }
    context.closePath();
    context.fillStrokeShape(node);
  };

  return <Shape {...common} fill="#000000" sceneFunc={sceneFunc} hitFunc={hitFunc} />;
}
