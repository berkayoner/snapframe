import { Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import { RectShape } from '@/src/editor/shapes/RectShape';
import { EllipseShape } from '@/src/editor/shapes/EllipseShape';
import { ArrowShape } from '@/src/editor/shapes/ArrowShape';
import { TextShape } from '@/src/editor/shapes/TextShape';
import { StepShape } from '@/src/editor/shapes/StepShape';
import { BlurShape } from '@/src/editor/shapes/BlurShape';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

type KonvaHandler<E extends Event> = (id: string, event: Konva.KonvaEventObject<E>) => void;

export interface CanvasObjectHandlers {
  register: (id: string, node: Konva.Node | null) => void;
  onSelect: KonvaHandler<MouseEvent | TouchEvent>;
  onDblClick: KonvaHandler<MouseEvent>;
  onDragStart: KonvaHandler<DragEvent>;
  onDragMove: KonvaHandler<DragEvent>;
  onDragEnd: (id: string) => void;
  onTransformEnd: (object: EditorObject, event: Konva.KonvaEventObject<Event>) => void;
}

interface CanvasObjectProps {
  object: EditorObject;
  image: HTMLImageElement;
  imageOffset: { x: number; y: number };
  zoom: number;
  /** Selectable, draggable and transformable (select tool, not the locked screenshot). */
  interactive: boolean;
  /** Hidden while its text is being edited in the overlay. */
  hidden?: boolean;
  /** An in-progress drawing: rendered as a non-interactive preview, never exported. */
  draft?: boolean;
  handlers?: CanvasObjectHandlers;
}

const ACCENT = '#7a5bff';

function setCursor(event: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const container = event.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

/** Renders one editor object with the props every shape shares (geometry, selection, drag, transform). */
export function CanvasObject({
  object,
  image,
  imageOffset,
  zoom,
  interactive,
  hidden,
  draft,
  handlers,
}: CanvasObjectProps) {
  const id = object.id;
  const common: CommonShapeProps = {
    id,
    name: draft ? 'ui' : undefined,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation ?? 0,
    opacity: draft && object.type !== 'blur' ? 0.9 : (object.opacity ?? 1),
    draggable: interactive,
    listening: interactive,
    ...(handlers && !draft
      ? {
          ref: (node: Konva.Node | null) => handlers.register(id, node),
          onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => handlers.onSelect(id, event),
          onTap: (event: Konva.KonvaEventObject<TouchEvent>) => handlers.onSelect(id, event),
          onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => handlers.onDblClick(id, event),
          onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => handlers.onDragStart(id, event),
          onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => handlers.onDragMove(id, event),
          onDragEnd: () => handlers.onDragEnd(id),
          onTransformEnd: (event: Konva.KonvaEventObject<Event>) => handlers.onTransformEnd(object, event),
        }
      : {}),
    ...(interactive
      ? {
          onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, 'move'),
          onMouseLeave: (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, ''),
        }
      : {}),
  };

  switch (object.type) {
    case 'image':
      return <KonvaImage {...common} image={image} />;
    case 'shape':
    case 'highlight':
      return <RectShape object={object} {...common} />;
    case 'ellipse':
      return <EllipseShape object={object} {...common} />;
    case 'arrow':
      return <ArrowShape object={object} {...common} />;
    case 'text':
      return <TextShape object={object} hidden={hidden} {...common} />;
    case 'step':
      return <StepShape object={object} {...common} />;
    case 'blur':
      // While drawing, show a light outline instead of re-redacting on every mouse move.
      return draft ? (
        <Rect
          {...common}
          stroke={ACCENT}
          strokeWidth={1.5 / zoom}
          dash={[6 / zoom, 4 / zoom]}
          fill="rgba(122, 91, 255, 0.12)"
        />
      ) : (
        <BlurShape object={object} sourceImage={image} imageOffset={imageOffset} {...common} />
      );
    default:
      return null;
  }
}
