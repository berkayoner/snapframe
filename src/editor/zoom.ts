/**
 * Zoom math for the editor viewport. `zoom` is screen CSS pixels per image
 * pixel; the percentage shown to the user is relative to the *source page*
 * (100% = the page at its original on-screen size), i.e. `zoom * unit`.
 */

/** Largest on-screen stage side we allow; keeps Konva's backing canvases under browser limits. */
export const MAX_STAGE_SIDE = 30_000;

/** Zoom presets, as percentages of the source page's size. */
export const ZOOM_STEPS = [10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400];

export interface FitInput {
  /** Space available for the picture, in screen px (already excluding scrollbars). */
  viewportWidth: number;
  viewportHeight: number;
  /** Finished picture size (content + device frame + background padding), in image px - see framedSize(). */
  framedWidth: number;
  framedHeight: number;
  /** The screenshot itself, in image px (bounds the stage size). */
  contentWidth: number;
  contentHeight: number;
  unit: number;
  /** Space the layout keeps around the picture, in screen px. */
  marginX?: number;
  marginY?: number;
}

export function maxZoomFor(contentWidth: number, contentHeight: number): number {
  return MAX_STAGE_SIDE / Math.max(1, contentWidth, contentHeight);
}

/**
 * Fits the finished picture into the viewport. Very tall content
 * (full-page captures) fits to width instead - fitting its height would
 * shrink it to an unreadable sliver. Never upscales past 100%. A couple of
 * pixels of slack keep sub-pixel rounding from ever adding a scrollbar
 * (which would change the viewport and re-trigger the fit).
 */
export function computeFitZoom(input: FitInput): number {
  const slack = 2;
  const availableWidth = Math.max(40, input.viewportWidth - (input.marginX ?? 64) - slack);
  const availableHeight = Math.max(40, input.viewportHeight - (input.marginY ?? 64) - slack);
  const framedWidth = Math.max(1, input.framedWidth);
  const framedHeight = Math.max(1, input.framedHeight);

  const fitWidth = availableWidth / framedWidth;
  const fitHeight = availableHeight / framedHeight;
  const isTall = framedHeight / framedWidth > (availableHeight / availableWidth) * 2.5;

  const fit = isTall ? fitWidth : Math.min(fitWidth, fitHeight);
  const actualSize = 1 / Math.max(0.1, input.unit);
  return Math.min(fit, actualSize, maxZoomFor(input.contentWidth, input.contentHeight));
}

export function zoomToPercent(zoom: number, unit: number): number {
  return zoom * unit * 100;
}

export function percentToZoom(percent: number, unit: number): number {
  return percent / 100 / Math.max(0.1, unit);
}

export function nextZoomStep(currentPercent: number, direction: 1 | -1): number {
  const epsilon = 0.5;
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > currentPercent + epsilon) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 400;
  }
  const smaller = ZOOM_STEPS.filter((step) => step < currentPercent - epsilon);
  return smaller[smaller.length - 1] ?? ZOOM_STEPS[0] ?? 10;
}

/**
 * Backing-store pixel ratio for a stage of the given CSS size: the screen's
 * DPR when it fits, scaled down when a huge stage would exceed the browser's
 * canvas limits (which would otherwise render a blank canvas).
 */
export function safeStagePixelRatio(stageWidth: number, stageHeight: number, devicePixelRatio: number): number {
  const maxSide = 16_384;
  const maxArea = 64_000_000;
  const width = Math.max(1, stageWidth);
  const height = Math.max(1, stageHeight);
  return Math.max(
    0.1,
    Math.min(devicePixelRatio, maxSide / width, maxSide / height, Math.sqrt(maxArea / (width * height))),
  );
}
