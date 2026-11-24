import { browser } from 'wxt/browser';
import { db, type CaptureRecord } from '@/src/storage/db';
import { buildFileName } from '@/src/export/fileName';
import { copyImageInPage, showCaptureToastInPage, type CaptureToastOptions } from '@/src/capture/pageToast';
import { isMessage, type RuntimeMessage } from '@/src/shared/messages';
import type { Settings } from '@/src/shared/settings';
import { t } from '@/src/shared/i18n';

/**
 * Quick actions run in the service worker right after a capture, instead
 * of opening the editor: copy to the clipboard (written from the captured
 * page, the only focused document around) or download (through
 * chrome.downloads, an optional permission the user grants on the options
 * page). Either way a small card in the page confirms it and offers "Edit".
 * Any failure falls back to the editor, so a capture is never lost.
 */

const OFFSCREEN_URL = '/offscreen.html';
const DOWNLOAD_TIMEOUT_MS = 60_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/** The capture as PNG (what the async clipboard accepts). */
async function pngOf(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

/** A small preview of the capture's top part, base64 PNG. */
async function thumbnailOf(blob: Blob): Promise<string | null> {
  try {
    const source = await createImageBitmap(blob);
    const width = 144;
    const height = 92;
    // Crop tall captures to their top (16:10-ish) before scaling.
    const cropHeight = Math.min(source.height, Math.round((source.width * height) / width));
    const scale = Math.max(width / source.width, height / cropHeight);
    const canvas = new OffscreenCanvas(Math.round(source.width * scale), Math.round(cropHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, source.width, cropHeight, 0, 0, canvas.width, canvas.height);
    source.close();
    return blobToBase64(await canvas.convertToBlob({ type: 'image/png' }));
  } catch {
    return null;
  }
}

async function showToast(tabId: number, record: CaptureRecord, title: string): Promise<void> {
  const options: CaptureToastOptions = {
    captureId: record.captureId,
    thumbnail: await thumbnailOf(record.blob),
    title,
    detail: record.sourceTitle?.trim() || t('untitledCapture'),
    editLabel: t('quickEdit'),
    closeLabel: t('close'),
  };
  await browser.scripting
    .executeScript({ target: { tabId }, func: showCaptureToastInPage, args: [options] })
    .catch(() => undefined);
}

export async function copyCaptureFromPage(tabId: number, record: CaptureRecord): Promise<boolean> {
  try {
    const base64 = await blobToBase64(await pngOf(record.blob));
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: copyImageInPage,
      args: [base64],
    });
    if (result?.result !== true) return false;
    await showToast(tabId, record, t('quickCopied'));
    return true;
  } catch (error) {
    console.warn('[SnapFrame] quick copy failed', error);
    return false;
  }
}

export function hasDownloadPermission(): Promise<boolean> {
  return browser.permissions.contains({ permissions: ['downloads'] }).catch(() => false);
}

/** chrome.downloads needs a URL; a service worker can't make blob URLs, so an offscreen document does. */
async function blobUrlFor(captureId: string): Promise<string> {
  const url = browser.runtime.getURL(OFFSCREEN_URL);
  const existing = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length === 0) {
    await browser.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [browser.offscreen.Reason.BLOBS],
      justification: 'Creates a download link for a screenshot saved on this device.',
    });
  }
  const message: RuntimeMessage = { type: 'offscreen-blob-url', captureId };
  const response = (await browser.runtime.sendMessage(message)) as { url?: string } | undefined;
  if (!response?.url) throw new Error('No download URL.');
  return response.url;
}

function waitForDownload(downloadId: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), DOWNLOAD_TIMEOUT_MS);
    const listener = (delta: { id: number; state?: { current?: string } }) => {
      if (delta.id !== downloadId || !delta.state?.current) return;
      if (delta.state.current === 'complete') finish(true);
      else if (delta.state.current === 'interrupted') finish(false);
    };
    function finish(ok: boolean) {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      resolve(ok);
    }
    browser.downloads.onChanged.addListener(listener);
  });
}

/** Quick downloads run one at a time: they share the single offscreen document, which each one closes. */
let downloadQueue: Promise<unknown> = Promise.resolve();

export function downloadCapture(tabId: number, record: CaptureRecord, settings: Settings): Promise<boolean> {
  const run = downloadQueue.then(() => downloadNow(tabId, record, settings));
  downloadQueue = run.catch(() => undefined);
  return run;
}

async function downloadNow(tabId: number, record: CaptureRecord, settings: Settings): Promise<boolean> {
  if (!(await hasDownloadPermission())) return false;
  try {
    const url = await blobUrlFor(record.captureId);
    const extension = record.blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const downloadId = await browser.downloads.download({
      url,
      filename: buildFileName(settings.fileNameTemplate, record, extension),
      conflictAction: 'uniquify',
    });
    const ok = await waitForDownload(downloadId);
    await browser.offscreen.closeDocument().catch(() => undefined);
    if (!ok) return false;
    await showToast(tabId, record, t('quickDownloaded'));
    return true;
  } catch (error) {
    console.warn('[SnapFrame] quick download failed', error);
    await browser.offscreen.closeDocument().catch(() => undefined);
    return false;
  }
}

/** Offscreen document side: answers blob-URL requests for stored captures. */
export function serveCaptureBlobUrls(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isMessage(message, 'offscreen-blob-url')) return undefined;
    db.captures
      .get(message.captureId)
      .then((record) => sendResponse({ url: record ? URL.createObjectURL(record.blob) : undefined }))
      .catch(() => sendResponse({}));
    return true;
  });
}

export function getCaptureRecord(captureId: string): Promise<CaptureRecord | undefined> {
  return db.captures.get(captureId);
}
