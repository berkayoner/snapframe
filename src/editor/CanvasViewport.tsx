import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Check, Maximize, Minus, Plus, X } from 'lucide-react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { Canvas } from '@/src/editor/Canvas';
import { FramedCanvas } from '@/src/editor/beautify/FramedCanvas';
import { SmartRedactBar } from '@/src/editor/smart/SmartRedactBar';
import { framedSize } from '@/src/export/layout';
import { getMockupById } from '@/src/mockups/registry';
import { CROP_PRESETS, isUsableCrop, useCropStore } from '@/src/editor/tools/crop.tool';
import { computeFitZoom, maxZoomFor, zoomToPercent } from '@/src/editor/zoom';
import {
  animateZoomTo,
  consumeFitAnimationRequest,
  setZoomPercent,
  stepZoom,
  zoomToFit,
} from '@/src/editor/zoomActions';
import { t } from '@/src/shared/i18n';
import { usePanning } from '@/src/editor/usePanning';

interface CanvasViewportProps {
  image: HTMLImageElement;
  stageRef: RefObject<Konva.Stage | null>;
}

/** Must match .viewport__content's padding in Canvas.css (left + right, top + bottom). */
const CONTENT_PADDING = { x: 64, y: 104 };

interface ZoomAnchor {
  clientX: number;
  clientY: number;
  sceneX: number;
  sceneY: number;
}

function ZoomControls() {
  const zoom = useEditorStore((state) => state.zoom);
  const unit = useEditorStore((state) => state.unit);
  const zoomMode = useEditorStore((state) => state.zoomMode);
  const percent = Math.round(zoomToPercent(zoom, unit));

  return (
    <div className="floating-bar zoom-controls" role="group" aria-label={t('zoom')}>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={t('zoomOut')}
        data-tooltip={t('zoomOut')}
        data-tooltip-side="top"
        onClick={() => stepZoom(-1)}
      >
        <Minus size={15} />
      </button>
      <button
        type="button"
        className="zoom-controls__value"
        aria-label={t('zoomActualSize')}
        data-tooltip={t('zoomActualSize')}
        data-tooltip-side="top"
        onClick={() => setZoomPercent(100)}
      >
        {percent}%
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={t('zoomIn')}
        data-tooltip={t('zoomIn')}
        data-tooltip-side="top"
        onClick={() => stepZoom(1)}
      >
        <Plus size={15} />
      </button>
      <span className="floating-bar__divider" aria-hidden />
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={t('zoomFit')}
        aria-pressed={zoomMode === 'fit'}
        data-tooltip={t('zoomFit')}
        data-tooltip-side="top"
        onClick={zoomToFit}
      >
        <Maximize size={14} />
      </button>
    </div>
  );
}

function CropBar() {
  const rect = useCropStore((state) => state.rect);
  const ratio = useCropStore((state) => state.ratio);
  const setRatio = useCropStore((state) => state.setRatio);
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const applyCrop = useEditorStore((state) => state.applyCrop);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  const usable = isUsableCrop(rect);

  return (
    <div className="floating-bar crop-bar" role="group" aria-label={t('toolCrop')}>
      <div className="segmented crop-bar__ratios">
        {CROP_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="segmented__item"
            aria-pressed={ratio === preset.ratio}
            onClick={() => setRatio(preset.ratio, canvasWidth, canvasHeight)}
          >
            {preset.label ?? t('cropFree')}
          </button>
        ))}
      </div>
      <span className="crop-bar__size">
        {usable ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : t('cropHint')}
      </span>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setActiveTool('select')}>
        <X size={14} />
        {t('cancel')}
      </button>
      <button
        type="button"
        className="btn btn--sm btn--primary"
        disabled={!usable}
        onClick={() => {
          if (rect && usable) applyCrop(rect);
          setActiveTool('select');
        }}
      >
        <Check size={14} />
        {t('cropApply')}
      </button>
    </div>
  );
}

/**
 * The scrollable work area around the canvas: fits the capture to the
 * window (re-fitting on resize while in "fit" mode), supports Ctrl/⌘ +
 * wheel zoom anchored at the cursor, and hosts the floating zoom/crop bars.
 */
export function CanvasViewport({ image, stageRef }: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<ZoomAnchor | null>(null);
  /** Where the middle of the view sits within the scrollable content (0..1), kept up to date on scroll. */
  const centerRef = useRef({ x: 0.5, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const zoom = useEditorStore((state) => state.zoom);
  const zoomMode = useEditorStore((state) => state.zoomMode);
  const unit = useEditorStore((state) => state.unit);
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const beautify = useEditorStore((state) => state.beautify);
  const mockupId = useEditorStore((state) => state.mockupId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const fitLocked = useEditorStore((state) => state.fitLocked);
  const setZoom = useEditorStore((state) => state.setZoom);
  const mockup = getMockupById(mockupId);
  const pan = usePanning(containerRef);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Keep fitting while in fit mode: window resizes, crops, frame and mockup changes. While a
  // frame slider is being dragged the zoom holds still (the frame grows around a steady
  // screenshot) and re-fits once on release.
  const framed = framedSize(canvasWidth, canvasHeight, unit, beautify, mockup);
  const shouldFit = zoomMode === 'fit' && !fitLocked;
  useLayoutEffect(() => {
    if (!shouldFit || viewport.width === 0 || canvasWidth === 0) return;
    const fit = computeFitZoom({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      framedWidth: framed.width,
      framedHeight: framed.height,
      contentWidth: canvasWidth,
      contentHeight: canvasHeight,
      unit,
      marginX: CONTENT_PADDING.x,
      marginY: CONTENT_PADDING.y,
    });
    if (Math.abs(fit - zoom) / zoom <= 1e-4) return;
    // The fit button/shortcut glides; window resizes and frame edits snap.
    if (consumeFitAnimationRequest()) animateZoomTo(fit, 'fit');
    else setZoom(fit, 'fit');
  }, [shouldFit, viewport, canvasWidth, canvasHeight, framed.width, framed.height, unit, zoom, setZoom]);

  // Keep the view steady while zooming: wheel zoom keeps the point under the cursor in place,
  // button/keyboard zoom keeps the middle of the view in place.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = containerRef.current;
    const shell = shellRef.current?.querySelector('.canvas-shell');
    if (!container || !shell) return;
    if (anchor) {
      anchorRef.current = null;
      const rect = shell.getBoundingClientRect();
      container.scrollLeft += rect.left + anchor.sceneX * zoom - anchor.clientX;
      container.scrollTop += rect.top + anchor.sceneY * zoom - anchor.clientY;
    } else if (useEditorStore.getState().zoomMode === 'manual') {
      const center = centerRef.current;
      container.scrollLeft = center.x * container.scrollWidth - container.clientWidth / 2;
      container.scrollTop = center.y * container.scrollHeight - container.clientHeight / 2;
    }
  }, [zoom]);

  function rememberCenter() {
    const container = containerRef.current;
    if (!container || container.scrollWidth === 0) return;
    centerRef.current = {
      x: (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth,
      y: (container.scrollTop + container.clientHeight / 2) / container.scrollHeight,
    };
  }

  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const shell = shellRef.current?.querySelector('.canvas-shell');
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    anchorRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      sceneX: (event.clientX - rect.left) / zoom,
      sceneY: (event.clientY - rect.top) / zoom,
    };
    const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025));
    setZoom(Math.min(zoom * factor, maxZoomFor(canvasWidth, canvasHeight)), 'manual');
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Must be non-passive to stop the browser's own page zoom.
    const handler = (event: WheelEvent) => onWheel(event);
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, []);

  return (
    <div className="viewport">
      <div
        ref={containerRef}
        className={`viewport__scroller${shouldFit ? ' viewport__scroller--fit' : ''}${pan === 'idle' ? '' : ` viewport__scroller--${pan}`}`}
        onScroll={rememberCenter}
      >
        <div ref={shellRef} className="viewport__content">
          <FramedCanvas
            settings={beautify}
            mockup={mockup}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            unit={unit}
            zoom={zoom}
          >
            <Canvas image={image} stageRef={stageRef} />
          </FramedCanvas>
        </div>
      </div>
      <SmartRedactBar />
      {activeTool === 'crop' ? <CropBar /> : <ZoomControls />}
    </div>
  );
}
