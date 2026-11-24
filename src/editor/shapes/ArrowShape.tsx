import { Arrow } from 'react-konva';
import { arrowPointerSize, readArrowStyle } from '@/src/annotations/shapes/shapeStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface ArrowShapeProps extends CommonShapeProps {
  object: EditorObject;
}

/**
 * An arrow's `x`/`y` is its start point and `width`/`height` is the vector
 * to its end point (may be negative) - so `points` is always derived from
 * them rather than stored separately, keeping the object model uniform
 * with every other shape. Arrows are reshaped with endpoint handles (see
 * ArrowHandles.tsx), never with the box Transformer.
 */
export function ArrowShape({ object, width: _width, height: _height, ...common }: ArrowShapeProps) {
  const style = readArrowStyle(object.style);
  const pointer = arrowPointerSize(style.strokeWidth);
  return (
    <Arrow
      {...common}
      points={[0, 0, object.width, object.height]}
      stroke={style.stroke}
      fill={style.stroke}
      strokeWidth={style.strokeWidth}
      pointerLength={pointer}
      pointerWidth={pointer}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(style.strokeWidth * 2, 16)}
    />
  );
}
