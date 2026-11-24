import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { TOOLS } from '@/src/editor/tools/registry';
import { t } from '@/src/shared/i18n';
import './Toolbar.css';

/**
 * Vertical tool rail. Each tool shows its single-key shortcut in the
 * tooltip; the active tool is marked by an indicator that glides between
 * buttons instead of jumping.
 */
export function Toolbar() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const button = buttonRefs.current.get(activeTool);
    setIndicatorTop(button ? button.offsetTop : null);
  }, [activeTool]);

  return (
    <nav className="tool-rail" role="toolbar" aria-label={t('toolbarLabel')} aria-orientation="vertical">
      {indicatorTop !== null && (
        <span
          className="tool-rail__indicator"
          style={{ transform: `translate(-50%, ${indicatorTop}px)` }}
          aria-hidden
        />
      )}
      {TOOLS.map((tool, index) => {
        const Icon = tool.icon;
        const label = t(tool.label);
        const newGroup = index > 0 && TOOLS[index - 1]?.group !== tool.group;
        return (
          <Fragment key={tool.id}>
            {newGroup && <span className="tool-rail__separator" aria-hidden />}
            <button
              ref={(node) => {
                if (node) buttonRefs.current.set(tool.id, node);
                else buttonRefs.current.delete(tool.id);
              }}
              type="button"
              className="icon-btn tool-rail__button"
              aria-pressed={activeTool === tool.id}
              aria-label={`${label} (${tool.key})`}
              aria-keyshortcuts={tool.key}
              data-tooltip={`${label}   ${tool.key}`}
              data-tooltip-side="right"
              onClick={() => setActiveTool(tool.id)}
            >
              <Icon size={18} strokeWidth={1.9} />
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
