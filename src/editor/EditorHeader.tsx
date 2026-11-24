import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Eye,
  Keyboard,
  Library,
  LoaderCircle,
  Redo2,
  Undo2,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { copyImage, downloadImage, predictCurrentOutputSize, useExportStore } from '@/src/editor/exportActions';
import { Segmented, Slider } from '@/src/editor/inspector/controls';
import { MOD_KEY } from '@/src/editor/tools/registry';
import { fitsCanvasLimits } from '@/src/export/render';
import { LogoMark } from '@/src/shared/Logo';
import { ThemeToggle } from '@/src/shared/ThemeToggle';
import { t } from '@/src/shared/i18n';
import type { ExportFormat, ExportScale } from '@/src/shared/prefs';
import type { CaptureRecord } from '@/src/storage/db';
import { hostOf, SOURCE_TYPE_LABEL } from '@/src/shared/labels';

interface EditorHeaderProps {
  record: CaptureRecord;
  stageRef: RefObject<Konva.Stage | null>;
  onPreview: () => void;
  onAnimate: () => void;
  onShowShortcuts: () => void;
}

function ExportMenu({ onClose }: { onClose: () => void }) {
  const format = useExportStore((state) => state.format);
  const scale = useExportStore((state) => state.scale);
  const quality = useExportStore((state) => state.quality);
  const setFormat = useExportStore((state) => state.setFormat);
  const setScale = useExportStore((state) => state.setScale);
  const setQuality = useExportStore((state) => state.setQuality);
  // Subscribe to what the size estimate depends on, so it stays current.
  useEditorStore((state) => state.canvasWidth);
  useEditorStore((state) => state.canvasHeight);
  useEditorStore((state) => state.beautify);
  useEditorStore((state) => state.mockupId);
  const size = predictCurrentOutputSize(scale);
  const tooLarge = !fitsCanvasLimits(size.width, size.height);

  return (
    <div className="export-menu" role="dialog" aria-label={t('exportSettings')}>
      <div className="export-menu__row">
        <span className="export-menu__label">{t('exportFormat')}</span>
        <Segmented<ExportFormat>
          label={t('exportFormat')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPG' },
          ]}
        />
      </div>
      {format === 'jpg' && (
        <Slider
          label={t('exportQuality')}
          value={quality}
          min={50}
          max={100}
          step={5}
          format={(value) => `${value}%`}
          onChange={setQuality}
        />
      )}
      <div className="export-menu__row">
        <span className="export-menu__label">{t('exportScale')}</span>
        <Segmented<ExportScale>
          label={t('exportScale')}
          value={scale}
          onChange={setScale}
          options={[
            { value: 1, label: '1×' },
            { value: 2, label: '2×' },
          ]}
        />
      </div>
      <p className={`export-menu__size${tooLarge ? ' export-menu__size--warn' : ''}`}>
        {tooLarge ? t('exportTooLarge', `${size.width}x${size.height}`) : t('exportSize', [size.width, size.height])}
      </p>
      <button type="button" className="btn btn--sm btn--ghost export-menu__close" onClick={onClose}>
        {t('done')}
      </button>
    </div>
  );
}

export function EditorHeader({ record, stageRef, onPreview, onAnimate, onShowShortcuts }: EditorHeaderProps) {
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const busy = useExportStore((state) => state.busy);
  const format = useExportStore((state) => state.format);
  const scale = useExportStore((state) => state.scale);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Brief check-mark confirmation on the button that just succeeded. */
  const [done, setDone] = useState<'download' | 'copy' | null>(null);
  const doneTimer = useRef<number | undefined>(undefined);

  function confirm(action: 'download' | 'copy', succeeded: boolean | undefined) {
    if (!succeeded) return;
    window.clearTimeout(doneTimer.current);
    setDone(action);
    doneTimer.current = window.setTimeout(() => setDone(null), 1400);
  }
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const host = hostOf(record.sourceUrl);
  const title = record.sourceTitle?.trim() || host || t('untitledCapture');
  const meta = [host, `${canvasWidth} × ${canvasHeight}`, t(SOURCE_TYPE_LABEL[record.sourceType])]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="editor-header">
      <div className="editor-header__brand">
        <LogoMark size={26} className="editor-header__logo" />
        <div className="editor-header__source">
          <span className="editor-header__title" title={title}>
            {title}
          </span>
          <span className="editor-header__meta">{meta}</span>
        </div>
      </div>

      <div className="editor-header__history">
        <button
          type="button"
          className="icon-btn"
          disabled={!canUndo}
          onClick={undo}
          aria-label={t('undo')}
          data-tooltip={`${t('undo')}   ${MOD_KEY}+Z`}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!canRedo}
          onClick={redo}
          aria-label={t('redo')}
          data-tooltip={`${t('redo')}   ${MOD_KEY}+Shift+Z`}
        >
          <Redo2 size={17} />
        </button>
      </div>

      <div className="editor-header__actions">
        <a
          className="icon-btn"
          href={browser.runtime.getURL('/library.html')}
          target="_blank"
          rel="noopener"
          aria-label={t('openLibrary')}
          data-tooltip={t('openLibrary')}
        >
          <Library size={17} />
        </a>
        <button
          type="button"
          className="icon-btn"
          onClick={onShowShortcuts}
          aria-label={t('shortcutsTitle')}
          data-tooltip={`${t('shortcutsTitle')}   ?`}
        >
          <Keyboard size={17} />
        </button>
        <ThemeToggle />
        <span className="editor-header__divider" aria-hidden />
        <button type="button" className="btn" onClick={onPreview} disabled={busy !== null}>
          {busy === 'preview' ? <LoaderCircle size={15} className="spinner" /> : <Eye size={15} />}
          {t('preview')}
        </button>
        <button
          type="button"
          className="btn btn--animate"
          onClick={onAnimate}
          disabled={busy !== null}
          data-tooltip={t('animateTooltip')}
        >
          <Clapperboard size={15} />
          {t('animate')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void copyImage(stageRef.current).then((ok) => confirm('copy', ok))}
          disabled={busy !== null}
          data-tooltip={`${MOD_KEY}+Shift+C`}
        >
          {busy === 'copy' ? (
            <LoaderCircle size={15} className="spinner" />
          ) : done === 'copy' ? (
            <Check size={15} className="pop-in" />
          ) : (
            <Copy size={15} />
          )}
          {done === 'copy' ? t('copied') : t('copy')}
        </button>
        <div className="split-button" ref={menuRef}>
          <button
            type="button"
            className="btn btn--primary split-button__main"
            onClick={() => void downloadImage(stageRef.current, record).then((ok) => confirm('download', ok))}
            disabled={busy !== null}
            data-tooltip={`${MOD_KEY}+S`}
          >
            {busy === 'download' ? (
              <LoaderCircle size={15} className="spinner" />
            ) : done === 'download' ? (
              <Check size={15} className="pop-in" />
            ) : (
              <Download size={15} />
            )}
            {done === 'download' ? t('downloaded') : t('download')}
            <span className="split-button__badge">
              {format.toUpperCase()}
              {scale === 2 ? ' 2×' : ''}
            </span>
          </button>
          <button
            type="button"
            className="btn btn--primary split-button__toggle"
            aria-label={t('exportSettings')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronDown size={15} />
          </button>
          {menuOpen && <ExportMenu onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </header>
  );
}
