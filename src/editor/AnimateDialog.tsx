import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Clapperboard, LoaderCircle, Sparkles } from 'lucide-react';
import { Dialog } from '@/src/shared/Dialog';
import { Field, Segmented } from '@/src/editor/inspector/controls';
import { createAnimationScene, fitOutputSize, type AnimationScene } from '@/src/export/animate/scene';
import {
  EncodeCancelledError,
  encodeAnimation,
  supportedFormats,
  GIF_MAX_SIDE,
  VIDEO_MAX_SIDE,
  type AnimationFormat,
} from '@/src/export/animate/encode';
import type { AnimationSpeed } from '@/src/export/animate/timeline';
import { buildExportFileName, downloadBlob } from '@/src/export/png';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { t } from '@/src/shared/i18n';
import { toast } from '@/src/shared/toast';
import type { CaptureRecord } from '@/src/storage/db';

interface AnimateDialogProps {
  open: boolean;
  onClose: () => void;
  stageRef: RefObject<Konva.Stage | null>;
  record: CaptureRecord;
}

const PREVIEW_MAX = { width: 880, height: 460 };

/**
 * Animated export: annotations appear one by one (optionally with a camera
 * that glides to each), exported as MP4, WebM or GIF - all on-device. The
 * preview plays the exact frames the encoder will render.
 */
export function AnimateDialog({ open, onClose, stageRef, record }: AnimateDialogProps) {
  const [scene, setScene] = useState<AnimationScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [formats, setFormats] = useState<Record<AnimationFormat, boolean> | null>(null);
  const [format, setFormat] = useState<AnimationFormat>('mp4');
  const [speed, setSpeed] = useState<AnimationSpeed>('normal');
  const [focus, setFocus] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clockRef = useRef(0);

  // Build the scene when the dialog opens; tear it down when it closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let built: AnimationScene | null = null;
    const stage = stageRef.current;
    if (!stage) return;
    // Commit any in-progress text edit so the label is part of the animation.
    if (useEditorStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur();

    setTimeout(async () => {
      try {
        built = await createAnimationScene(stage, { speed, focus });
        if (cancelled) {
          built.dispose();
          return;
        }
        setScene(built);
        const available = await supportedFormats(built.width, built.height);
        if (cancelled) return;
        setFormats(available);
        setFormat((current) => (available[current] ? current : available.mp4 ? 'mp4' : 'webm'));
      } catch (error) {
        console.error('[SnapFrame] animation scene failed', error);
        if (!cancelled) setFailed(true);
      }
    }, 40);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      built?.dispose();
      setScene(null);
      setFormats(null);
      setFailed(false);
      setProgress(null);
    };
    // The scene is rebuilt only per opening; speed/focus are applied to it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stageRef]);

  useEffect(() => {
    if (!scene) return;
    scene.setOptions({ speed, focus });
    clockRef.current = performance.now();
  }, [scene, speed, focus]);

  // Live preview loop (paused while encoding - the encoder drives the same scene).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!scene || !canvas || progress !== null) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    clockRef.current = performance.now();
    const tick = (now: number) => {
      const duration = scene.timeline.duration;
      const time = ((now - clockRef.current) / 1000) % (duration + 0.6);
      scene.renderFrame(Math.min(time, duration), ctx, canvas.width, canvas.height);
      if (playheadRef.current) playheadRef.current.style.transform = `scaleX(${Math.min(1, time / duration)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, progress]);

  async function handleExport() {
    if (!scene) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    try {
      const blob = await encodeAnimation(scene, format, {
        signal: controller.signal,
        onProgress: (fraction) => setProgress(fraction),
      });
      downloadBlob(blob, buildExportFileName(record.sourceUrl, record.createdAt, format));
      toast.success(t('animateDone'));
    } catch (error) {
      if (!(error instanceof EncodeCancelledError)) {
        console.error('[SnapFrame] animation export failed', error);
        toast.error(t('animateFailed'));
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  const preview = scene
    ? fitOutputSize(scene.width, scene.height, Math.max(PREVIEW_MAX.width, PREVIEW_MAX.height))
    : { width: 0, height: 0 };
  const previewScale = scene ? Math.min(PREVIEW_MAX.width / preview.width, PREVIEW_MAX.height / preview.height, 1) : 1;
  const output = scene
    ? fitOutputSize(scene.width, scene.height, format === 'gif' ? GIF_MAX_SIDE : VIDEO_MAX_SIDE)
    : null;
  const encoding = progress !== null;
  const empty = scene?.itemCount === 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        abortRef.current?.abort();
        onClose();
      }}
      title={t('animateTitle')}
      size="lg"
      footer={
        <>
          {scene && output && (
            <span className="preview__size">
              {t('animateDuration', scene.timeline.duration.toFixed(1))} · {output.width} × {output.height}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {encoding ? (
            <>
              <span className="animate__progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
                <span style={{ transform: `scaleX(${progress ?? 0})` }} />
              </span>
              <span className="animate__percent">{Math.round((progress ?? 0) * 100)}%</span>
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                {t('cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!scene || empty || !formats}
              onClick={() => void handleExport()}
            >
              <Clapperboard size={15} />
              {t('animateExport', format.toUpperCase())}
            </button>
          )}
        </>
      }
    >
      <div className="animate">
        <div className="animate__stage">
          {scene ? (
            <>
              <canvas
                ref={canvasRef}
                width={preview.width}
                height={preview.height}
                style={{ width: preview.width * previewScale, height: preview.height * previewScale }}
                className="animate__canvas"
              />
              <span className="animate__playhead" aria-hidden>
                <span ref={playheadRef} />
              </span>
            </>
          ) : failed ? (
            <p className="animate__message">{t('animateFailed')}</p>
          ) : (
            <LoaderCircle size={22} className="spinner preview__spinner" aria-label={t('loading')} />
          )}
          {empty && (
            <p className="animate__empty">
              <Sparkles size={15} />
              {t('animateEmpty')}
            </p>
          )}
        </div>
        <div className="animate__controls">
          <Field label={t('exportFormat')}>
            <Segmented<AnimationFormat>
              label={t('exportFormat')}
              value={format}
              onChange={setFormat}
              options={[
                {
                  value: 'mp4',
                  label: 'MP4',
                  disabled: formats ? !formats.mp4 : false,
                  title: formats && !formats.mp4 ? t('animateMp4Unsupported') : undefined,
                },
                { value: 'webm', label: 'WebM', disabled: formats ? !formats.webm : false },
                { value: 'gif', label: 'GIF' },
              ]}
            />
          </Field>
          <Field label={t('animateSpeed')}>
            <Segmented<AnimationSpeed>
              label={t('animateSpeed')}
              value={speed}
              onChange={setSpeed}
              options={[
                { value: 'slow', label: t('speedSlow') },
                { value: 'normal', label: t('speedNormal') },
                { value: 'fast', label: t('speedFast') },
              ]}
            />
          </Field>
          <label className="switch-row">
            <span className="switch-row__text">
              <span className="switch-row__title">{t('animateCamera')}</span>
              <span className="switch-row__hint">{t('animateCameraHint')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={focus}
              disabled={encoding}
              onChange={(event) => setFocus(event.target.checked)}
            />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
