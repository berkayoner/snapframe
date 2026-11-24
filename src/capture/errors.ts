import { t } from '@/src/shared/i18n';

/**
 * A capture failure whose message is already safe and friendly to show to
 * the user (localized, no raw error codes).
 */
export class CaptureError extends Error {}

/** `cause` keeps the underlying platform error for the console/devtools, never for the UI. */
export const captureErrors = {
  unsupportedPage: (cause?: unknown) => new CaptureError(t('errorUnsupportedPage'), { cause }),
  noActiveTab: () => new CaptureError(t('errorNoActiveTab')),
  captureFailed: (cause?: unknown) => new CaptureError(t('errorCaptureFailed'), { cause }),
  areaTooSmall: () => new CaptureError(t('errorAreaTooSmall')),
  busy: () => new CaptureError(t('errorCaptureBusy')),
};

export function toUserMessage(error: unknown): string {
  return error instanceof CaptureError ? error.message : t('errorCaptureFailed');
}
