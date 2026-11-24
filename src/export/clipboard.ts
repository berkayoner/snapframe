/**
 * Copy-to-clipboard only works reliably for PNG and only when called from
 * a focused, user-gesture-triggered handler in a normal document (the
 * editor tab) - not from an offscreen document or service worker.
 */
export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
