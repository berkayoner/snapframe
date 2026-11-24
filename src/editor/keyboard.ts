import { useEffect, useEffectEvent } from 'react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { toolForKey } from '@/src/editor/tools/registry';
import { isUsableCrop, useCropStore } from '@/src/editor/tools/crop.tool';
import { setZoomPercent, stepZoom, zoomToFit } from '@/src/editor/zoomActions';

const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

interface ShortcutHandlers {
  onDownload: () => void;
  onCopyImage: () => void;
  onToggleShortcuts: () => void;
}

/**
 * Global editor shortcuts. Listens in the capture phase so it sees keys
 * before focused widgets swallow them, then ignores everything typed into
 * form fields except Ctrl/⌘+S (download) - so the browser's "Save page"
 * dialog never appears from the editor.
 */
export function useEditorShortcuts(handlers: ShortcutHandlers): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === 's') {
      event.preventDefault();
      handlers.onDownload();
      return;
    }
    if (isEditableTarget(event.target) || document.querySelector('dialog[open]')) return;

    const store = useEditorStore.getState();
    const prevent = () => event.preventDefault();

    if (mod) {
      switch (key) {
        case 'z':
          prevent();
          if (event.shiftKey) store.redo();
          else store.undo();
          return;
        case 'y':
          prevent();
          store.redo();
          return;
        case 'c':
          if (event.shiftKey) {
            prevent();
            handlers.onCopyImage();
          } else if (store.selectedIds.length > 0) {
            prevent();
            store.copySelection();
          }
          return;
        case 'v':
          if (store.clipboard.length > 0) {
            prevent();
            store.paste();
          }
          return;
        case 'a':
          prevent();
          store.selectAll();
          return;
        case 'd':
          prevent();
          store.duplicateSelection();
          return;
        case '=':
        case '+':
          prevent();
          stepZoom(1);
          return;
        case '-':
          prevent();
          stepZoom(-1);
          return;
        case '0':
          prevent();
          zoomToFit();
          return;
        case '1':
          prevent();
          setZoomPercent(100);
          return;
        default:
          return;
      }
    }
    if (event.altKey) return;

    switch (event.key) {
      case 'Escape':
        if (store.activeTool !== 'select') store.setActiveTool('select');
        else store.clearSelection();
        return;
      case 'Enter': {
        if (store.activeTool === 'crop') {
          const rect = useCropStore.getState().rect;
          if (isUsableCrop(rect)) store.applyCrop(rect);
          store.setActiveTool('select');
          return;
        }
        const [onlyId] = store.selectedIds;
        const only = store.objects.find((object) => object.id === onlyId);
        if (store.selectedIds.length === 1 && only?.type === 'text') {
          prevent();
          store.setEditingTextId(only.id);
        }
        return;
      }
      case 'Delete':
      case 'Backspace':
        if (store.selectedIds.length > 0) {
          prevent();
          store.deleteSelection();
        }
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (store.selectedIds.length === 0) return;
        prevent();
        const step = (event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP) * store.unit;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        store.nudgeSelection(dx, dy);
        return;
      }
      case '[':
        store.sendToBack();
        return;
      case ']':
        store.bringToFront();
        return;
      case '?':
        handlers.onToggleShortcuts();
        return;
      default: {
        const tool = event.shiftKey ? undefined : toolForKey(event.key);
        if (tool) {
          prevent();
          store.setActiveTool(tool);
        }
      }
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);
}
