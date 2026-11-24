import { useEditorStore } from '@/src/editor/store/editorStore';

/**
 * End-to-end test hook. Only the `e2e` build mode (npm run build:e2e)
 * exposes the editor store on window; production builds compile this to a
 * no-op, so nothing leaks into the shipped extension.
 */
export function exposeEditorForE2E(): void {
  if (import.meta.env.MODE !== 'e2e') return;
  (window as unknown as { __snapframeEditor: typeof useEditorStore }).__snapframeEditor = useEditorStore;
}
