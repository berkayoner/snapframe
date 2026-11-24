import { useEffect, useRef } from 'react';
import { Group, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { clampRect, useCropStore } from '@/src/editor/tools/crop.tool';

interface CropLayerProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  accentColor: string;
}

const DIM = 'rgba(0, 0, 0, 0.55)';

/**
 * On-canvas crop UI: dims everything outside the pending crop, and makes
 * the crop box itself movable and resizable (ratio-locked when a preset is
 * active). Drawing a fresh box is handled by Canvas's stage gestures.
 * Every node here is named "ui" so it is never baked into an export.
 */
export function CropLayer({ canvasWidth, canvasHeight, zoom, accentColor }: CropLayerProps) {
  const rect = useCropStore((state) => state.rect);
  const ratio = useCropStore((state) => state.ratio);
  const dragging = useCropStore((state) => state.dragStart !== null);
  const setRect = useCropStore((state) => state.setRect);
  const boxRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const transformer = transformerRef.current;
    const box = boxRef.current;
    if (!transformer) return;
    transformer.nodes(box && rect && !dragging ? [box] : []);
    transformer.getLayer()?.batchDraw();
  }, [rect, dragging]);

  if (!rect) return null;

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  function commitFromNode(node: Konva.Rect) {
    const next = clampRect(
      {
        x: node.x(),
        y: node.y(),
        width: Math.max(1, node.width() * node.scaleX()),
        height: Math.max(1, node.height() * node.scaleY()),
      },
      canvasWidth,
      canvasHeight,
    );
    node.scale({ x: 1, y: 1 });
    setRect(next);
  }

  return (
    <Group name="ui">
      <Rect x={0} y={0} width={canvasWidth} height={rect.y} fill={DIM} listening={false} />
      <Rect x={0} y={bottom} width={canvasWidth} height={canvasHeight - bottom} fill={DIM} listening={false} />
      <Rect x={0} y={rect.y} width={rect.x} height={rect.height} fill={DIM} listening={false} />
      <Rect x={right} y={rect.y} width={canvasWidth - right} height={rect.height} fill={DIM} listening={false} />
      {/* Rule-of-thirds guides */}
      {[1, 2].map((i) => (
        <Group key={i} listening={false}>
          <Rect
            x={rect.x + (rect.width * i) / 3}
            y={rect.y}
            width={0}
            height={rect.height}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1 / zoom}
          />
          <Rect
            x={rect.x}
            y={rect.y + (rect.height * i) / 3}
            width={rect.width}
            height={0}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1 / zoom}
          />
        </Group>
      ))}
      <Rect
        ref={boxRef}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke="#ffffff"
        strokeWidth={1.5 / zoom}
        draggable
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onDragMove={(event) => {
          const node = event.target;
          node.x(Math.max(0, Math.min(node.x(), canvasWidth - rect.width)));
          node.y(Math.max(0, Math.min(node.y(), canvasHeight - rect.height)));
        }}
        onDragEnd={(event) => commitFromNode(event.target as Konva.Rect)}
        onTransformEnd={(event) => commitFromNode(event.target as Konva.Rect)}
        onMouseEnter={(event) => {
          const container = event.target.getStage()?.container();
          if (container) container.style.cursor = 'move';
        }}
        onMouseLeave={(event) => {
          const container = event.target.getStage()?.container();
          if (container) container.style.cursor = '';
        }}
      />
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        keepRatio={ratio !== null}
        enabledAnchors={
          ratio !== null
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            : [
                'top-left',
                'top-center',
                'top-right',
                'middle-right',
                'bottom-right',
                'bottom-center',
                'bottom-left',
                'middle-left',
              ]
        }
        anchorSize={10}
        anchorCornerRadius={2}
        anchorStroke={accentColor}
        borderEnabled={false}
        ignoreStroke
        flipEnabled={false}
        boundBoxFunc={(oldBox, newBox) => {
          // Boxes here are in absolute (screen) px: the canvas spans 0..size*zoom.
          const maxRight = canvasWidth * zoom + 0.5;
          const maxBottom = canvasHeight * zoom + 0.5;
          if (
            newBox.width < 8 ||
            newBox.height < 8 ||
            newBox.x < -0.5 ||
            newBox.y < -0.5 ||
            newBox.x + newBox.width > maxRight ||
            newBox.y + newBox.height > maxBottom
          ) {
            return oldBox;
          }
          return newBox;
        }}
      />
    </Group>
  );
}
