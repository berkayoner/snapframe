import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { browser } from 'wxt/browser';
import { Download, ImagePlus, LoaderCircle, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { clearAllCaptures, deleteCapture, listAllCaptures, MAX_HISTORY_ITEMS } from '@/src/storage/history';
import { ACCEPTED_IMAGE_TYPES, ImportError, importImageBlob } from '@/src/storage/importImage';
import { buildExportFileName, downloadBlob } from '@/src/export/png';
import type { CaptureRecord } from '@/src/storage/db';
import { hostOf, SOURCE_TYPE_LABEL } from '@/src/shared/labels';
import { Dialog } from '@/src/shared/Dialog';
import { Logo } from '@/src/shared/Logo';
import { CapturesIllustration } from '@/src/shared/Illustration';
import { ThemeToggle } from '@/src/shared/ThemeToggle';
import { Toaster, toast } from '@/src/shared/toast';
import { formatDateTime, t } from '@/src/shared/i18n';
import './App.css';

function editorUrl(captureId: string): string {
  return browser.runtime.getURL(`/editor.html?captureId=${encodeURIComponent(captureId)}`);
}

function extensionFor(blob: Blob): string {
  if (blob.type === 'image/jpeg') return 'jpg';
  if (blob.type === 'image/webp') return 'webp';
  if (blob.type === 'image/gif') return 'gif';
  return 'png';
}

type Confirm = { kind: 'delete'; record: CaptureRecord } | { kind: 'clear' } | null;

function CaptureCard({
  record,
  thumbUrl,
  index,
  onDelete,
}: {
  record: CaptureRecord;
  thumbUrl: string;
  /** Position in the grid, for the staggered entrance. */
  index: number;
  onDelete: (record: CaptureRecord) => void;
}) {
  const host = hostOf(record.sourceUrl);
  const title = record.sourceTitle?.trim() || host || t('untitledCapture');
  const href = editorUrl(record.captureId);

  return (
    <article className="capture-card" style={{ '--i': index } as CSSProperties}>
      <a className="capture-card__thumb" href={href} aria-label={t('openInEditor', title)}>
        <img src={thumbUrl} alt="" loading="lazy" />
        <span className="capture-card__badge">{t(SOURCE_TYPE_LABEL[record.sourceType])}</span>
      </a>
      <div className="capture-card__body">
        <a className="capture-card__title" href={href} title={title}>
          {title}
        </a>
        <div className="capture-card__meta">
          <span>{formatDateTime(record.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>
            {record.width} × {record.height}
          </span>
        </div>
        {host && <div className="capture-card__host">{host}</div>}
      </div>
      <div className="capture-card__actions">
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label={t('downloadOriginal')}
          data-tooltip={t('downloadOriginal')}
          data-tooltip-side="top"
          onClick={() =>
            downloadBlob(
              record.blob,
              buildExportFileName(record.sourceUrl, record.createdAt, extensionFor(record.blob)),
            )
          }
        >
          <Download size={15} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm capture-card__delete"
          aria-label={t('delete')}
          data-tooltip={t('delete')}
          data-tooltip-side="top"
          onClick={() => onDelete(record)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function App() {
  const [records, setRecords] = useState<CaptureRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const reload = useCallback(() => {
    listAllCaptures()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  useEffect(() => {
    document.title = `${t('libraryTitle')} · SnapFrame`;
    reload();
  }, [reload]);

  const thumbUrls = useMemo(
    () => new Map((records ?? []).map((record) => [record.captureId, URL.createObjectURL(record.blob)])),
    [records],
  );
  useEffect(() => () => thumbUrls.forEach((url) => URL.revokeObjectURL(url)), [thumbUrls]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!records || !needle) return records ?? [];
    return records.filter((record) =>
      [record.sourceTitle, record.sourceUrl].some((value) => value?.toLocaleLowerCase().includes(needle)),
    );
  }, [records, query]);

  const importFile = useCallback(async (file: Blob | null | undefined, name?: string) => {
    if (!file) return;
    setImporting(true);
    try {
      const captureId = await importImageBlob(file, name);
      window.location.href = editorUrl(captureId);
    } catch (error) {
      const reason = error instanceof ImportError ? error.reason : 'unreadable';
      toast.error(
        t(reason === 'unsupported' ? 'importUnsupported' : reason === 'too-large' ? 'importTooLarge' : 'importFailed'),
      );
      setImporting(false);
    }
  }, []);

  // Paste an image from the clipboard anywhere on the page to import it.
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void importFile(file, t('pastedImage'));
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importFile]);

  async function handleConfirm() {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    try {
      if (pending.kind === 'delete') {
        await deleteCapture(pending.record.captureId);
        toast.success(t('toastDeleted'));
      } else {
        await clearAllCaptures();
        toast.success(t('toastCleared'));
      }
    } catch {
      toast.error(t('deleteFailed'));
    }
    reload();
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  return (
    <div
      className="library"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));
        void importFile(file, file?.name);
      }}
    >
      <header className="library__header">
        <div className="library__brand">
          <Logo size={28} />
          <span className="library__divider" aria-hidden />
          <div>
            <h1 className="library__title">{t('libraryTitle')}</h1>
            <p className="library__subtitle">
              {records ? t('libraryCount', [records.length, MAX_HISTORY_ITEMS]) : t('loading')}
            </p>
          </div>
        </div>
        <div className="library__tools">
          <label className="library__search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              className="input"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <LoaderCircle size={15} className="spinner" /> : <ImagePlus size={15} />}
            {t('importImage')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importFile(file, file?.name);
            }}
          />
          <ThemeToggle tooltipSide="left" />
        </div>
      </header>

      <main className="library__main">
        {records === null ? (
          <div className="library__placeholder">
            <LoaderCircle size={22} className="spinner" aria-label={t('loading')} />
          </div>
        ) : records.length === 0 ? (
          <div className="library__empty">
            <CapturesIllustration width={180} />
            <h2 className="state-screen__title">{t('libraryEmptyTitle')}</h2>
            <p>{t('libraryEmptyBody')}</p>
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              {t('importImage')}
            </button>
          </div>
        ) : (
          <>
            <div className="library__toolbar">
              <span className="library__hint">{t('importHint')}</span>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={() => setConfirm({ kind: 'clear' })}
              >
                <Trash2 size={14} />
                {t('clearAll')}
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="library__no-results">{t('noResults')}</p>
            ) : (
              <div className="library__grid">
                {filtered.map((record, index) => (
                  <CaptureCard
                    key={record.captureId}
                    index={index}
                    record={record}
                    thumbUrl={thumbUrls.get(record.captureId) ?? ''}
                    onDelete={(target) => setConfirm({ kind: 'delete', record: target })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="library__footer">
        <ShieldCheck size={14} />
        {t('privacyNote', MAX_HISTORY_ITEMS)}
      </footer>

      {dragging && (
        <div className="library__dropzone" aria-hidden>
          <div className="library__dropzone-inner">
            <ImagePlus size={28} />
            <span>{t('dropToImport')}</span>
          </div>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'clear' ? t('clearAllTitle') : t('deleteTitle')}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
            <button type="button" className="btn btn--primary library__danger-btn" onClick={() => void handleConfirm()}>
              {confirm?.kind === 'clear' ? t('clearAll') : t('delete')}
            </button>
          </>
        }
      >
        <p>{confirm?.kind === 'clear' ? t('clearAllBody') : t('deleteBody')}</p>
      </Dialog>

      <Toaster />
    </div>
  );
}

export default App;
