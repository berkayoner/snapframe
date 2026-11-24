import { useEffect, useRef, useState, type ReactNode } from 'react';
import type Konva from 'konva';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { CapturesIllustration } from '@/src/shared/Illustration';
import { db, type CaptureRecord } from '@/src/storage/db';
import { useHtmlImage } from '@/src/editor/useHtmlImage';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { useEditorShortcuts } from '@/src/editor/keyboard';
import { CanvasViewport } from '@/src/editor/CanvasViewport';
import { Toolbar } from '@/src/editor/Toolbar';
import { Inspector } from '@/src/editor/inspector/Inspector';
import { EditorHeader } from '@/src/editor/EditorHeader';
import { PreviewDialog } from '@/src/editor/PreviewDialog';
import { ShortcutsDialog } from '@/src/editor/ShortcutsDialog';
import { AnimateDialog } from '@/src/editor/AnimateDialog';
import { copyImage, downloadImage } from '@/src/editor/exportActions';
import { loadProject } from '@/src/storage/projects';
import { useAutosave } from '@/src/storage/autosave';
import { loadPrefs } from '@/src/shared/prefs';
import { NO_BACKGROUND } from '@/src/editor/beautify/presets';
import { toPageData } from '@/src/editor/smart/pageData';
import { useSmartUi } from '@/src/editor/smart/smartUi';
import { Toaster } from '@/src/shared/toast';
import { t } from '@/src/shared/i18n';
import './App.css';

type LoadState = 'loading' | 'not-found' | 'error' | 'ready';

function getCaptureIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('captureId');
}

function StateScreen({
  icon,
  illustration,
  title,
  body,
}: {
  icon?: ReactNode;
  illustration?: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <main className="state-screen">
      {illustration ?? <div className="state-screen__icon">{icon}</div>}
      <h1 className="state-screen__title">{title}</h1>
      {body && <p>{body}</p>}
    </main>
  );
}

function App() {
  const [captureId] = useState(getCaptureIdFromLocation);
  const [state, setState] = useState<LoadState>(captureId ? 'loading' : 'not-found');
  const [record, setRecord] = useState<CaptureRecord | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);

  const image = useHtmlImage(record?.blob);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);

  useAutosave(record?.captureId ?? null, sceneReady);
  useEditorShortcuts({
    onDownload: () => record && void downloadImage(stageRef.current, record),
    onCopyImage: () => void copyImage(stageRef.current),
    onToggleShortcuts: () => setShortcutsOpen((open) => !open),
  });

  // Load the capture, then restore its autosaved session (or seed a fresh scene).
  useEffect(() => {
    if (!captureId) return;
    let cancelled = false;

    async function load(id: string) {
      const found = await db.captures.get(id);
      if (cancelled) return;
      if (!found) {
        setState('not-found');
        return;
      }
      const saved = await loadProject(found.captureId);
      if (cancelled) return;

      const store = useEditorStore.getState();
      useSmartUi.getState().reset();
      const unit = found.devicePixelRatio > 0 ? found.devicePixelRatio : 1;
      if (saved) {
        store.initObjects(saved.objects, { width: saved.canvasWidth, height: saved.canvasHeight }, unit);
        store.setBeautify(saved.beautify, { remember: false });
        store.setMockupId(saved.mockupId);
      } else {
        store.initObjects(
          [{ id: crypto.randomUUID(), type: 'image', x: 0, y: 0, width: found.width, height: found.height }],
          { width: found.width, height: found.height },
          unit,
        );
        // New captures start plain - no background, frame or mockup until the user picks one.
        // The last-used padding/radius/shadow are kept, ready for when a background is chosen.
        store.setBeautify({ ...loadPrefs().beautify, background: NO_BACKGROUND }, { remember: false });
        store.setMockupId(null);
      }
      store.setPageData(toPageData(found.snapshot, unit));
      setRecord(found);
      setState('ready');
      setSceneReady(true);
    }

    load(captureId).catch((error: unknown) => {
      console.error('[SnapFrame] failed to load capture', error);
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [captureId]);

  useEffect(() => {
    const title = record?.sourceTitle?.trim();
    document.title = title ? `${title} · SnapFrame` : t('editorTitle');
  }, [record]);

  if (state === 'loading') {
    return <StateScreen icon={<LoaderCircle size={22} className="spinner" />} title={t('loadingCapture')} />;
  }
  if (state === 'not-found') {
    return (
      <StateScreen
        illustration={<CapturesIllustration width={180} />}
        title={t('captureNotFound')}
        body={t('captureNotFoundHint')}
      />
    );
  }
  if (state === 'error' || !record) {
    return <StateScreen icon={<TriangleAlert size={22} />} title={t('captureLoadError')} />;
  }

  return (
    <div className="editor">
      <EditorHeader
        record={record}
        stageRef={stageRef}
        onPreview={() => setPreviewOpen(true)}
        onAnimate={() => setAnimateOpen(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      {record.warnings?.includes('truncated-max-height') && (
        <p className="editor__banner" role="status">
          <TriangleAlert size={15} />
          {t('warningTruncated')}
        </p>
      )}
      <div className="editor__body">
        <Toolbar />
        {image && canvasWidth > 0 ? (
          <CanvasViewport image={image} stageRef={stageRef} />
        ) : (
          <div className="editor__rendering">
            <LoaderCircle size={22} className="spinner" aria-label={t('loading')} />
          </div>
        )}
        <Inspector />
      </div>
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} stageRef={stageRef} record={record} />
      <AnimateDialog open={animateOpen} onClose={() => setAnimateOpen(false)} stageRef={stageRef} record={record} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Toaster />
    </div>
  );
}

export default App;
