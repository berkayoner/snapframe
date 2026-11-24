import { useRef } from 'react';
import { Circle, Group } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import type { EditorObject } from '@/src/shared/types';

interface ArrowHandlesProps {
  object: EditorObject;
  zoom: number;
  getArrowNode: () => Konva.Node | undefined;
  accentColor: string;
}

const HANDLE_RADIUS = 6;

/**
 * Two draggable endpoint handles for the selected arrow. A box Transformer
 * can't represent an arrow's direction (resizing a left- or up-pointing
 * arrow would flip or collapse it), so each end is moved independently.
 * The arrow is updated imperatively while dragging and committed to the
 * store - one undo step - when the drag ends.
 */
export function ArrowHandles({ object, zoom, getArrowNode, accentColor }: ArrowHandlesProps) {
  const updateObjects = useEditorStore((state) => state.updateObjects);
  const startRef = useRef<Konva.Circle>(null);
  const endRef = useRef<Konva.Circle>(null);

  const start = { x: object.x, y: object.y };
  const end = { x: object.x + object.width, y: object.y + object.height };
  const radius = HANDLE_RADIUS / zoom;

  function currentGeometry() {
    const startNode = startRef.current;
    const endNode = endRef.current;
    if (!startNode || !endNode) return null;
    return {
      x: startNode.x(),
      y: startNode.y(),
      width: endNode.x() - startNode.x(),
      height: endNode.y() - startNode.y(),
    };
  }

  function handleDragMove() {
    const geometry = currentGeometry();
    const arrow = getArrowNode() as Konva.Arrow | undefined;
    if (!geometry || !arrow) return;
    arrow.position({ x: geometry.x, y: geometry.y });
    arrow.points([0, 0, geometry.width, geometry.height]);
    arrow.getLayer()?.batchDraw();
  }

  function handleDragEnd() {
    const geometry = currentGeometry();
    if (!geometry) return;
    updateObjects([{ id: object.id, patch: geometry }]);
  }

  const handleProps = {
    radius,
    fill: '#ffffff',
    stroke: accentColor,
    strokeWidth: 2 / zoom,
    draggable: true,
    name: 'ui',
    hitStrokeWidth: 10 / zoom,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
    },
    onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => {
      const container = event.target.getStage()?.container();
      if (container) container.style.cursor = 'move';
    },
    onMouseLeave: (event: Konva.KonvaEventObject<MouseEvent>) => {
      const container = event.target.getStage()?.container();
      if (container) container.style.cursor = '';
    },
  };

  return (
    <Group name="ui">
      <Circle ref={startRef} key={`start-${start.x}-${start.y}`} x={start.x} y={start.y} {...handleProps} />
      <Circle ref={endRef} key={`end-${end.x}-${end.y}`} x={end.x} y={end.y} {...handleProps} />
    </Group>
  );
}
