import { useEffect, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { renderProjectThumbnail } from '@/src/editor/projectThumbnail';
import { saveProject, saveProjectThumbnail } from '@/src/storage/projects';

const AUTOSAVE_DEBOUNCE_MS = 600;
const THUMBNAIL_RETRY_MS = 500;

/**
 * Debounced-saves the document (objects, canvas size, frame, mockup) so a
 * closed tab or browser can recover it. Starts only once the scene has been
 * loaded (`enabled`), so the load itself never counts as an edit, and
 * flushes immediately when the tab is hidden or closed. After each save it
 * also refreshes the project's preview for the library and popup.
 */
export function useAutosave(captureId: string | null, enabled: boolean, stageRef: RefObject<Konva.Stage | null>): void {
  useEffect(() => {
    if (!captureId || !enabled) return;

    let timeout: number | undefined;
    let thumbnailTimer: number | undefined;
    let dirty = false;

    /** A fresh preview, or undefined - retrying shortly when the canvas is mid-animation. */
    const takeThumbnail = (): Blob | undefined => {
      window.clearTimeout(thumbnailTimer);
      const stage = stageRef.current;
      const thumbnail = stage ? renderProjectThumbnail(stage) : undefined;
      if (thumbnail !== 'busy') return thumbnail;
      thumbnailTimer = window.setTimeout(() => {
        const retry = takeThumbnail();
        if (retry) void saveProjectThumbnail(captureId, retry).catch(() => undefined);
      }, THUMBNAIL_RETRY_MS);
      return undefined;
    };

    // Everything is prepared synchronously, so the save starts even when the tab is closing.
    const flush = () => {
      window.clearTimeout(timeout);
      if (!dirty) return;
      dirty = false;
      const { canvasWidth, canvasHeight, objects, beautify, mockupId } = useEditorStore.getState();
      const thumbnail = takeThumbnail();
      void saveProject(captureId, { canvasWidth, canvasHeight, objects, beautify, mockupId }, thumbnail).catch(
        () => undefined,
      );
    };

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      const changed =
        state.objects !== previous.objects ||
        state.canvasWidth !== previous.canvasWidth ||
        state.canvasHeight !== previous.canvasHeight ||
        state.beautify !== previous.beautify ||
        state.mockupId !== previous.mockupId;
      if (!changed) return;
      dirty = true;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      window.clearTimeout(thumbnailTimer);
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [captureId, enabled, stageRef]);
}
