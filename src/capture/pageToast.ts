/**
 * Functions injected into the captured tab after a quick action (copy or
 * download without opening the editor). Both are serialized by
 * chrome.scripting.executeScript, so they must stay self-contained: no
 * imports, no outer variables.
 */

export interface CaptureToastOptions {
  captureId: string;
  /** Small PNG preview, base64 (drawn to a canvas, so a page's image CSP can't block it). */
  thumbnail: string | null;
  title: string;
  detail: string;
  editLabel: string;
  closeLabel: string;
}

/**
 * Writes a PNG (base64) to the clipboard from the page. The async clipboard
 * needs a focused document: after a popup capture the popup still has focus
 * for a moment, so this waits briefly for the page to get it back.
 */
export async function copyImageInPage(base64: string): Promise<boolean> {
  try {
    if (!document.hasFocus()) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        window.addEventListener(
          'focus',
          () => {
            clearTimeout(timer);
            setTimeout(resolve, 50);
          },
          { once: true },
        );
      });
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * A small card in the page's bottom-right corner after a quick action: the
 * capture's thumbnail, what happened, and an "Edit" button that opens it in
 * the editor. Lives in a closed shadow root; dismisses itself after a few
 * seconds (paused while hovered).
 */
export function showCaptureToastInPage(options: CaptureToastOptions): void {
  const ID = 'snapframe-capture-toast';
  document.getElementById(ID)?.remove();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .card { display:flex; align-items:center; gap:12px; width:372px; max-width:calc(100vw - 40px); box-sizing:border-box;
      padding:10px 10px 10px 10px; border-radius:14px; font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;
      background:${dark ? '#1d1b29' : '#ffffff'}; color:${dark ? '#f2f0fa' : '#17162b'};
      border:1px solid ${dark ? 'rgba(255,255,255,.1)' : 'rgba(23,22,43,.1)'};
      box-shadow:0 18px 40px rgba(23,16,70,.28),0 2px 6px rgba(23,16,70,.12); }
    canvas { flex-shrink:0; width:72px; height:46px; border-radius:7px; object-fit:cover;
      background:${dark ? '#2a2738' : '#f1effa'}; box-shadow:0 0 0 1px ${dark ? 'rgba(255,255,255,.12)' : 'rgba(23,22,43,.1)'}; }
    .text { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .title { font-weight:650; display:flex; align-items:center; gap:6px; white-space:nowrap; }
    .title::before { content:""; width:8px; height:8px; border-radius:50%; background:#12a150; flex-shrink:0; }
    .detail { color:${dark ? '#a9a5bd' : '#6b6880'}; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    button { all:unset; cursor:pointer; border-radius:8px; font-weight:600; font-size:12.5px; }
    .edit { flex-shrink:0; padding:7px 11px; color:#fff; background:linear-gradient(135deg,#7a5bff,#5b34ee); }
    .edit:hover { filter:brightness(1.08); }
    .close { width:26px; height:26px; display:grid; place-items:center; color:${dark ? '#a9a5bd' : '#6b6880'}; font-size:17px; }
    .close:hover { background:${dark ? 'rgba(255,255,255,.08)' : 'rgba(23,22,43,.06)'}; }
    button:focus-visible { outline:2px solid #7a5bff; outline-offset:2px; }
  `;
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'status');

  const thumb = document.createElement('canvas');
  thumb.width = 144;
  thumb.height = 92;
  if (options.thumbnail) {
    const binary = atob(options.thumbnail);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      .then((bitmap) => {
        const ctx = thumb.getContext('2d');
        if (!ctx) return;
        // Cover-fit, anchored to the top (the start of the page).
        const scale = Math.max(thumb.width / bitmap.width, thumb.height / bitmap.height);
        ctx.drawImage(bitmap, (thumb.width - bitmap.width * scale) / 2, 0, bitmap.width * scale, bitmap.height * scale);
        bitmap.close();
      })
      .catch(() => undefined);
  }

  const text = document.createElement('div');
  text.className = 'text';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = options.title;
  const detail = document.createElement('span');
  detail.className = 'detail';
  detail.textContent = options.detail;
  text.append(title, detail);

  const edit = document.createElement('button');
  edit.className = 'edit';
  edit.type = 'button';
  edit.textContent = options.editLabel;
  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', options.closeLabel);

  card.append(thumb, text, edit, close);
  root.append(style, card);
  document.documentElement.append(host);

  let timer = 0;
  const dismiss = () => {
    window.clearTimeout(timer);
    if (reduce) {
      host.remove();
      return;
    }
    card
      .animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(8px) scale(.98)' },
        ],
        {
          duration: 180,
          easing: 'ease-in',
          fill: 'forwards',
        },
      )
      .finished.then(() => host.remove())
      .catch(() => host.remove());
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(dismiss, 6000);
  };
  card.addEventListener('mouseenter', () => window.clearTimeout(timer));
  card.addEventListener('mouseleave', schedule);
  close.addEventListener('click', dismiss);
  edit.addEventListener('click', () => {
    // Injected code can't import `browser`; the isolated world has the extension's `chrome` global.
    const runtime = (
      globalThis as unknown as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } } }
    ).chrome.runtime;
    runtime.sendMessage({ type: 'open-editor', captureId: options.captureId }).catch(() => undefined);
    dismiss();
  });

  if (!reduce) {
    card.animate(
      [
        { opacity: 0, transform: 'translateY(14px) scale(.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
    );
  }
  schedule();
}
