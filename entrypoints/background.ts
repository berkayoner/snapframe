import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { captureVisibleArea } from '@/src/capture/visible';
import { captureArea } from '@/src/capture/area';
import { captureFullPage } from '@/src/capture/full-page/orchestrator';
import { assertCapturable, getActiveCapturableTab, type CapturableTab } from '@/src/capture/capturable';
import { captureErrors, toUserMessage } from '@/src/capture/errors';
import { isMessage, type CaptureResponse, type RuntimeMessage, type SelectionMode } from '@/src/shared/messages';
import { playShutter } from '@/src/capture/shutter';
import { takeSnapshot } from '@/src/capture/snapshot/take';
import { t } from '@/src/shared/i18n';
import type { CapturePayload } from '@/src/shared/types';

const MENU = {
  parent: 'snapframe-parent',
  visible: 'snapframe-capture-visible',
  area: 'snapframe-select-area',
  element: 'snapframe-select-element',
  fullPage: 'snapframe-capture-full-page',
  library: 'snapframe-open-library',
  actionLibrary: 'snapframe-action-library',
} as const;

const COMMAND = {
  visible: 'capture-visible-area',
  area: 'select-area',
  element: 'select-element',
  fullPage: 'capture-full-page',
} as const;

type MenuContexts = NonNullable<Browser.contextMenus.CreateProperties['contexts']>;

const BADGE_ACCENT = '#6640f5';
const BADGE_ERROR = '#d93d42';

let captureInFlight = false;
let badgeResetTimer: ReturnType<typeof setTimeout> | undefined;

/** Only one capture at a time: two concurrent full-page captures would fight over the same tab's scroll position. */
async function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (captureInFlight) throw captureErrors.busy();
  captureInFlight = true;
  try {
    return await task();
  } finally {
    captureInFlight = false;
  }
}

async function setBadge(text: string, color = BADGE_ACCENT, title?: string): Promise<void> {
  clearTimeout(badgeResetTimer);
  await Promise.all([
    browser.action.setBadgeText({ text }),
    browser.action.setBadgeBackgroundColor({ color }),
    browser.action.setTitle({ title: title ?? t('extName') }),
  ]).catch(() => undefined);
}

function clearBadge(delayMs = 0): void {
  clearTimeout(badgeResetTimer);
  badgeResetTimer = setTimeout(() => void setBadge(''), delayMs);
}

/**
 * Keyboard shortcuts and context-menu captures have no popup to show an
 * error in, so failures surface on the toolbar icon: a red "!" badge with
 * the message as its tooltip.
 */
function reportBackgroundError(error: unknown): void {
  const message = toUserMessage(error);
  console.warn('[SnapFrame]', error);
  void setBadge('!', BADGE_ERROR, `${t('extName')} — ${message}`);
  clearBadge(6000);
}

/** Broadcast to any open extension page (the popup shows a progress bar). Nobody listening is fine. */
function broadcast(message: RuntimeMessage): void {
  browser.runtime.sendMessage(message).catch(() => undefined);
}

function reportProgress(done: number, total: number): void {
  broadcast({ type: 'capture-progress', done, total });
  void setBadge(total > 0 ? `${Math.round((done / total) * 100)}%` : '…');
}

/** Opens the editor right next to the tab that was captured. */
async function openEditor(payload: CapturePayload, sourceTab?: CapturableTab): Promise<void> {
  await browser.tabs.create({
    url: browser.runtime.getURL(`/editor.html?captureId=${encodeURIComponent(payload.captureId)}`),
    index: sourceTab ? sourceTab.index + 1 : undefined,
    openerTabId: sourceTab?.id,
  });
}

async function openLibrary(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
}

/**
 * The page's own viewport metrics. `innerWidth` spans exactly what
 * captureVisibleTab captures (scrollbar included), which makes it the
 * reliable reference for the capture's pixel ratio - `tab.width` is not
 * (some browsers report it without the scrollbar). Null if the page can't
 * be scripted.
 */
async function readViewport(
  tabId: number,
): Promise<{ devicePixelRatio: number; innerWidth: number; innerHeight: number } | null> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        devicePixelRatio: window.devicePixelRatio || 1,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      }),
    });
    const value = result?.result;
    return value && typeof value.innerWidth === 'number' ? value : null;
  } catch {
    return null;
  }
}

async function runVisibleCapture(devicePixelRatio?: number): Promise<CapturePayload> {
  return exclusive(async () => {
    const tab = await getActiveCapturableTab();
    const viewport = await readViewport(tab.id);
    const region = viewport ? { x: 0, y: 0, width: viewport.innerWidth, height: viewport.innerHeight } : null;
    const payload = await captureVisibleArea(
      tab,
      {
        viewportWidth: viewport?.innerWidth,
        devicePixelRatio: viewport?.devicePixelRatio ?? devicePixelRatio ?? 1,
      },
      region ? () => takeSnapshot(tab.id, region, { documentCoords: false }) : undefined,
    );
    await playShutter(tab.id, region);
    await openEditor(payload, tab);
    return payload;
  });
}

async function runFullPageCapture(): Promise<CapturePayload> {
  return exclusive(async () => {
    const tab = await getActiveCapturableTab();
    try {
      const payload = await captureFullPage(tab, reportProgress);
      await playShutter(tab.id, null);
      await openEditor(payload, tab);
      return payload;
    } finally {
      clearBadge();
    }
  });
}

async function startAreaSelection(mode: SelectionMode = 'area'): Promise<void> {
  if (captureInFlight) throw captureErrors.busy();
  const tab = await getActiveCapturableTab();
  try {
    // The overlay reads its mode from the (extension-only) isolated world it's injected into.
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selected: SelectionMode) => {
        (globalThis as { __snapframeOverlayMode?: SelectionMode }).__snapframeOverlayMode = selected;
      },
      args: [mode],
    });
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/capture-overlay.js'] });
  } catch (error) {
    throw captureErrors.unsupportedPage(error);
  }
}

async function runAreaCapture(
  message: Extract<RuntimeMessage, { type: 'area-selected' }>,
  tab: Browser.tabs.Tab | undefined,
) {
  return exclusive(async () => {
    assertCapturable(tab);
    const payload = await captureArea(tab, message.rect, message.devicePixelRatio, message.viewportWidth, {
      type: message.mode === 'element' ? 'element' : 'area',
      getSnapshot: () => takeSnapshot(tab.id, message.rect, { documentCoords: false }),
    });
    await playShutter(tab.id, message.rect);
    await openEditor(payload, tab);
    return payload;
  });
}

/** Turns a capture promise into the response shape every sender expects. */
function respond(promise: Promise<CapturePayload | void>, sendResponse: (response: CaptureResponse) => void): true {
  promise
    .then((payload) => sendResponse({ ok: true, captureId: payload ? payload.captureId : undefined }))
    .catch((error: unknown) => {
      console.warn('[SnapFrame]', error);
      sendResponse({ ok: false, error: toUserMessage(error) });
    });
  return true;
}

function createContextMenus(): void {
  browser.contextMenus.removeAll(() => {
    const contexts: MenuContexts = ['page', 'frame', 'selection', 'link', 'image'];
    browser.contextMenus.create({ id: MENU.parent, title: t('extName'), contexts });
    browser.contextMenus.create({ id: MENU.visible, parentId: MENU.parent, title: t('captureVisible'), contexts });
    browser.contextMenus.create({ id: MENU.area, parentId: MENU.parent, title: t('captureArea'), contexts });
    browser.contextMenus.create({ id: MENU.element, parentId: MENU.parent, title: t('captureElement'), contexts });
    browser.contextMenus.create({ id: MENU.fullPage, parentId: MENU.parent, title: t('captureFullPage'), contexts });
    browser.contextMenus.create({ id: 'snapframe-separator', parentId: MENU.parent, type: 'separator', contexts });
    browser.contextMenus.create({ id: MENU.library, parentId: MENU.parent, title: t('openLibrary'), contexts });
    browser.contextMenus.create({ id: MENU.actionLibrary, title: t('openLibrary'), contexts: ['action'] });
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    createContextMenus();
    // First install only (not updates or reloads): show the welcome / onboarding page.
    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    }
  });

  browser.contextMenus.onClicked.addListener((info) => {
    switch (info.menuItemId) {
      case MENU.visible:
        runVisibleCapture().catch(reportBackgroundError);
        break;
      case MENU.area:
        startAreaSelection('area').catch(reportBackgroundError);
        break;
      case MENU.element:
        startAreaSelection('element').catch(reportBackgroundError);
        break;
      case MENU.fullPage:
        runFullPageCapture().catch(reportBackgroundError);
        break;
      case MENU.library:
      case MENU.actionLibrary:
        void openLibrary();
        break;
    }
  });

  // Keyboard commands grant activeTab just like a toolbar click, so no popup is needed.
  browser.commands.onCommand.addListener((command) => {
    if (command === COMMAND.visible) runVisibleCapture().catch(reportBackgroundError);
    else if (command === COMMAND.area) startAreaSelection('area').catch(reportBackgroundError);
    else if (command === COMMAND.element) startAreaSelection('element').catch(reportBackgroundError);
    else if (command === COMMAND.fullPage) runFullPageCapture().catch(reportBackgroundError);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isMessage(message, 'capture-visible-area')) {
      return respond(runVisibleCapture(message.devicePixelRatio), sendResponse);
    }
    if (isMessage(message, 'start-area-selection')) {
      return respond(startAreaSelection(message.mode ?? 'area'), sendResponse);
    }
    if (isMessage(message, 'area-selected')) {
      return respond(runAreaCapture(message, sender.tab), sendResponse);
    }
    if (isMessage(message, 'start-full-page-capture')) {
      return respond(runFullPageCapture(), sendResponse);
    }
    return undefined;
  });

  // End-to-end test hook: only the `e2e` build mode exposes it (see tests/e2e/run.mjs).
  if (import.meta.env.MODE === 'e2e') {
    // Surface the underlying platform error in test failures.
    const withCause =
      <Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) =>
      (...args: Args) =>
        fn(...args).catch((error: unknown) => {
          const cause = error instanceof Error && error.cause ? ` (cause: ${String(error.cause)})` : '';
          throw new Error(`${String(error)}${cause}`);
        });
    Object.assign(globalThis, {
      __snapframeTest: {
        runVisibleCapture: withCause(runVisibleCapture),
        runFullPageCapture: withCause(runFullPageCapture),
        startAreaSelection: withCause(startAreaSelection),
        openLibrary,
      },
    });
  }
});
