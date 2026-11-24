import { Ellipse } from 'react-konva';
import { dashPattern, readShapeStyle, resolveShapeFill } from '@/src/annotations/shapes/shapeStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface EllipseShapeProps extends CommonShapeProps {
  object: EditorObject;
}

/**
 * Konva ellipses are positioned by their center; the object model stores a
 * top-left bounding box like every other shape. A negative offset bridges
 * the two, so x/y stay the top-left corner through drags and transforms.
 * (Konva.Ellipse maps width/height onto radiusX/radiusY itself.)
 */
export function EllipseShape({ object, ...common }: EllipseShapeProps) {
  const style = readShapeStyle(object.style);
  const width = Math.abs(object.width);
  const height = Math.abs(object.height);
  return (
    <Ellipse
      {...common}
      width={width}
      height={height}
      radiusX={width / 2}
      radiusY={height / 2}
      offsetX={-width / 2}
      offsetY={-height / 2}
      fill={resolveShapeFill(object.style)}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      dash={dashPattern(style.strokeWidth)}
      dashEnabled={style.dashed}
      hitStrokeWidth={Math.max(style.strokeWidth, 12)}
    />
  );
}
