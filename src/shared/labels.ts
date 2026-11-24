import type { MessageKey } from '@/src/shared/i18n';
import type { CaptureSourceType } from '@/src/shared/types';

export const SOURCE_TYPE_LABEL: Record<CaptureSourceType, MessageKey> = {
  visible: 'sourceVisible',
  area: 'sourceArea',
  'full-page': 'sourceFullPage',
  element: 'sourceArea',
  upload: 'sourceUpload',
};

export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
