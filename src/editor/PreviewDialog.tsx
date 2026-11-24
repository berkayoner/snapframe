import { useEffect, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Copy, Download, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/src/shared/Dialog';
import { copyImage, downloadImage, renderPreview, useExportStore } from '@/src/editor/exportActions';
import { t } from '@/src/shared/i18n';
import type { CaptureRecord } from '@/src/storage/db';

interface PreviewDialogProps {
  open: boolean;
  onClose: () => void;
  stageRef: RefObject<Konva.Stage | null>;
  record: CaptureRecord;
}

/** Shows the exact export (same render pipeline as Download/Copy), including frame and mockup. */
export function PreviewDialog({ open, onClose, stageRef, record }: PreviewDialogProps) {
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null);
  const busy = useExportStore((state) => state.busy);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    void renderPreview(stageRef.current).then((result) => {
      if (!result) return;
      if (cancelled) {
        URL.revokeObjectURL(result.url);
        return;
      }
      url = result.url;
      setPreview(result);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setPreview(null);
    };
  }, [open, stageRef]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('previewTitle')}
      size="lg"
      footer={
        <>
          {preview && <span className="preview__size">{t('exportSize', [preview.width, preview.height])} · 1×</span>}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void copyImage(stageRef.current)}
          >
            <Copy size={15} />
            {t('copy')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy !== null}
            onClick={() => void downloadImage(stageRef.current, record)}
          >
            <Download size={15} />
            {t('download')}
          </button>
        </>
      }
    >
      <div className="preview">
        {preview ? (
          <img className="preview__image" src={preview.url} alt={t('previewTitle')} />
        ) : (
          <LoaderCircle size={22} className="spinner preview__spinner" aria-label={t('loading')} />
        )}
      </div>
    </Dialog>
  );
}
