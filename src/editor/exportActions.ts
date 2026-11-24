import { create } from 'zustand';
import type Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { finishEntranceAnimations } from '@/src/editor/Canvas';
import { getMockupById } from '@/src/mockups/registry';
import { ExportTooLargeError, predictOutputSize, renderFinalCanvas, type RenderOptions } from '@/src/export/render';
import { canvasToBlob, downloadBlob, exportFileNameFor } from '@/src/export/png';
import { copyBlobToClipboard } from '@/src/export/clipboard';
import { loadPrefs, savePrefs, type ExportFormat, type ExportScale } from '@/src/shared/prefs';
import { t } from '@/src/shared/i18n';
import { toast } from '@/src/shared/toast';
import type { CaptureRecord } from '@/src/storage/db';

type BusyAction = 'download' | 'copy' | 'preview' | null;

interface ExportSettingsStore {
  format: ExportFormat;
  scale: ExportScale;
  quality: number;
  busy: BusyAction;
  setFormat: (format: ExportFormat) => void;
  setScale: (scale: ExportScale) => void;
  setQuality: (quality: number) => void;
  setBusy: (busy: BusyAction) => void;
}

const prefs = loadPrefs();

/** Export settings (remembered between sessions) and the in-flight export, shared by header, preview and shortcuts. */
export const useExportStore = create<ExportSettingsStore>((set) => ({
  format: prefs.exportFormat,
  scale: prefs.exportScale,
  quality: prefs.jpgQuality,
  busy: null,
  setFormat: (format) => {
    savePrefs({ exportFormat: format });
    set({ format });
  },
  setScale: (scale) => {
    savePrefs({ exportScale: scale });
    set({ scale });
  },
  setQuality: (quality) => {
    savePrefs({ jpgQuality: quality });
    set({ quality });
  },
  setBusy: (busy) => set({ busy }),
}));

function currentRenderOptions(exportScale: number, opaque: boolean): RenderOptions {
  const editor = useEditorStore.getState();
  return {
    canvasWidth: editor.canvasWidth,
    canvasHeight: editor.canvasHeight,
    zoom: editor.zoom,
    unit: editor.unit,
    exportScale,
    beautify: editor.beautify,
    mockup: getMockupById(editor.mockupId),
    opaque,
  };
}

export function predictCurrentOutputSize(exportScale: number) {
  return predictOutputSize(currentRenderOptions(exportScale, false));
}

async function prepareStage(stage: Konva.Stage) {
  finishEntranceAnimations();
  // Commit an in-progress text edit first so the label is visible (and included) when we render.
  if (useEditorStore.getState().editingTextId) {
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((resolve) => setTimeout(resolve, 32));
  }
  stage.batchDraw();
}

function reportError(error: unknown, fallbackKey: 'exportFailed' | 'copyFailed') {
  if (error instanceof ExportTooLargeError) {
    toast.error(t('exportTooLarge', error.message));
    return;
  }
  console.error('[SnapFrame] export failed', error);
  toast.error(t(fallbackKey));
}

async function withBusy<T>(action: Exclude<BusyAction, null>, task: () => Promise<T>): Promise<T | undefined> {
  const store = useExportStore.getState();
  if (store.busy) return undefined;
  store.setBusy(action);
  try {
    return await task();
  } finally {
    useExportStore.getState().setBusy(null);
  }
}

/** Resolves true when the image was downloaded (the header shows a brief confirmation). */
export function downloadImage(stage: Konva.Stage | null, record: CaptureRecord): Promise<boolean | undefined> {
  return withBusy('download', async () => {
    if (!stage) return false;
    const { format, scale, quality } = useExportStore.getState();
    try {
      await prepareStage(stage);
      const canvas = await renderFinalCanvas(stage, currentRenderOptions(scale, format === 'jpg'));
      const blob = await canvasToBlob(
        canvas,
        format === 'jpg' ? 'image/jpeg' : 'image/png',
        format === 'jpg' ? quality / 100 : undefined,
      );
      downloadBlob(blob, exportFileNameFor(record, format));
      toast.success(t('toastDownloaded'));
      return true;
    } catch (error) {
      reportError(error, 'exportFailed');
      return false;
    }
  });
}

/** Resolves true when the image is on the clipboard. */
export function copyImage(stage: Konva.Stage | null): Promise<boolean | undefined> {
  return withBusy('copy', async () => {
    if (!stage) return false;
    const { scale } = useExportStore.getState();
    try {
      await prepareStage(stage);
      // Clipboard images are always PNG (the only format the async clipboard reliably accepts).
      const canvas = await renderFinalCanvas(stage, currentRenderOptions(scale, false));
      await copyBlobToClipboard(await canvasToBlob(canvas, 'image/png'));
      toast.success(t('toastCopied'));
      return true;
    } catch (error) {
      reportError(error, 'copyFailed');
      return false;
    }
  });
}

/** Renders the export at 1x for the preview dialog. Returns an object URL the caller must revoke. */
export function renderPreview(
  stage: Konva.Stage | null,
): Promise<{ url: string; width: number; height: number } | undefined> {
  return withBusy('preview', async () => {
    if (!stage) return undefined;
    try {
      await prepareStage(stage);
      const canvas = await renderFinalCanvas(stage, currentRenderOptions(1, false));
      const blob = await canvasToBlob(canvas, 'image/png');
      return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
    } catch (error) {
      reportError(error, 'exportFailed');
      return undefined;
    }
  });
}
