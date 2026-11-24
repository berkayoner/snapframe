import { Dialog } from '@/src/shared/Dialog';
import { MOD_KEY, TOOLS } from '@/src/editor/tools/registry';
import { t, type MessageKey } from '@/src/shared/i18n';

const GENERAL: Array<{ keys: string[]; label: MessageKey }> = [
  { keys: [MOD_KEY, 'S'], label: 'download' },
  { keys: [MOD_KEY, 'Shift', 'C'], label: 'copyImage' },
  { keys: [MOD_KEY, 'Z'], label: 'undo' },
  { keys: [MOD_KEY, 'Shift', 'Z'], label: 'redo' },
  { keys: [MOD_KEY, 'A'], label: 'selectAll' },
  { keys: [MOD_KEY, 'D'], label: 'duplicate' },
  { keys: [MOD_KEY, 'C / V'], label: 'copyPasteObjects' },
  { keys: ['Del'], label: 'delete' },
  { keys: ['←↑→↓'], label: 'nudge' },
  { keys: ['[', ']'], label: 'arrangeShortcut' },
  { keys: ['Shift'], label: 'constrainShortcut' },
  { keys: [MOD_KEY, '+ / −'], label: 'zoomInOut' },
  { keys: [MOD_KEY, '0'], label: 'zoomFit' },
  { keys: [MOD_KEY, '1'], label: 'zoomActualSize' },
  { keys: ['Esc'], label: 'escapeShortcut' },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="shortcuts__keys">
      {keys.map((key) => (
        <kbd key={key} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t('shortcutsTitle')}>
      <div className="shortcuts">
        <section>
          <h3 className="shortcuts__heading">{t('shortcutsTools')}</h3>
          <ul className="shortcuts__list">
            {TOOLS.map((tool) => (
              <li key={tool.id}>
                <span>{t(tool.label)}</span>
                <Keys keys={[tool.key]} />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="shortcuts__heading">{t('shortcutsGeneral')}</h3>
          <ul className="shortcuts__list">
            {GENERAL.map((item) => (
              <li key={item.label}>
                <span>{t(item.label)}</span>
                <Keys keys={item.keys} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
