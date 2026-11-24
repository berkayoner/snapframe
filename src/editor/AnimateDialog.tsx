import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Clapperboard, LoaderCircle, Sparkles } from 'lucide-react';
import { Dialog } from '@/src/shared/Dialog';
import { Field, Segmented } from '@/src/editor/inspector/controls';
import {
  createAnimationScene,
  fitOutputSize,
  type AnimationMode,
  type AnimationScene,
} from '@/src/export/animate/scene';
import {
  EncodeCancelledError,
  encodeAnimation,
  supportedFormats,
  GIF_MAX_SIDE,
  VIDEO_MAX_SIDE,
  type AnimationFormat,
} from '@/src/export/animate/encode';
import { canScroll, type AnimationSpeed } from '@/src/export/animate/timeline';
import { downloadBlob, exportFileNameFor } from '@/src/export/png';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { finishEntranceAnimations } from '@/src/editor/Canvas';
import { t } from '@/src/shared/i18n';
import { loadPrefs, savePrefs, type AnimationPrefs } from '@/src/shared/prefs';
import { toast } from '@/src/shared/toast';
import type { CaptureRecord } from '@/src/storage/db';

interface AnimateDialogProps {
  open: boolean;
  onClose: () => void;
  stageRef: RefObject<Konva.Stage | null>;
  record: CaptureRecord;
}

const PREVIEW_MAX = { width: 880, height: 460 };

function SwitchRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__title">{title}</span>
        <span className="switch-row__hint">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

/**
 * Animated export, all on-device, as MP4, WebM or GIF. Notes mode: the
 * annotations appear one by one, optionally with a camera that glides to
 * each and a pointer that clicks them into place. Scroll mode (tall
 * captures): the page scrolls by inside its frame. The preview plays the
 * exact frames the encoder will render.
 */
export function AnimateDialog({ open, onClose, stageRef, record }: AnimateDialogProps) {
  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const unit = useEditorStore((state) => state.unit);
  const scrollable = canScroll(canvasWidth, canvasHeight, unit, record.viewport);
  const [saved] = useState(() => loadPrefs().animation);
  const [scene, setScene] = useState<AnimationScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [formats, setFormats] = useState<Record<AnimationFormat, boolean> | null>(null);
  const [preferredMode, setMode] = useState<AnimationMode>(record.sourceType === 'full-page' ? 'scroll' : 'notes');
  const [format, setFormat] = useState<AnimationFormat>(saved.format);
  const [speed, setSpeed] = useState<AnimationSpeed>(saved.speed);
  const [focus, setFocus] = useState(saved.focus);
  const [cursor, setCursor] = useState(saved.cursor);
  const [progress, setProgress] = useState<number | null>(null);
  const mode: AnimationMode = scrollable ? preferredMode : 'notes';
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
    // Commit any in-progress text edit so the label is part of the animation, and settle
    // entrance animations so no annotation is cloned half-faded.
    if (useEditorStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur();
    finishEntranceAnimations();

    setTimeout(async () => {
      try {
        built = await createAnimationScene(stage, { mode, speed, focus, cursor, viewport: record.viewport });
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
    // The scene is rebuilt per opening and per mode; speed/focus/cursor are applied to it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, stageRef]);

  useEffect(() => {
    if (!scene) return;
    scene.setOptions({ speed, focus, cursor });
    clockRef.current = performance.now();
  }, [scene, speed, focus, cursor]);

  function remember(partial: Partial<AnimationPrefs>) {
    savePrefs({ animation: { format, speed, focus, cursor, ...partial } });
  }

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
      downloadBlob(blob, exportFileNameFor(record, format));
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
  const empty = scene?.mode === 'notes' && scene.itemCount === 0;

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
          {scrollable && (
            <Field label={t('animateMode')}>
              <Segmented<AnimationMode>
                label={t('animateMode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'notes', label: t('animateModeNotes'), disabled: encoding },
                  { value: 'scroll', label: t('animateModeScroll'), disabled: encoding },
                ]}
              />
            </Field>
          )}
          <Field label={t('exportFormat')}>
            <Segmented<AnimationFormat>
              label={t('exportFormat')}
              value={format}
              onChange={(next) => {
                setFormat(next);
                remember({ format: next });
              }}
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
              onChange={(next) => {
                setSpeed(next);
                remember({ speed: next });
              }}
              options={[
                { value: 'slow', label: t('speedSlow') },
                { value: 'normal', label: t('speedNormal') },
                { value: 'fast', label: t('speedFast') },
              ]}
            />
          </Field>
          {mode === 'notes' ? (
            <>
              <SwitchRow
                title={t('animateCamera')}
                hint={t('animateCameraHint')}
                checked={focus}
                disabled={encoding}
                onChange={(next) => {
                  setFocus(next);
                  remember({ focus: next });
                }}
              />
              <SwitchRow
                title={t('animateCursor')}
                hint={t('animateCursorHint')}
                checked={cursor}
                disabled={encoding}
                onChange={(next) => {
                  setCursor(next);
                  remember({ cursor: next });
                }}
              />
            </>
          ) : (
            <p className="animate__hint">{t('animateScrollHint')}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
