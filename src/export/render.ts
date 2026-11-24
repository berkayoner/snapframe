import type Konva from 'konva';
import { composeBeautifiedCanvas, composeFramedObject, flattenOnWhite } from '@/src/editor/beautify/compose';
import { isFrameActive, type BeautifySettings } from '@/src/editor/beautify/presets';
import { drawDevice } from '@/src/mockups/compose';
import { deviceGeometry } from '@/src/mockups/geometry';
import type { MockupConfig } from '@/src/mockups/registry';
import { framedSize } from '@/src/export/layout';

/** Chrome's canvas limits: 32,767px per side and 268M px total. Stay a little under. */
export const MAX_CANVAS_SIDE = 32_000;
export const MAX_CANVAS_AREA = 260_000_000;

export class ExportTooLargeError extends Error {}

export function fitsCanvasLimits(width: number, height: number): boolean {
  return width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_AREA;
}

export interface RenderOptions {
  canvasWidth: number;
  canvasHeight: number;
  /** Current on-screen zoom of the stage (screen px per image px). */
  zoom: number;
  /** Image px per source-page CSS px (the capture's DPR). */
  unit: number;
  exportScale: number;
  beautify: BeautifySettings;
  mockup?: MockupConfig;
  /** Flatten transparency onto white (for JPEG). */
  opaque?: boolean;
  /** Objects left out of this render (the animated export draws them itself, frame by frame). */
  hideObjectIds?: string[];
}

/** Predicts the final pixel size without rendering - used to warn before a too-large export. */
export function predictOutputSize(options: RenderOptions): { width: number; height: number } {
  return framedSize(
    Math.round(options.canvasWidth * options.exportScale),
    Math.round(options.canvasHeight * options.exportScale),
    options.unit * options.exportScale,
    options.beautify,
    options.mockup,
  );
}

/**
 * Renders the final image exactly as exported: the stage content at true
 * pixel size (x export scale) with every editor-only node hidden, then the
 * device frame and/or background around it. Shared by Download, Copy and
 * Preview so all three always produce identical pixels. With no background
 * and no mockup selected, the screenshot is exported untouched.
 */
export async function renderFinalCanvas(stage: Konva.Stage, options: RenderOptions): Promise<HTMLCanvasElement> {
  return renderFinalCanvasNow(stage, options);
}

/** Synchronous form of renderFinalCanvas, for work that must finish in the current task (e.g. while a tab closes). */
export function renderFinalCanvasNow(stage: Konva.Stage, options: RenderOptions): HTMLCanvasElement {
  const predicted = predictOutputSize(options);
  if (!fitsCanvasLimits(predicted.width, predicted.height)) {
    throw new ExportTooLargeError(`${predicted.width}x${predicted.height}`);
  }

  // Selection handles, crop shading, drafts and marquees must never be baked into the pixels.
  const hidden = (options.hideObjectIds ?? [])
    .map((id) => stage.findOne((node: Konva.Node) => node.id() === id))
    .filter((node): node is Konva.Node => !!node);
  const editorOnly = [...stage.find('.ui'), ...stage.find('Transformer'), ...hidden];
  const previousVisibility = editorOnly.map((node) => node.visible());
  editorOnly.forEach((node) => node.visible(false));

  let content: HTMLCanvasElement;
  try {
    content = stage.toCanvas({
      x: 0,
      y: 0,
      width: options.canvasWidth * options.zoom,
      height: options.canvasHeight * options.zoom,
      pixelRatio: options.exportScale / options.zoom,
    });
  } finally {
    editorOnly.forEach((node, index) => node.visible(previousVisibility[index] ?? true));
    stage.batchDraw();
  }

  const result = composeFrame(content, options.beautify, options.mockup, options.unit * options.exportScale);
  return options.opaque ? flattenOnWhite(result) : result;
}

/**
 * Puts finished content into its device frame and/or background. `scale`
 * converts source-page CSS px to the content's pixels. Returns the content
 * itself when neither is selected.
 */
export function composeFrame(
  content: HTMLCanvasElement,
  beautify: BeautifySettings,
  mockup: MockupConfig | undefined,
  scale: number,
): HTMLCanvasElement {
  const frameActive = isFrameActive(beautify);
  if (mockup) {
    const device = drawDevice(content, deviceGeometry(mockup.type, content.width, content.height, scale));
    return frameActive ? composeFramedObject(device, beautify, scale) : device;
  }
  return frameActive ? composeBeautifiedCanvas(content, beautify, scale) : content;
}
