import { useEffect } from 'react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { saveProject } from '@/src/storage/projects';

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Debounced-saves the document (objects, canvas size, frame, mockup) so a
 * closed tab or browser can recover it. Starts only once the scene has been
 * loaded (`enabled`), so the load itself never counts as an edit, and
 * flushes immediately when the tab is hidden or closed.
 */
export function useAutosave(captureId: string | null, enabled: boolean): void {
  useEffect(() => {
    if (!captureId || !enabled) return;

    let timeout: number | undefined;
    let dirty = false;

    const flush = () => {
      window.clearTimeout(timeout);
      if (!dirty) return;
      dirty = false;
      const { canvasWidth, canvasHeight, objects, beautify, mockupId } = useEditorStore.getState();
      void saveProject(captureId, { canvasWidth, canvasHeight, objects, beautify, mockupId });
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
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [captureId, enabled]);
}
