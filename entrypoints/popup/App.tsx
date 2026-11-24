import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  CircleAlert,
  Keyboard,
  Library,
  LoaderCircle,
  Monitor,
  PanelTop,
  Settings,
  SquareDashedMousePointer,
  SquareMousePointer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isMessage, type CaptureResponse, type RuntimeMessage } from '@/src/shared/messages';
import { Logo } from '@/src/shared/Logo';
import { ThemeToggle } from '@/src/shared/ThemeToggle';
import { t, type MessageKey } from '@/src/shared/i18n';
import { RecentGrid } from './RecentGrid';
import './App.css';

type ActionId = 'visible' | 'area' | 'element' | 'full-page';

interface CaptureAction {
  id: ActionId;
  command: string;
  icon: LucideIcon;
  label: MessageKey;
  description: MessageKey;
}

const ACTIONS: CaptureAction[] = [
  {
    id: 'visible',
    command: 'capture-visible-area',
    icon: Monitor,
    label: 'captureVisible',
    description: 'captureVisibleDescription',
  },
  {
    id: 'area',
    command: 'select-area',
    icon: SquareDashedMousePointer,
    label: 'captureArea',
    description: 'captureAreaDescription',
  },
  {
    id: 'element',
    command: 'select-element',
    icon: SquareMousePointer,
    label: 'captureElement',
    description: 'captureElementDescription',
  },
  {
    id: 'full-page',
    command: 'capture-full-page',
    icon: PanelTop,
    label: 'captureFullPage',
    description: 'captureFullPageDescription',
  },
];

function requestFor(id: ActionId): RuntimeMessage {
  if (id === 'visible') return { type: 'capture-visible-area', devicePixelRatio: window.devicePixelRatio || 1 };
  if (id === 'area') return { type: 'start-area-selection', mode: 'area' };
  if (id === 'element') return { type: 'start-area-selection', mode: 'element' };
  return { type: 'start-full-page-capture' };
}

function useCommandShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  useEffect(() => {
    browser.commands
      .getAll()
      .then((commands) => {
        const map: Record<string, string> = {};
        for (const command of commands) {
          if (command.name && command.shortcut) map[command.name] = command.shortcut;
        }
        setShortcuts(map);
      })
      .catch(() => undefined);
  }, []);
  return shortcuts;
}

function App() {
  const [active, setActive] = useState<ActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const shortcuts = useCommandShortcuts();

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isMessage(message, 'capture-progress')) setProgress({ done: message.done, total: message.total });
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  async function run(id: ActionId) {
    setActive(id);
    setError(null);
    setProgress(null);
    try {
      const response = (await browser.runtime.sendMessage(requestFor(id))) as CaptureResponse | undefined;
      if (!response?.ok) {
        setError(response?.error ?? t('errorCaptureFailed'));
        return;
      }
      // Area/element selection continues on the page; everything else has opened the editor.
      window.close();
    } catch {
      setError(t('errorCaptureFailed'));
    } finally {
      setActive(null);
    }
  }

  function openPage(url: string) {
    void browser.tabs.create({ url });
    window.close();
  }

  const busy = active !== null;
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="popup">
      <header className="popup__header">
        <h1 className="popup__brand">
          <Logo size={26} />
        </h1>
        <div className="popup__header-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('openLibrary')}
            data-tooltip={t('openLibrary')}
            onClick={() => openPage(browser.runtime.getURL('/library.html'))}
          >
            <Library size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('openSettings')}
            data-tooltip={t('openSettings')}
            onClick={() => {
              void browser.runtime.openOptionsPage();
              window.close();
            }}
          >
            <Settings size={17} />
          </button>
          <ThemeToggle tooltipSide="left" />
        </div>
      </header>

      <div className="popup__actions">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const isActive = active === action.id;
          const shortcut = shortcuts[action.command];
          return (
            <button
              key={action.id}
              type="button"
              className="capture-action"
              onClick={() => void run(action.id)}
              disabled={busy}
              aria-busy={isActive}
            >
              <span className="capture-action__icon">
                {isActive ? <LoaderCircle size={18} className="spinner" /> : <Icon size={18} strokeWidth={1.8} />}
              </span>
              <span className="capture-action__text">
                <span className="capture-action__label">{t(action.label)}</span>
                <span className="capture-action__description">
                  {isActive && action.id === 'full-page' && progress
                    ? t('captureProgress', [progress.done, progress.total])
                    : t(action.description)}
                </span>
              </span>
              {shortcut && <kbd className="kbd capture-action__kbd">{shortcut}</kbd>}
            </button>
          );
        })}
      </div>

      {active === 'full-page' && (
        <div
          className="popup__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('captureFullPage')}
        >
          <span style={{ width: `${Math.max(4, percent)}%` }} />
        </div>
      )}

      {error && (
        <p className="popup__error" role="alert">
          <CircleAlert size={15} />
          <span>{error}</span>
        </p>
      )}

      <RecentGrid onOpenLibrary={() => openPage(browser.runtime.getURL('/library.html'))} />

      <footer className="popup__footer">
        <button type="button" className="popup__link" onClick={() => openPage('chrome://extensions/shortcuts')}>
          <Keyboard size={13} />
          {t('customizeShortcuts')}
        </button>
        <span className="popup__version">v{browser.runtime.getManifest().version}</span>
      </footer>
    </main>
  );
}

export default App;
