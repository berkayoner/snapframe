import { useMemo } from 'react';
import { Image as KonvaImage } from 'react-konva';
import { renderRedactedRegion } from '@/src/annotations/blur/blur';
import { readBlurStyle } from '@/src/annotations/blur/blurStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface BlurShapeProps extends CommonShapeProps {
  object: EditorObject;
  sourceImage: HTMLImageElement;
  /**
   * Where the base screenshot currently sits on the canvas. It moves after a
   * crop (objects are re-based, not re-rasterized), so the region to sample
   * is the object's position *relative to the screenshot*, not the canvas.
   */
  imageOffset: { x: number; y: number };
}

/** Re-samples and re-redacts straight from the original screenshot on every geometry change, never from a previous result. */
export function BlurShape({ object, sourceImage, imageOffset, ...common }: BlurShapeProps) {
  const style = readBlurStyle(object.style);
  const sourceX = object.x - imageOffset.x;
  const sourceY = object.y - imageOffset.y;

  const canvas = useMemo(
    () =>
      renderRedactedRegion(
        sourceImage,
        { x: sourceX, y: sourceY, width: object.width, height: object.height },
        style.strength,
        style.mode,
      ),
    [sourceImage, sourceX, sourceY, object.width, object.height, style.strength, style.mode],
  );

  return <KonvaImage {...common} image={canvas} />;
}
