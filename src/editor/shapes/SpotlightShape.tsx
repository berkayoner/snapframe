import { Shape } from 'react-konva';
import type Konva from 'konva';
import { readSpotlightStyle, type SpotlightShapeKind } from '@/src/annotations/spotlight/spotlightStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface SpotlightShapeProps extends CommonShapeProps {
  object: EditorObject;
  draft?: boolean;
}

/** Konva name shared by every spotlight node (drafts add "ui" so exports skip them). */
export const SPOTLIGHT_NAME = 'spotlight';

/** Adds one spotlight's opening, in layer coordinates (reads the node's live geometry). */
function addOpening(ctx: CanvasRenderingContext2D, node: Konva.Node) {
  const x = node.x();
  const y = node.y();
  const width = node.width() * node.scaleX();
  const height = node.height() * node.scaleY();
  const kind = node.getAttr('spotShape') as SpotlightShapeKind;
  if (kind === 'ellipse') {
    ctx.moveTo(x + width, y + height / 2);
    ctx.ellipse(x + width / 2, y + height / 2, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, Math.PI * 2);
  } else if (kind === 'rounded') {
    const radius = Math.max(0, Math.min(Number(node.getAttr('spotRadius')) || 0, width / 2, height / 2));
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}

/**
 * Every spotlight on the layer shares one dimming pass, drawn by the first
 * (lowest) spotlight: the page darkens everywhere outside the union of all
 * openings. Each opening is subtracted with its own even-odd clip, and clips
 * intersect - so overlapping spotlights merge instead of darkening each
 * other. The others draw nothing; they only provide an opening and a handle.
 */
function drawSpotlights(context: Konva.Context, node: Konva.Shape) {
  const layer = node.getLayer();
  const stage = node.getStage();
  if (!layer || !stage) return;
  const spots = layer.find(`.${SPOTLIGHT_NAME}`).filter((candidate) => candidate.isVisible());
  if (spots[0] !== node) return;

  const ctx = context._context;
  const width = stage.width() / (stage.scaleX() || 1);
  const height = stage.height() / (stage.scaleY() || 1);
  ctx.save();
  // Work in layer coordinates rather than this node's own.
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = node.getTransform().copy().invert().getMatrix();
  ctx.transform(a, b, c, d, e, f);
  for (const spot of spots) {
    ctx.beginPath();
    ctx.rect(-1, -1, width + 2, height + 2);
    addOpening(ctx, spot);
    ctx.clip('evenodd');
  }
  ctx.fillStyle = `rgba(10, 8, 24, ${Number(node.getAttr('spotDim')) || 0.55})`;
  ctx.fillRect(-1, -1, width + 2, height + 2);
  ctx.restore();
}

function hitSpotlight(context: Konva.Context, node: Konva.Shape) {
  context.beginPath();
  context.rect(0, 0, node.width(), node.height());
  context.closePath();
  context.fillStrokeShape(node);
}

/** Dims the page around a rect, an ellipse or a rounded rect (the "look here" effect). */
export function SpotlightShape({ object, draft, ...common }: SpotlightShapeProps) {
  const style = readSpotlightStyle(object.style);
  return (
    <Shape
      {...common}
      name={draft ? `ui ${SPOTLIGHT_NAME}` : SPOTLIGHT_NAME}
      spotShape={style.shape}
      spotRadius={style.radius}
      spotDim={style.dim}
      fill="#000000"
      sceneFunc={drawSpotlights}
      hitFunc={hitSpotlight}
    />
  );
}
