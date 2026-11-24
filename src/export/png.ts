import { buildFileName, DEFAULT_FILE_NAME_TEMPLATE } from '@/src/export/fileName';
import { cachedSettings } from '@/src/shared/settings';

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image.'));
      },
      type,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick - revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** e.g. "snapframe-example-com-2026-09-04-143205.png" - the default template (see src/export/fileName.ts). */
export function buildExportFileName(sourceUrl: string | undefined, createdAt: number, extension = 'png'): string {
  return buildFileName(DEFAULT_FILE_NAME_TEMPLATE, { sourceUrl, createdAt }, extension);
}

/** The export file name for a capture, following the user's file name template. */
export function exportFileNameFor(
  record: { sourceUrl?: string; sourceTitle?: string; createdAt: number },
  extension: string,
): string {
  return buildFileName(cachedSettings().fileNameTemplate, record, extension);
}
