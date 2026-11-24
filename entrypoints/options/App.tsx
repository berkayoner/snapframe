import { useEffect, useRef, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import {
  Check,
  ClipboardCopy,
  Download,
  FileText,
  History,
  Keyboard,
  PenLine,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/src/shared/Logo';
import { ThemeToggle } from '@/src/shared/ThemeToggle';
import { Segmented } from '@/src/editor/inspector/controls';
import { Toaster, toast } from '@/src/shared/toast';
import { t, type MessageKey } from '@/src/shared/i18n';
import {
  HISTORY_LIMITS,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  type AfterCapture,
  type Settings,
} from '@/src/shared/settings';
import { buildFileName, DEFAULT_FILE_NAME_TEMPLATE, FILE_NAME_TOKENS } from '@/src/export/fileName';
import './App.css';

const AFTER_CAPTURE: Array<{ value: AfterCapture; icon: LucideIcon; title: MessageKey; description: MessageKey }> = [
  { value: 'editor', icon: PenLine, title: 'afterEditor', description: 'afterEditorDescription' },
  { value: 'copy', icon: ClipboardCopy, title: 'afterCopy', description: 'afterCopyDescription' },
  { value: 'download', icon: Download, title: 'afterDownload', description: 'afterDownloadDescription' },
];

const TOKEN_LABEL: Record<(typeof FILE_NAME_TOKENS)[number], MessageKey> = {
  '{site}': 'tokenSite',
  '{title}': 'tokenTitle',
  '{date}': 'tokenDate',
  '{time}': 'tokenTime',
};

/** The file name preview uses a sample page captured when this page opened. */
const PREVIEW_SOURCE = {
  sourceUrl: 'https://www.example.com/pricing',
  sourceTitle: 'Pricing — Example',
  createdAt: Date.now(),
};

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="options__section">
      <div className="options__section-head">
        <span className="options__section-icon" aria-hidden>
          <Icon size={16} />
        </span>
        <div>
          <h2 className="options__section-title">{title}</h2>
          {hint && <p className="options__hint">{hint}</p>}
        </div>
      </div>
      <div className="options__section-body">{children}</div>
    </section>
  );
}

function useDownloadPermission(): [boolean | null, () => void] {
  const [granted, setGranted] = useState<boolean | null>(null);
  const refresh = () => {
    browser.permissions
      .contains({ permissions: ['downloads'] })
      .then(setGranted)
      .catch(() => setGranted(false));
  };
  useEffect(refresh, []);
  return [granted, refresh];
}

/** Settings page: what happens after a capture, file names, library size and page awareness. */
function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [template, setTemplate] = useState('');
  /** Bumped on every save: re-keys the "Saved" badge so its animation replays. */
  const [saveCount, setSaveCount] = useState(0);
  const [downloadGranted, refreshPermission] = useDownloadPermission();
  const templateRef = useRef<HTMLInputElement>(null);
  const templateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = `${t('settingsTitle')} · SnapFrame`;
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setTemplate(loaded.fileNameTemplate);
    });
    return onSettingsChanged((next) => {
      setSettings(next);
      setTemplate(next.fileNameTemplate);
    });
  }, []);

  async function update(patch: Partial<Settings>) {
    // Show the change right away; the save is quick, but a switch shouldn't flick back meanwhile.
    setSettings((current) => (current ? { ...current, ...patch } : current));
    const next = await saveSettings(patch);
    setSettings(next);
    setSaveCount((count) => count + 1);
  }

  async function chooseAfterCapture(value: AfterCapture) {
    if (value === 'download' && !downloadGranted) {
      // Must run straight from the click: permission prompts need a user gesture.
      const granted = await browser.permissions.request({ permissions: ['downloads'] }).catch(() => false);
      refreshPermission();
      if (!granted) {
        toast.info(t('downloadPermissionDenied'));
        return;
      }
    }
    await update({ afterCapture: value });
    // Least privilege: hand the downloads permission back when it's no longer used.
    if (value !== 'download' && downloadGranted) {
      await browser.permissions.remove({ permissions: ['downloads'] }).catch(() => false);
      refreshPermission();
    }
  }

  function changeTemplate(value: string) {
    setTemplate(value);
    window.clearTimeout(templateTimer.current);
    templateTimer.current = window.setTimeout(() => {
      if (value.trim()) void update({ fileNameTemplate: value });
    }, 400);
  }

  function insertToken(token: string) {
    const input = templateRef.current;
    const start = input?.selectionStart ?? template.length;
    const end = input?.selectionEnd ?? template.length;
    const value = template.slice(0, start) + token + template.slice(end);
    changeTemplate(value);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  if (!settings) return null;
  const preview = buildFileName(template.trim() ? template : DEFAULT_FILE_NAME_TEMPLATE, PREVIEW_SOURCE, 'png');
  const downloadMissing = settings.afterCapture === 'download' && downloadGranted === false;

  return (
    <div className="options">
      <header className="options__header">
        <div className="options__brand">
          <Logo size={28} />
          <span className="options__divider" aria-hidden />
          <h1 className="options__title">{t('settingsTitle')}</h1>
        </div>
        <div className="options__tools">
          <span key={saveCount} className="options__saved" data-visible={saveCount > 0} role="status">
            {saveCount > 0 && (
              <>
                <Check size={14} />
                {t('settingsSaved')}
              </>
            )}
          </span>
          <ThemeToggle tooltipSide="left" />
        </div>
      </header>

      <main className="options__main">
        <Section icon={Zap} title={t('afterCaptureTitle')} hint={t('afterCaptureHint')}>
          <div className="choice-grid" role="radiogroup" aria-label={t('afterCaptureTitle')}>
            {AFTER_CAPTURE.map((choice) => {
              const Icon = choice.icon;
              const selected = settings.afterCapture === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="choice"
                  onClick={() => void chooseAfterCapture(choice.value)}
                >
                  <span className="choice__icon">
                    <Icon size={18} />
                  </span>
                  <span className="choice__title">{t(choice.title)}</span>
                  <span className="choice__description">{t(choice.description)}</span>
                  <span className="choice__check" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
          {downloadMissing && (
            <p className="options__warning" role="alert">
              <TriangleAlert size={15} />
              <span>{t('downloadPermissionMissing')}</span>
              <button type="button" className="btn btn--sm" onClick={() => void chooseAfterCapture('download')}>
                {t('downloadPermissionGrant')}
              </button>
            </p>
          )}
        </Section>

        <Section icon={FileText} title={t('fileNameTitle')} hint={t('fileNameHint')}>
          <div className="template">
            <input
              ref={templateRef}
              className="input template__input"
              value={template}
              spellCheck={false}
              aria-label={t('fileNameTitle')}
              onChange={(event) => changeTemplate(event.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={t('fileNameReset')}
              data-tooltip={t('fileNameReset')}
              data-tooltip-side="left"
              disabled={template === DEFAULT_FILE_NAME_TEMPLATE}
              onClick={() => changeTemplate(DEFAULT_FILE_NAME_TEMPLATE)}
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <div className="tokens" role="group" aria-label={t('fileNameTokens')}>
            {FILE_NAME_TOKENS.map((token) => (
              <button key={token} type="button" className="token" onClick={() => insertToken(token)}>
                <code>{token}</code>
                <span>{t(TOKEN_LABEL[token])}</span>
              </button>
            ))}
          </div>
          <p className="template__preview">
            <span>{t('fileNamePreview')}</span>
            <code>{preview}</code>
          </p>
        </Section>

        <Section icon={History} title={t('historyTitle')} hint={t('historyHint')}>
          <div className="options__row">
            <span>{t('historyKeep')}</span>
            <Segmented<number>
              label={t('historyTitle')}
              value={settings.historyLimit}
              onChange={(historyLimit) => void update({ historyLimit })}
              options={HISTORY_LIMITS.map((limit) => ({ value: limit, label: String(limit) }))}
            />
          </div>
        </Section>

        <Section icon={ShieldCheck} title={t('privacyTitle')}>
          <label className="switch-row">
            <span className="switch-row__text">
              <span className="switch-row__title">{t('pageAwareTitle')}</span>
              <span className="switch-row__hint">{t('pageAwareHint')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={settings.pageAware}
              onChange={(event) => void update({ pageAware: event.target.checked })}
            />
          </label>
        </Section>

        <Section icon={Keyboard} title={t('shortcutsTitle')} hint={t('shortcutsSettingsHint')}>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
            >
              <Keyboard size={15} />
              {t('customizeShortcuts')}
            </button>
          </div>
        </Section>

        <p className="options__footer">
          SnapFrame v{browser.runtime.getManifest().version} · {t('settingsPrivacy')}
        </p>
      </main>
      <Toaster />
    </div>
  );
}

export default App;
