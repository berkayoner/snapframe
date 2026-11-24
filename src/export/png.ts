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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** e.g. "snapframe-example-com-2026-09-04-143205.png" (local time, so names sort chronologically). */
export function buildExportFileName(sourceUrl: string | undefined, createdAt: number, extension = 'png'): string {
  const date = new Date(createdAt);
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  let hostPart = 'screenshot';
  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
      if (hostname) hostPart = hostname.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || hostPart;
    } catch {
      // Keep the fallback if the stored URL isn't parseable.
    }
  }
  return `snapframe-${hostPart}-${stamp}.${extension}`;
}
