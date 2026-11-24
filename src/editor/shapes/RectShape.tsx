import { Rect } from 'react-konva';
import { dashPattern, readShapeStyle, resolveShapeFill } from '@/src/annotations/shapes/shapeStyle';
import { resolveHighlightFill } from '@/src/annotations/highlight/highlightStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface RectShapeProps extends CommonShapeProps {
  object: EditorObject;
}

/** Renders both the Rectangle tool's shapes and the Highlight tool's translucent boxes - same Konva.Rect, different style. */
export function RectShape({ object, ...common }: RectShapeProps) {
  if (object.type === 'highlight') {
    return <Rect {...common} fill={resolveHighlightFill(object.style)} cornerRadius={2} />;
  }

  const style = readShapeStyle(object.style);
  return (
    <Rect
      {...common}
      fill={resolveShapeFill(object.style)}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      cornerRadius={style.cornerRadius}
      dash={dashPattern(style.strokeWidth)}
      dashEnabled={style.dashed}
      lineJoin="round"
      // Thin outlines are hard to grab; widen the invisible hit area instead of the stroke.
      hitStrokeWidth={Math.max(style.strokeWidth, 12)}
    />
  );
}
