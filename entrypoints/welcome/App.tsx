import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Keyboard, Library, MousePointerClick, Pin, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/src/shared/Logo';
import { ThemeToggle } from '@/src/shared/ThemeToggle';
import { t, type MessageKey } from '@/src/shared/i18n';
import './App.css';

const COMMANDS: Array<{ name: string; label: MessageKey }> = [
  { name: 'capture-visible-area', label: 'captureVisible' },
  { name: 'select-area', label: 'captureArea' },
  { name: 'select-element', label: 'captureElement' },
  { name: 'capture-full-page', label: 'captureFullPage' },
];

function useShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  useEffect(() => {
    browser.commands
      .getAll()
      .then((commands) =>
        setShortcuts(Object.fromEntries(commands.filter((c) => c.name).map((c) => [c.name, c.shortcut ?? '']))),
      )
      .catch(() => undefined);
  }, []);
  return shortcuts;
}

/** Product shot built from the brand's own shapes - no screenshots to keep in sync. */
function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <svg className="hero-visual__corners" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M2 22V8a6 6 0 0 1 6-6h14M98 78v14a6 6 0 0 1-6 6H78" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="hero-visual__panel">
        <div className="hero-window">
          <div className="hero-window__bar">
            <i />
            <i />
            <i />
            <span className="hero-window__address" />
          </div>
          <div className="hero-window__body">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="hero-window__cards">
              <div className="skeleton-card" />
              <div className="skeleton-card skeleton-card--highlight">
                <span className="annotation-box" />
              </div>
              <div className="skeleton-card">
                <span className="annotation-blur" />
              </div>
            </div>
          </div>
          <span className="annotation-step annotation-step--1">1</span>
          <span className="annotation-step annotation-step--2">2</span>
          <svg className="annotation-arrow" viewBox="0 0 120 60">
            <path d="M8 52C40 50 74 34 104 12" />
            <path d="M88 10l18 1-6 17" />
          </svg>
        </div>
      </div>
      <svg className="hero-visual__spark" viewBox="0 0 40 40">
        <path d="M20 2Q23 17 38 20Q23 23 20 38Q17 23 2 20Q17 17 20 2Z" />
      </svg>
    </div>
  );
}

function App() {
  const shortcuts = useShortcuts();

  useEffect(() => {
    document.title = `${t('welcomeDocTitle')} · SnapFrame`;
  }, []);

  function openPage(url: string) {
    void browser.tabs.create({ url });
  }

  return (
    <div className="welcome">
      <header className="welcome__header">
        <Logo size={30} />
        <ThemeToggle tooltipSide="left" />
      </header>

      <main className="welcome__main">
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">{t('welcomeEyebrow')}</p>
            <h1 className="hero__title">{t('welcomeTitle')}</h1>
            <p className="hero__subtitle">{t('welcomeSubtitle')}</p>
            <div className="hero__actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => openPage(browser.runtime.getURL('/library.html'))}
              >
                <Library size={17} />
                {t('openLibrary')}
              </button>
              <button type="button" className="btn btn--lg" onClick={() => openPage('chrome://extensions/shortcuts')}>
                <Keyboard size={17} />
                {t('customizeShortcuts')}
              </button>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section className="steps" aria-label={t('welcomeStepsLabel')}>
          <article className="step">
            <span className="step__icon">
              <Pin size={18} />
            </span>
            <span className="step__number">01</span>
            <h2 className="step__title">{t('welcomeStep1Title')}</h2>
            <p className="step__body">{t('welcomeStep1Body')}</p>
          </article>
          <article className="step">
            <span className="step__icon">
              <MousePointerClick size={18} />
            </span>
            <span className="step__number">02</span>
            <h2 className="step__title">{t('welcomeStep2Title')}</h2>
            <p className="step__body">{t('welcomeStep2Body')}</p>
            <ul className="step__shortcuts">
              {COMMANDS.map((command) => (
                <li key={command.name}>
                  <span>{t(command.label)}</span>
                  {shortcuts[command.name] ? (
                    <kbd className="kbd">{shortcuts[command.name]}</kbd>
                  ) : (
                    <span className="step__unset">{t('shortcutNotSet')}</span>
                  )}
                </li>
              ))}
            </ul>
          </article>
          <article className="step">
            <span className="step__icon">
              <Sparkles size={18} />
            </span>
            <span className="step__number">03</span>
            <h2 className="step__title">{t('welcomeStep3Title')}</h2>
            <p className="step__body">{t('welcomeStep3Body')}</p>
          </article>
        </section>

        <section className="privacy">
          <span className="privacy__icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 className="privacy__title">{t('welcomePrivacyTitle')}</h2>
            <p className="privacy__body">{t('welcomePrivacyBody')}</p>
          </div>
        </section>
      </main>

      <footer className="welcome__footer">
        <span>SnapFrame v{browser.runtime.getManifest().version}</span>
      </footer>
    </div>
  );
}

export default App;
