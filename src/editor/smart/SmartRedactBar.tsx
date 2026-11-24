import { Eye, EyeOff, ShieldAlert, X } from 'lucide-react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { countByKind } from '@/src/editor/smart/pageData';
import { redactSensitive, uncoveredSensitive } from '@/src/editor/smart/redact';
import { useSmartUi } from '@/src/editor/smart/smartUi';
import { t, type MessageKey } from '@/src/shared/i18n';
import { toast } from '@/src/shared/toast';
import type { SensitiveKind } from '@/src/capture/snapshot/sensitive';

export const SENSITIVE_LABEL: Record<SensitiveKind, MessageKey> = {
  email: 'sensitiveEmail',
  phone: 'sensitivePhone',
  card: 'sensitiveCard',
  iban: 'sensitiveIban',
  nationalId: 'sensitiveNationalId',
  secret: 'sensitiveSecret',
};

/** "2 emails, 1 phone number" style summary. */
export function describeSensitive(regions: ReturnType<typeof uncoveredSensitive>): string {
  return countByKind(regions)
    .map(({ kind, count }) => `${count}× ${t(SENSITIVE_LABEL[kind])}`)
    .join(', ');
}

/** Redacts everything detected and confirms with a toast. Shared by the bar and the inspector. */
export function runRedaction(): void {
  const count = redactSensitive();
  useSmartUi.getState().setRevealSensitive(false);
  if (count > 0) toast.success(t('redactDone', count));
}

/**
 * Smart suggestion shown over the canvas when the capture contains
 * personal data that isn't redacted yet: review it, or pixelate it all in
 * one click. Re-evaluated on every edit, so it disappears once covered.
 */
export function SmartRedactBar() {
  // Subscribe to what the suggestion depends on.
  useEditorStore((state) => state.objects);
  useEditorStore((state) => state.canvasWidth);
  const pageData = useEditorStore((state) => state.pageData);
  const activeTool = useEditorStore((state) => state.activeTool);
  const reveal = useSmartUi((state) => state.revealSensitive);
  const dismissed = useSmartUi((state) => state.redactBarDismissed);
  const setReveal = useSmartUi((state) => state.setRevealSensitive);
  const dismiss = useSmartUi((state) => state.dismissRedactBar);

  if (!pageData || dismissed || activeTool === 'crop') return null;
  const regions = uncoveredSensitive();
  if (regions.length === 0) return null;

  return (
    <div className="smart-bar" role="status">
      <span className="smart-bar__icon">
        <ShieldAlert size={16} />
      </span>
      <span className="smart-bar__text">
        <strong>{t('redactFound', regions.length)}</strong>
        <span className="smart-bar__detail">{describeSensitive(regions)}</span>
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-pressed={reveal}
        aria-label={reveal ? t('redactHide') : t('redactShow')}
        data-tooltip={reveal ? t('redactHide') : t('redactShow')}
        onClick={() => setReveal(!reveal)}
      >
        {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button type="button" className="btn btn--sm btn--primary" onClick={runRedaction}>
        {t('redactAll')}
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={t('close')}
        data-tooltip={t('close')}
        onClick={dismiss}
      >
        <X size={15} />
      </button>
    </div>
  );
}
