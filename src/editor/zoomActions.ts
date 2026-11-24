import { useEditorStore, type ZoomMode } from '@/src/editor/store/editorStore';
import { maxZoomFor, nextZoomStep, percentToZoom, zoomToPercent } from '@/src/editor/zoom';
import { prefersReducedMotion } from '@/src/editor/smart/smartUi';

const ZOOM_ANIMATION_MS = 200;
let animationFrame = 0;

/** Set by zoomToFit(): the viewport animates its next fit instead of jumping. */
let fitAnimationRequested = false;

export function consumeFitAnimationRequest(): boolean {
  const requested = fitAnimationRequested;
  fitAnimationRequested = false;
  return requested;
}

/**
 * Eases the zoom to `target`. Intermediate frames are "manual" so the
 * fit-to-screen logic doesn't fight the animation; the last frame applies
 * the requested mode. Interpolates in log space so zooming in and out feel
 * equally smooth.
 */
export function animateZoomTo(target: number, mode: ZoomMode = 'manual'): void {
  cancelAnimationFrame(animationFrame);
  const { zoom: from, setZoom } = useEditorStore.getState();
  if (prefersReducedMotion() || Math.abs(Math.log(target / from)) < 0.01) {
    setZoom(target, mode);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / ZOOM_ANIMATION_MS);
    const eased = 1 - (1 - progress) ** 3;
    const value = Math.exp(Math.log(from) + (Math.log(target) - Math.log(from)) * eased);
    if (progress < 1) {
      setZoom(value, 'manual');
      animationFrame = requestAnimationFrame(step);
    } else {
      setZoom(target, mode);
    }
  };
  animationFrame = requestAnimationFrame(step);
}

/** Applies a zoom percentage (relative to the source page) - shared by the zoom bar and keyboard shortcuts. */
export function setZoomPercent(percent: number): void {
  const { unit, canvasWidth, canvasHeight } = useEditorStore.getState();
  animateZoomTo(Math.min(percentToZoom(percent, unit), maxZoomFor(canvasWidth, canvasHeight)));
}

export function stepZoom(direction: 1 | -1): void {
  const { zoom, unit } = useEditorStore.getState();
  setZoomPercent(nextZoomStep(zoomToPercent(zoom, unit), direction));
}

export function zoomToFit(): void {
  cancelAnimationFrame(animationFrame);
  fitAnimationRequested = true;
  const { zoom, setZoom } = useEditorStore.getState();
  setZoom(zoom, 'fit');
}
