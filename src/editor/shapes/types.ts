import type Konva from 'konva';

type KonvaHandler<E extends Event> = (event: Konva.KonvaEventObject<E>) => void;

/** Props every object renderer gets from Canvas.tsx, regardless of object type. */
export interface CommonShapeProps {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  draggable: boolean;
  listening?: boolean;
  onMouseDown?: KonvaHandler<MouseEvent>;
  onTap?: KonvaHandler<TouchEvent>;
  onDblClick?: KonvaHandler<MouseEvent>;
  onDragStart?: KonvaHandler<DragEvent>;
  onDragMove?: KonvaHandler<DragEvent>;
  onDragEnd?: KonvaHandler<DragEvent>;
  onTransformEnd?: KonvaHandler<Event>;
  onMouseEnter?: KonvaHandler<MouseEvent>;
  onMouseLeave?: KonvaHandler<MouseEvent>;
  ref?: (node: Konva.Node | null) => void;
}
