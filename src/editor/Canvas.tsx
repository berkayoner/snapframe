import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Stage, Layer, Line, Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import { isLockedObject, useEditorStore } from '@/src/editor/store/editorStore';
import {
  DRAWABLE_TOOLS,
  FRAMING_TOOLS,
  frameTargetAt,
  useShapeDrawingTool,
  type DrawableTool,
} from '@/src/annotations/shapes/shape.tool';
import { placeText } from '@/src/annotations/text/text.tool';
import { placeStep } from '@/src/annotations/step/step.tool';
import { readTextData } from '@/src/annotations/text/textStyle';
import { objectBounds, rectsIntersect } from '@/src/annotations/styleOps';
import { renderOrder } from '@/src/annotations/order';
import { readMagnifyStyle } from '@/src/annotations/magnify/magnifyStyle';
import { clampRect, isUsableCrop, useCropStore } from '@/src/editor/tools/crop.tool';
import { canvasBoxes, canvasSensitive, snapThreshold } from '@/src/editor/smart/canvasBoxes';
import { snapRect, type Rect as SmartRect, type SnapGuide } from '@/src/editor/smart/snap';
import { prefersReducedMotion, useSmartUi } from '@/src/editor/smart/smartUi';
import { CropLayer } from '@/src/editor/tools/CropLayer';
import { ArrowHandles } from '@/src/editor/shapes/ArrowHandles';
import { CanvasObject, type CanvasObjectHandlers } from '@/src/editor/shapes/CanvasObject';
import { TextEditorOverlay } from '@/src/editor/text/TextEditorOverlay';
import { safeStagePixelRatio } from '@/src/editor/zoom';
import type { Point } from '@/src/editor/tools/pointer';
import type { EditorObject } from '@/src/shared/types';
import './Canvas.css';

interface CanvasProps {
  image: HTMLImageElement;
  stageRef: RefObject<Konva.Stage | null>;
}

/** Konva draws on <canvas>, which can't read CSS variables - keep in sync with --sf-accent. */
export const CANVAS_ACCENT = '#7a5bff';

const MIN_TRANSFORM_SIZE = 6;
const ALL_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'middle-left',
];
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

type Gesture = { kind: 'draw' } | { kind: 'crop' } | { kind: 'marquee'; start: Point; additive: boolean };

/** Entrance animations still playing, each with a function that jumps it to its end state. */
const runningEntrances = new Map<Konva.Node, () => void>();

/**
 * Jumps every running entrance animation to its end. Exports and the
 * animated export call this first, so an object placed a moment ago is
 * never captured half-faded.
 */
export function finishEntranceAnimations(): void {
  for (const finish of Array.from(runningEntrances.values())) finish();
}

export function hasRunningEntrances(): boolean {
  return runningEntrances.size > 0;
}

/**
 * Entrance animation for objects added by a click or a batch (steps, labels,
 * lenses, one-click redactions, pastes): fade in and grow from 85% around
 * their center (arrows grow from their tail). Drawn shapes don't animate -
 * their draft was already on screen.
 */
function animateEntrance(node: Konva.Node, object: EditorObject, delayMs: number) {
  const isArrow = object.type === 'arrow';
  const pop = object.type === 'step' || object.type === 'text';
  const from = pop ? 0.55 : 0.85;
  const x0 = node.x();
  const y0 = node.y();
  const width = Math.abs(object.width);
  const height = Math.abs(object.height);
  const end = { opacity: object.opacity ?? 1, scaleX: 1, scaleY: 1, x: x0, y: y0 };
  node.setAttrs({
    opacity: 0,
    scaleX: from,
    scaleY: from,
    x: isArrow ? x0 : x0 + (width * (1 - from)) / 2,
    y: isArrow ? y0 : y0 + (height * (1 - from)) / 2,
  });
  let tween: Konva.Tween | null = null;
  const timer = window.setTimeout(() => {
    tween = new Konva.Tween({
      node,
      ...end,
      duration: pop ? 0.34 : 0.26,
      easing: pop ? Konva.Easings.BackEaseOut : Konva.Easings.EaseOut,
      onFinish: () => runningEntrances.delete(node),
    });
    tween.play();
  }, delayMs);
  runningEntrances.set(node, () => {
    window.clearTimeout(timer);
    tween?.destroy();
    node.setAttrs(end);
    node.getLayer()?.batchDraw();
    runningEntrances.delete(node);
  });
}

function normalizeRect(a: Point, b: Point) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function Canvas({ image, stageRef }: CanvasProps) {
  const objects = useEditorStore((state) => state.objects);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const zoom = useEditorStore((state) => state.zoom);
  const activeTool = useEditorStore((state) => state.activeTool);
  const editingTextId = useEditorStore((state) => state.editingTextId);
  const select = useEditorStore((state) => state.select);
  const selectMany = useEditorStore((state) => state.selectMany);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const updateObjects = useEditorStore((state) => state.updateObjects);
  const setEditingTextId = useEditorStore((state) => state.setEditingTextId);
  const entering = useEditorStore((state) => state.entering);
  const pageData = useEditorStore((state) => state.pageData);
  const revealSensitive = useSmartUi((state) => state.revealSensitive);

  const isSelectMode = activeTool === 'select';
  const isCropMode = activeTool === 'crop';
  const drawableTool = DRAWABLE_TOOLS.has(activeTool) ? (activeTool as DrawableTool) : null;
  const drawing = useShapeDrawingTool(drawableTool);
  const cropActions = useCropStore.getState();

  const layerRef = useRef<Konva.Layer>(null);
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const transformerRef = useRef<Konva.Transformer>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const dragRef = useRef<{ id: string; last: Point } | null>(null);
  const pendingCommitRef = useRef(new Map<string, Partial<EditorObject>>());
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  /** The page element a click would frame (shown while a framing tool hovers). */
  const [hoverBox, setHoverBox] = useState<SmartRect | null>(null);
  const [cropGuides, setCropGuides] = useState<SnapGuide[]>([]);

  const stageWidth = canvasWidth * zoom;
  const stageHeight = canvasHeight * zoom;
  const imageObject = objects.find(isLockedObject);
  const imageOffset = { x: imageObject?.x ?? 0, y: imageObject?.y ?? 0 };

  const selectedObjects = objects.filter((object) => selectedIds.includes(object.id));
  const transformable = selectedObjects.filter((object) => object.type !== 'arrow');
  const keepRatio = transformable.some(
    (object) =>
      object.type === 'step' ||
      object.type === 'text' ||
      (object.type === 'magnify' && readMagnifyStyle(object.style).shape === 'circle'),
  );
  const redactions = objects.filter((object) => object.type === 'blur');

  // After any size or zoom change, redraw synchronously before the browser paints.
  // react-konva applies width, height and scale one at a time, and Konva redraws
  // on the width change while the old scale is still set - left alone, that
  // wrong frame flashes on screen for one frame (the "jitter" when zooming or
  // changing the frame padding). Also keeps the backing store under browser
  // canvas limits, since a huge stage at full DPR would silently render blank.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const ratio = safeStagePixelRatio(stageWidth, stageHeight, window.devicePixelRatio || 1);
    const canvas = layer.getCanvas();
    if (Math.abs(canvas.pixelRatio - ratio) > 0.001) canvas.setPixelRatio(ratio);
    layer.draw();
  }, [stageWidth, stageHeight, zoom]);

  // Bind the Transformer's handles to whatever is selected (arrows use endpoint handles instead).
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = isSelectMode
      ? transformable
          .filter((object) => object.id !== editingTextId)
          .map((object) => shapeRefs.current.get(object.id))
          .filter((node): node is Konva.Node => node != null)
      : [];
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  });

  // Play entrance animations for objects added by a click or as a batch.
  useEffect(() => {
    if (entering.ids.length === 0 || prefersReducedMotion()) return;
    const current = useEditorStore.getState().objects;
    entering.ids.forEach((id, index) => {
      const node = shapeRefs.current.get(id);
      const object = current.find((candidate) => candidate.id === id);
      if (node && object) animateEntrance(node, object, Math.min(index, 12) * 55);
    });
  }, [entering]);

  // Entering or leaving the crop tool always starts from a clean pending crop.
  useEffect(() => {
    if (isCropMode) useCropStore.getState().open();
    else useCropStore.getState().close();
  }, [isCropMode]);

  /** Batches commits from one gesture (several nodes fire dragend/transformend) into a single undo step. */
  function queueCommit(id: string, patch: Partial<EditorObject>) {
    const pending = pendingCommitRef.current;
    const wasEmpty = pending.size === 0;
    pending.set(id, { ...pending.get(id), ...patch });
    if (!wasEmpty) return;
    queueMicrotask(() => {
      const updates = Array.from(pending, ([pendingId, pendingPatch]) => ({ id: pendingId, patch: pendingPatch }));
      pending.clear();
      updateObjects(updates);
    });
  }

  function handleStageMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (event.evt.button !== 0) return;
    const stage = event.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    if (!stage || !pos || editingTextId) return;
    const onEmpty = event.target === stage;

    setHoverBox(null);
    if (isCropMode) {
      if (!onEmpty) return;
      cropActions.beginDrag(pos);
      gestureRef.current = { kind: 'crop' };
      return;
    }
    if (activeTool === 'text') {
      // Keep the browser's mousedown focus handling from immediately blurring the new label's textarea.
      event.evt.preventDefault();
      placeText(pos);
      return;
    }
    if (activeTool === 'step') {
      placeStep(pos);
      return;
    }
    if (drawableTool) {
      drawing.begin(pos, event.evt.altKey);
      gestureRef.current = { kind: 'draw' };
      return;
    }
    if (onEmpty) {
      const additive = event.evt.shiftKey;
      if (!additive) clearSelection();
      gestureRef.current = { kind: 'marquee', start: pos, additive };
      setMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  }

  // Gestures continue outside the stage: track the pointer on the window and
  // feed it back through Konva so coordinates stay in scene space.
  const onWindowMouseMove = useEffectEvent((event: MouseEvent) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || !stage) return;
    stage.setPointersPositions(event);
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    if (gesture.kind === 'draw') {
      drawing.move(pos, event.shiftKey, event.altKey);
    } else if (gesture.kind === 'crop') {
      cropActions.drag(pos, canvasWidth, canvasHeight);
      // Free-ratio crops snap to page elements too.
      const { snapEnabled, objects: current } = useEditorStore.getState();
      const { rect, ratio } = useCropStore.getState();
      if (rect && ratio === null && snapEnabled && pageData && !event.altKey) {
        const snapped = snapRect(rect, canvasBoxes(pageData, current), snapThreshold(zoom));
        cropActions.setRect(clampRect(snapped.rect, canvasWidth, canvasHeight));
        setCropGuides(snapped.guides);
      } else {
        setCropGuides([]);
      }
    } else {
      setMarquee(normalizeRect(gesture.start, pos));
    }
  });

  const onWindowMouseUp = useEffectEvent((event: MouseEvent) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (gesture.kind === 'draw') {
      drawing.end();
    } else if (gesture.kind === 'crop') {
      const start = useCropStore.getState().dragStart;
      cropActions.endDrag();
      setCropGuides([]);
      if (!isUsableCrop(useCropStore.getState().rect)) {
        // A click crops to the element under the pointer; otherwise no pending crop.
        const target = start ? frameTargetAt(start, event.altKey) : null;
        cropActions.setRect(target ? clampRect(target, canvasWidth, canvasHeight) : null);
      }
    } else {
      const area = marquee;
      setMarquee(null);
      if (!area || (area.width * zoom < 3 && area.height * zoom < 3)) return;
      const hits = objects
        .filter((object) => !isLockedObject(object) && rectsIntersect(area, objectBounds(object)))
        .map((object) => object.id);
      selectMany(gesture.additive ? [...selectedIds, ...hits] : hits);
    }
  });

  useEffect(() => {
    const move = (event: MouseEvent) => onWindowMouseMove(event);
    const up = (event: MouseEvent) => onWindowMouseUp(event);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  function handleSelect(id: string, event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!isSelectMode) return;
    event.cancelBubble = true;
    const additive = 'shiftKey' in event.evt && event.evt.shiftKey;
    // Mousedown on an already-selected object keeps the group so it can be dragged together.
    if (!additive && selectedIds.includes(id)) return;
    select(id, { additive });
  }

  function handleDblClick(id: string, event: Konva.KonvaEventObject<MouseEvent>) {
    const object = objects.find((candidate) => candidate.id === id);
    if (object?.type !== 'text') return;
    event.cancelBubble = true;
    select(id);
    setEditingTextId(id);
  }

  function handleDragStart(id: string, event: Konva.KonvaEventObject<DragEvent>) {
    if (dragRef.current) return;
    dragRef.current = { id, last: { x: event.target.x(), y: event.target.y() } };
  }

  /** Moves the rest of the selection along with the dragged node (the Transformer only syncs its own nodes). */
  function handleDragMove(id: string, event: Konva.KonvaEventObject<DragEvent>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    const node = event.target;
    const dx = node.x() - drag.last.x;
    const dy = node.y() - drag.last.y;
    drag.last = { x: node.x(), y: node.y() };
    for (const otherId of selectedIds) {
      if (otherId === id) continue;
      const other = shapeRefs.current.get(otherId);
      if (other && !other.isDragging()) other.position({ x: other.x() + dx, y: other.y() + dy });
    }
  }

  function handleDragEnd(id: string) {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    dragRef.current = null;
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    for (const movedId of ids) {
      const node = shapeRefs.current.get(movedId);
      if (node) queueCommit(movedId, { x: node.x(), y: node.y() });
    }
  }

  function handleTransformEnd(object: EditorObject, event: Konva.KonvaEventObject<Event>) {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Bake the transform's scale into real sizes and reset scale to 1, so
    // stored geometry is always plain pixels (needed for accurate export).
    node.scaleX(1);
    node.scaleY(1);

    if (object.type === 'text') {
      const data = readTextData(object.style);
      const factor = (scaleX + scaleY) / 2;
      queueCommit(object.id, {
        x: node.x(),
        y: node.y(),
        style: {
          ...data,
          fontSize: Math.max(6, Math.round(data.fontSize * factor)),
          padding: Math.round(data.padding * factor),
          cornerRadius: Math.round(data.cornerRadius * factor),
        },
      });
      return;
    }

    queueCommit(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(1, node.width() * scaleX),
      height: Math.max(1, node.height() * scaleY),
    });
  }

  const handlers: CanvasObjectHandlers = {
    register: (id, node) => {
      if (node) shapeRefs.current.set(id, node);
      else shapeRefs.current.delete(id);
    },
    onSelect: handleSelect,
    onDblClick: handleDblClick,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
  };

  /** Hover preview of "click to frame this element" for the framing tools and crop. */
  function handleStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    if (gestureRef.current) return;
    const framing = (drawableTool && FRAMING_TOOLS.has(drawableTool)) || (isCropMode && !useCropStore.getState().rect);
    if (!framing) {
      if (hoverBox) setHoverBox(null);
      return;
    }
    const pos = event.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const target = frameTargetAt(pos, event.evt.altKey);
    if (target !== hoverBox) setHoverBox(target);
  }

  const draft = drawing.draft;
  const guides = [...drawing.guides, ...cropGuides];
  const showHover = hoverBox && !draft && ((drawableTool && FRAMING_TOOLS.has(drawableTool)) || isCropMode);
  const sensitiveRegions = revealSensitive ? canvasSensitive(pageData, objects) : [];
  const selectedArrows = isSelectMode ? selectedObjects.filter((object) => object.type === 'arrow') : [];
  const cursor = isSelectMode ? 'default' : activeTool === 'text' ? 'text' : 'crosshair';

  return (
    <div className="canvas-shell" style={{ width: stageWidth, height: stageHeight }}>
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseLeave={() => setHoverBox(null)}
        style={{ cursor }}
      >
        <Layer ref={layerRef}>
          {renderOrder(objects).map((object) => (
            <CanvasObject
              key={object.id}
              object={object}
              image={image}
              imageOffset={imageOffset}
              zoom={zoom}
              interactive={isSelectMode && !isLockedObject(object)}
              hidden={object.id === editingTextId}
              handlers={handlers}
              redactions={redactions}
            />
          ))}
          {draft && (
            <CanvasObject
              draft
              object={draft}
              image={image}
              imageOffset={imageOffset}
              zoom={zoom}
              interactive={false}
              redactions={redactions}
            />
          )}
          {selectedArrows.map((arrow) => (
            <ArrowHandles
              key={arrow.id}
              object={arrow}
              zoom={zoom}
              accentColor={CANVAS_ACCENT}
              getArrowNode={() => shapeRefs.current.get(arrow.id)}
            />
          ))}
          {showHover && hoverBox && (
            <Rect
              name="ui"
              {...hoverBox}
              fill="rgba(122, 91, 255, 0.08)"
              stroke={CANVAS_ACCENT}
              strokeWidth={1.5 / zoom}
              dash={[5 / zoom, 4 / zoom]}
              listening={false}
            />
          )}
          {guides.map((guide, index) => (
            <Line
              key={`${guide.axis}-${guide.value}-${index}`}
              name="ui"
              points={
                guide.axis === 'x'
                  ? [guide.value, guide.from, guide.value, guide.to]
                  : [guide.from, guide.value, guide.to, guide.value]
              }
              stroke="#ff3b8a"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 3 / zoom]}
              listening={false}
            />
          ))}
          {sensitiveRegions.map((region, index) => (
            <Rect
              key={`sensitive-${index}`}
              name="ui"
              x={region.x - 2 / zoom}
              y={region.y - 2 / zoom}
              width={region.width + 4 / zoom}
              height={region.height + 4 / zoom}
              fill="rgba(255, 59, 48, 0.14)"
              stroke="#ff3b30"
              strokeWidth={1.5 / zoom}
              dash={[4 / zoom, 3 / zoom]}
              cornerRadius={3 / zoom}
              listening={false}
            />
          ))}
          {marquee && (
            <Rect
              name="ui"
              {...marquee}
              fill="rgba(122, 91, 255, 0.1)"
              stroke={CANVAS_ACCENT}
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
          {isSelectMode && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              keepRatio={keepRatio}
              enabledAnchors={keepRatio ? CORNER_ANCHORS : ALL_ANCHORS}
              ignoreStroke
              anchorSize={9}
              anchorCornerRadius={2}
              anchorStroke={CANVAS_ACCENT}
              anchorFill="#ffffff"
              borderStroke={CANVAS_ACCENT}
              borderStrokeWidth={1.5}
              padding={2}
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < MIN_TRANSFORM_SIZE || Math.abs(newBox.height) < MIN_TRANSFORM_SIZE
                  ? oldBox
                  : newBox
              }
            />
          )}
          {isCropMode && (
            <CropLayer canvasWidth={canvasWidth} canvasHeight={canvasHeight} zoom={zoom} accentColor={CANVAS_ACCENT} />
          )}
        </Layer>
      </Stage>
      <TextEditorOverlay />
    </div>
  );
}
