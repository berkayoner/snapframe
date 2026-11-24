import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { hasTextBackground, readTextData } from '@/src/annotations/text/textStyle';
import { t } from '@/src/shared/i18n';
import { newTextCoalesceKey } from '@/src/annotations/text/text.tool';

/**
 * A real HTML <textarea> positioned over the Konva label it edits (Konva
 * has no native text input). It lives inside the canvas shell, so it
 * scrolls and zooms with the canvas. Positioned from the object model
 * rather than the Konva node, so it can mount (and take focus) in the same
 * render that creates a new label. Committed on blur / Esc / Ctrl+Enter;
 * an empty label is removed.
 */
export function TextEditorOverlay() {
  const editingTextId = useEditorStore((state) => state.editingTextId);
  const objects = useEditorStore((state) => state.objects);
  const zoom = useEditorStore((state) => state.zoom);
  const setEditingTextId = useEditorStore((state) => state.setEditingTextId);
  const updateObjects = useEditorStore((state) => state.updateObjects);
  const removeObject = useEditorStore((state) => state.removeObject);
  const endCoalesce = useEditorStore((state) => state.endCoalesce);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const object = editingTextId ? objects.find((candidate) => candidate.id === editingTextId) : undefined;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resize(textarea);
    // Focus after the current input event finishes, so the click that created the label can't steal it back.
    const frame = requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [object?.id]);

  if (!editingTextId || !object) return null;

  const data = readTextData(object.style);
  const id = editingTextId;

  function commit(discardIfEmpty: boolean) {
    const value = textareaRef.current?.value ?? '';
    setEditingTextId(null);
    const coalesce = newTextCoalesceKey(id);
    if (discardIfEmpty && value.trim() === '') {
      removeObject(id, { coalesce });
      return;
    }
    if (value !== data.text) updateObjects([{ id, patch: { style: { ...data, text: value } } }], { coalesce });
    // Only the first commit joins the label's creation step; later edits are their own undo steps.
    endCoalesce();
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: object.x * zoom,
    top: object.y * zoom,
    minWidth: Math.max(80, data.fontSize * 4 * zoom),
    fontFamily: data.fontFamily,
    fontSize: data.fontSize * zoom,
    fontWeight: data.fontWeight,
    lineHeight: 1.25,
    color: data.color,
    background: hasTextBackground(data) ? data.backgroundColor : 'rgba(255,255,255,0.08)',
    padding: data.padding * zoom,
    borderRadius: data.cornerRadius * zoom,
    textAlign: data.align,
  };

  return (
    <textarea
      ref={textareaRef}
      className="text-editor-overlay"
      defaultValue={data.text}
      placeholder={t('textPlaceholder')}
      aria-label={t('textPlaceholder')}
      rows={1}
      spellCheck={false}
      style={style}
      onInput={(event) => resize(event.currentTarget)}
      onBlur={() => commit(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function resize(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
  textarea.style.width = 'auto';
  textarea.style.width = `${Math.max(textarea.scrollWidth, 0) + 4}px`;
}
