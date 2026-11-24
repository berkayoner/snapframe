import type Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { hasRunningEntrances } from '@/src/editor/Canvas';
import { predictOutputSize, renderFinalCanvasNow, type RenderOptions } from '@/src/export/render';
import { getMockupById } from '@/src/mockups/registry';
import { THUMBNAIL_WIDTH, thumbnailFromCanvas } from '@/src/storage/thumbnails';

/**
 * A small preview of the finished picture (annotations, frame and mockup
 * included), for the library and popup cards. Rendered with the export
 * pipeline at a reduced scale, synchronously. Returns 'busy' while
 * something is mid-way (a label being typed, an entrance animation
 * playing) - try again shortly.
 */
export function renderProjectThumbnail(stage: Konva.Stage): Blob | 'busy' | undefined {
  const editor = useEditorStore.getState();
  if (editor.editingTextId || hasRunningEntrances()) return 'busy';
  const options: RenderOptions = {
    canvasWidth: editor.canvasWidth,
    canvasHeight: editor.canvasHeight,
    zoom: editor.zoom,
    unit: editor.unit,
    exportScale: 1,
    beautify: editor.beautify,
    mockup: getMockupById(editor.mockupId),
  };
  const full = predictOutputSize(options);
  const exportScale = Math.min(1, THUMBNAIL_WIDTH / Math.max(1, full.width));
  try {
    return thumbnailFromCanvas(renderFinalCanvasNow(stage, { ...options, exportScale }));
  } catch {
    return undefined;
  }
}
