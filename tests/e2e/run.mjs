// End-to-end test: loads the e2e build into a real Chromium and drives every
// capture mode plus the editor, verifying actual pixels.
//
//   npm run build:e2e && npm run test:e2e
//
// The e2e build adds <all_urls> host access and exposes small test hooks
// (globalThis.__snapframeTest in the worker, window.__snapframeEditor in the
// editor) - neither exists in production builds.
/* global chrome -- used inside page/worker callbacks, which run in the extension */
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionPath = path.join(root, '.output', 'chrome-mv3-e2e');
const artifacts = path.join(root, 'tests', 'e2e', '.artifacts');
const headed = process.argv.includes('--headed');
const lang = process.argv.find((arg) => arg.startsWith('--lang='))?.slice(7) ?? 'en';
// Branded Chrome ignores --load-extension since v137; use Playwright's Chromium (default) or Edge (--channel=msedge).
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.slice(10) ?? 'chromium';

const PAGE_HEIGHT = 4600;
const BANDS = ['#ffe4e1', '#e0f7fa', '#f1f8e9', '#fff8e1'];

const pages = {
  '/sensitive': `<!doctype html><html><head><title>Sensitive test page</title></head>
    <body style="margin:0;background:#fff;font:18px system-ui;color:#111">
      <div style="padding:40px;line-height:2">
        <p>Contact: ada.moreau@example.com</p>
        <p>Phone: +90 532 123 45 67</p>
        <p>Card: 4242 4242 4242 4242</p>
        <p>Date: 2026-11-20 · Total $48,290 · Order 123456</p>
      </div>
    </body></html>`,
  '/plain': `<!doctype html><html><head><title>Plain test page</title><style>
      html,body{margin:0;background:#fff}
      #box{position:absolute;left:100px;top:100px;width:200px;height:200px;background:#000}
    </style></head><body><div id="box"></div></body></html>`,
  '/long': `<!doctype html><html><head><title>Long test page</title><style>
      html{scroll-behavior:smooth}
      html,body{margin:0;background:#fff;font:16px system-ui}
      header{position:sticky;top:0;height:80px;background:#ff00ff;z-index:2}
      .band{height:1000px}
      #cookie{position:fixed;left:0;right:0;bottom:0;height:60px;background:#00ffff;z-index:3}
    </style></head><body>
      <header></header>
      ${BANDS.map((color) => `<div class="band" style="background:${color}"></div>`).join('')}
      <div style="height:${PAGE_HEIGHT - 80 - BANDS.length * 1000}px;background:#222"></div>
      <div id="cookie"></div>
    </body></html>`,
};

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function near(actual, expected, tolerance = 6) {
  return actual.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) <= tolerance);
}

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✔ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  ✘ ${name}\n    ${error?.stack ?? error}`);
  }
}

/** Reads the newest capture's pixels in an extension page, straight from IndexedDB. */
async function samplePixels(extensionPage, captureId, points) {
  return extensionPage.evaluate(
    async ({ captureId, points }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('snapframe');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction('captures').objectStore('captures').get(captureId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const bitmap = await createImageBitmap(record.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const samples = points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
      return {
        width: bitmap.width,
        height: bitmap.height,
        samples,
        record: { ...record, blob: undefined, thumbnail: !!record.thumbnail },
      };
    },
    { captureId, points },
  );
}

async function waitForEditor(context, trigger) {
  const pagePromise = context.waitForEvent('page', { predicate: (page) => page.url().includes('editor.html') });
  await trigger();
  const editor = await pagePromise;
  await editor.waitForLoadState('domcontentloaded');
  await editor.waitForFunction(() => window.__snapframeEditor?.getState().canvasWidth > 0, null, { timeout: 15_000 });
  await editor.waitForSelector('.canvas-shell canvas');
  return editor;
}

function captureIdOf(editor) {
  return new URL(editor.url()).searchParams.get('captureId');
}

/** Decodes a PNG file in an extension page and samples pixels from it. */
async function decodePixels(extensionPage, buffer, points) {
  return extensionPage.evaluate(
    async ({ base64, points }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        samples: points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)),
      };
    },
    { base64: buffer.toString('base64'), points },
  );
}

/** Downloads the editor's current PNG export (Ctrl+S) and returns the file's bytes. */
async function exportPng(editor, name) {
  const downloadPromise = editor.waitForEvent('download');
  await editor.keyboard.press('Control+s');
  const file = path.join(artifacts, name);
  await (await downloadPromise).saveAs(file);
  return readFile(file);
}

async function canvasMapper(editor) {
  // A fresh editor plays the canvas entrance animation (slide + scale); measure once it settles.
  await editor.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  const shell = await editor.locator('.canvas-shell').boundingBox();
  const zoom = await editor.evaluate(() => window.__snapframeEditor.getState().zoom);
  return (x, y) => [shell.x + x * zoom, shell.y + y * zoom];
}

const server = createServer((request, response) => {
  const body = pages[new URL(request.url, 'http://x').pathname];
  response.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body ?? 'not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

await mkdir(artifacts, { recursive: true });
const userDataDir = await mkdtemp(path.join(tmpdir(), 'snapframe-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel,
  headless: !headed,
  // Playwright hides scrollbars in headless mode; keep them so layout matches real use.
  ignoreDefaultArgs: ['--hide-scrollbars'],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  locale: lang,
  acceptDownloads: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--lang=${lang}`],
});

let exitCode = 0;
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  console.log(`SnapFrame e2e — extension ${extensionId}, lang=${lang}\n`);

  let visibleEditor;

  await step('welcome page opens on install with the brand font', async () => {
    const isWelcome = (candidate) => candidate.url().includes('welcome.html');
    const welcome =
      context.pages().find(isWelcome) ??
      (await context.waitForEvent('page', { predicate: isWelcome, timeout: 10_000 }));
    await welcome.waitForSelector('.hero__title');
    await welcome.evaluate(() => document.fonts.ready);
    const info = await welcome.evaluate(() => ({
      title: document.querySelector('.hero__title')?.textContent ?? '',
      font: document.fonts.check('16px "Inter Variable"'),
      steps: document.querySelectorAll('.step').length,
    }));
    assert.ok(info.title.length > 10, 'hero title rendered');
    assert.equal(info.steps, 3);
    assert.ok(info.font, 'Inter Variable is bundled and loaded');
    await welcome.setViewportSize({ width: 1280, height: 900 });
    await welcome.screenshot({ path: path.join(artifacts, `welcome-${lang}.png`), fullPage: true });
    await welcome.close();
  });

  await step('visible-area capture opens the editor with the full viewport', async () => {
    await page.goto(`${origin}/plain`);
    await page.bringToFront();
    visibleEditor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const pixels = await samplePixels(visibleEditor, captureIdOf(visibleEditor), [
      [150, 150],
      [20, 20],
    ]);
    assert.equal(pixels.width, 1280);
    assert.equal(pixels.height, 800);
    assert.ok(near(pixels.samples[0], [0, 0, 0]), `box pixel ${pixels.samples[0]}`);
    assert.ok(near(pixels.samples[1], [255, 255, 255]), `background pixel ${pixels.samples[1]}`);
  });

  await step('area capture crops exactly and never includes the selection overlay', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    await worker.evaluate(() => globalThis.__snapframeTest.startAreaSelection());
    await page.waitForFunction(() => document.getElementById('snapframe-capture-overlay'));
    const editor = await waitForEditor(context, async () => {
      await page.mouse.move(50, 50);
      await page.mouse.down();
      await page.mouse.move(250, 200, { steps: 5 });
      await page.mouse.move(400, 350, { steps: 5 });
      await page.mouse.up();
    });
    const pixels = await samplePixels(editor, captureIdOf(editor), [
      [10, 10],
      [100, 100],
      [340, 290],
    ]);
    assert.equal(pixels.width, 350);
    assert.equal(pixels.height, 300);
    // Before the fix these were darkened by the overlay's rgba(0,0,0,.25) tint.
    assert.ok(near(pixels.samples[0], [255, 255, 255]), `top-left should be pure white, got ${pixels.samples[0]}`);
    assert.ok(near(pixels.samples[1], [0, 0, 0]), `box pixel ${pixels.samples[1]}`);
    assert.ok(near(pixels.samples[2], [255, 255, 255]), `bottom-right should be white, got ${pixels.samples[2]}`);
    assert.equal(await page.evaluate(() => !!document.getElementById('snapframe-capture-overlay')), false);
    await editor.close();
  });

  await step('element capture: hover highlights an element, a click captures exactly it', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    await worker.evaluate(() => globalThis.__snapframeTest.startAreaSelection('element'));
    await page.waitForFunction(() => document.getElementById('snapframe-capture-overlay'));
    const editor = await waitForEditor(context, async () => {
      await page.mouse.move(150, 150, { steps: 3 });
      await page.waitForTimeout(150);
      await page.mouse.down();
      await page.mouse.up();
    });
    const pixels = await samplePixels(editor, captureIdOf(editor), [
      [100, 100],
      [5, 5],
    ]);
    assert.equal(pixels.record.sourceType, 'element');
    assert.deepEqual([pixels.width, pixels.height], [200, 200]);
    assert.ok(near(pixels.samples[0], [0, 0, 0]) && near(pixels.samples[1], [0, 0, 0]), 'captured the black box');
    await editor.close();
  });

  await step('page-aware: personal data is detected and redacted in one click (one undo step)', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/sensitive`);
    await page.waitForTimeout(300);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const kinds = await editor.evaluate(() =>
      window.__snapframeEditor
        .getState()
        .pageData.sensitive.map((region) => region.kind)
        .sort(),
    );
    assert.deepEqual(kinds, ['card', 'email', 'phone'], 'dates, prices and order numbers must not be flagged');
    await editor.waitForSelector('.smart-bar');
    await editor.screenshot({ path: path.join(artifacts, `editor-redact-${lang}.png`) });
    await editor.locator('.smart-bar .btn--primary').click();
    await editor.waitForSelector('.smart-bar', { state: 'detached' });
    const countBlurs = () =>
      editor.evaluate(() => window.__snapframeEditor.getState().objects.filter((o) => o.type === 'blur').length);
    assert.equal(await countBlurs(), 3);
    await editor.keyboard.press('Control+z');
    assert.equal(await countBlurs(), 0, 'the batch redaction undoes in one step');
    await editor.close();
  });

  await step('full-page capture stitches the page, pins sticky/fixed bars once and restores the page', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/long`);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 1234);
      document.documentElement.style.scrollBehavior = '';
    });
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runFullPageCapture()),
    );
    const viewportHeight = 800;
    const pixels = await samplePixels(editor, captureIdOf(editor), [
      [640, 40], // sticky header, first slice
      [640, viewportHeight + 40], // where the header would repeat in slice 2
      [640, 2 * viewportHeight + 40], // ...and slice 3
      [640, viewportHeight - 30], // where the fixed cookie bar sits in slice 1
      [640, PAGE_HEIGHT - 30], // cookie bar at the very bottom
      [1275, 500], // right edge: no scrollbar baked in
      [640, 80 + 1000 + 500], // middle of band 2
    ]);
    const [header, slice2, slice3, cookieTop, cookieBottom, rightEdge, band2] = pixels.samples;
    assert.equal(pixels.height, PAGE_HEIGHT, 'stitched height');
    assert.equal(pixels.width, 1280, 'stitched width');
    assert.ok(near(header, [255, 0, 255]), `header ${header}`);
    assert.ok(!near(slice2, [255, 0, 255]), `sticky header repeated in slice 2: ${slice2}`);
    assert.ok(!near(slice3, [255, 0, 255]), `sticky header repeated in slice 3: ${slice3}`);
    assert.ok(!near(cookieTop, [0, 255, 255]), `fixed bar baked into slice 1: ${cookieTop}`);
    assert.ok(near(cookieBottom, [0, 255, 255]), `fixed bar missing at bottom: ${cookieBottom}`);
    assert.ok(near(rightEdge, hexToRgb(BANDS[0])), `right edge ${rightEdge}`);
    assert.ok(near(band2, hexToRgb(BANDS[1])), `band 2 ${band2}`);
    const after = await page.evaluate(() => ({
      scrollY: window.scrollY,
      pinned: document.querySelectorAll('[data-snapframe-pin]').length,
      style: !!document.getElementById('snapframe-capture-style'),
    }));
    assert.deepEqual(after, { scrollY: 1234, pinned: 0, style: false });
    await editor.screenshot({ path: path.join(artifacts, `editor-fullpage-${lang}.png`) });
    await editor.close();
  });

  await step('editor: drawing tools land exactly under the cursor at any zoom', async () => {
    const editor = visibleEditor;
    await editor.bringToFront();
    const shell = await editor.locator('.canvas-shell').boundingBox();
    const zoom = await editor.evaluate(() => window.__snapframeEditor.getState().zoom);
    assert.ok(zoom < 1, `fit zoom should shrink a 1280px capture, got ${zoom}`);
    const toScreen = (x, y) => [shell.x + x * zoom, shell.y + y * zoom];
    const drag = async (from, to) => {
      await editor.mouse.move(...toScreen(...from));
      await editor.mouse.down();
      await editor.mouse.move(...toScreen((from[0] + to[0]) / 2, (from[1] + to[1]) / 2), { steps: 4 });
      await editor.mouse.move(...toScreen(...to), { steps: 4 });
      await editor.mouse.up();
    };
    const last = () => editor.evaluate(() => window.__snapframeEditor.getState().objects.at(-1));

    await editor.keyboard.press('r');
    await drag([100, 100], [300, 250]);
    const rect = await last();
    assert.equal(rect.type, 'shape');
    const tolerance = 2 / zoom;
    assert.ok(
      Math.abs(rect.x - 100) <= tolerance && Math.abs(rect.y - 100) <= tolerance,
      `rect at ${rect.x},${rect.y}`,
    );
    assert.ok(
      Math.abs(rect.width - 200) <= tolerance && Math.abs(rect.height - 150) <= tolerance,
      `rect size ${rect.width}x${rect.height}`,
    );

    await editor.keyboard.press('o');
    await drag([400, 100], [520, 200]);
    assert.equal((await last()).type, 'ellipse');

    await editor.keyboard.press('a');
    await drag([700, 400], [600, 300]); // up-left arrow: negative vector
    const arrow = await last();
    assert.equal(arrow.type, 'arrow');
    assert.ok(arrow.width < 0 && arrow.height < 0, 'arrow keeps its direction');

    await editor.keyboard.press('n');
    await editor.mouse.click(...toScreen(800, 500));
    await editor.mouse.click(...toScreen(860, 500));
    const steps = await editor.evaluate(() =>
      window.__snapframeEditor
        .getState()
        .objects.filter((o) => o.type === 'step')
        .map((o) => o.style.number),
    );
    assert.deepEqual(steps, [1, 2]);

    await editor.keyboard.press('b');
    await drag([120, 120], [280, 200]);
    assert.equal((await last()).type, 'blur');

    await editor.keyboard.press('t');
    await editor.mouse.click(...toScreen(500, 600));
    await editor.keyboard.type('Merhaba SnapFrame');
    await editor.keyboard.press('Escape');
    const text = await last();
    assert.equal(text.type, 'text');
    assert.equal(text.style.text, 'Merhaba SnapFrame');

    const before = await editor.evaluate(() => window.__snapframeEditor.getState().objects.length);
    await editor.keyboard.press('Control+z');
    assert.equal(await editor.evaluate(() => window.__snapframeEditor.getState().objects.length), before - 1);
    await editor.keyboard.press('Control+Shift+z');
    assert.equal(await editor.evaluate(() => window.__snapframeEditor.getState().objects.length), before);

    // The base screenshot can't be selected or deleted.
    await editor.keyboard.press('v');
    await editor.keyboard.press('Control+a');
    await editor.keyboard.press('Escape');
    await editor.mouse.click(...toScreen(1000, 700));
    await editor.keyboard.press('Delete');
    assert.ok(await editor.evaluate(() => window.__snapframeEditor.getState().objects.some((o) => o.type === 'image')));
    await editor.screenshot({ path: path.join(artifacts, `editor-annotated-${lang}.png`) });
  });

  await step('editor: magnetic drawing frames a page element with a single click', async () => {
    const editor = visibleEditor;
    await editor.bringToFront();
    await editor.keyboard.press('Escape');
    const shell = await editor.locator('.canvas-shell').boundingBox();
    const zoom = await editor.evaluate(() => window.__snapframeEditor.getState().zoom);
    await editor.keyboard.press('r');
    await editor.mouse.move(shell.x + 200 * zoom, shell.y + 270 * zoom, { steps: 3 });
    await editor.waitForTimeout(80);
    await editor.mouse.down();
    await editor.mouse.up();
    const framed = await editor.evaluate(() => window.__snapframeEditor.getState().objects.at(-1));
    assert.equal(framed.type, 'shape');
    // The black box is 100,100 200x200; the outline sits just outside it (half stroke + 3px).
    assert.ok(Math.abs(framed.x - 95) <= 1 && Math.abs(framed.width - 210) <= 1, `${framed.x},${framed.width}`);
    await editor.keyboard.press('Control+z');
    await editor.keyboard.press('v');
  });

  await step('editor: export renders annotations at true pixel size (plain by default)', async () => {
    const editor = visibleEditor;
    const state = await editor.evaluate(() => {
      const { canvasWidth, canvasHeight, beautify } = window.__snapframeEditor.getState();
      return { canvasWidth, canvasHeight, background: beautify.background.type };
    });
    assert.equal(state.background, 'none', 'new captures start without a background');
    const downloadPromise = editor.waitForEvent('download');
    await editor.keyboard.press('Control+s');
    const download = await downloadPromise;
    const file = path.join(artifacts, `export-${lang}.png`);
    await download.saveAs(file);
    assert.deepEqual(pngSize(await readFile(file)), { width: state.canvasWidth, height: state.canvasHeight });
    assert.match(download.suggestedFilename(), /^snapframe-127-0-0-1-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
  });

  await step('editor: background, padding, radius and shadow appear only once a background is chosen', async () => {
    const editor = visibleEditor;
    const sliders = editor.locator('.inspector input[type=range]');
    assert.equal(await editor.locator('.beautify-frame--plain').count(), 1);
    assert.equal(await sliders.count(), 0, 'frame sliders hidden while there is no background');

    await editor.locator('.bg-swatch').nth(1).click(); // first gradient preset
    assert.equal(await editor.locator('.beautify-frame--plain').count(), 0);
    assert.ok((await sliders.count()) >= 2, 'padding and radius sliders shown');
    const padding = await editor.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.beautify-frame')).paddingTop),
    );
    assert.ok(padding > 0, `frame padding ${padding}`);
    await editor.screenshot({ path: path.join(artifacts, `editor-background-${lang}.png`) });

    const state = await editor.evaluate(() => {
      const { canvasWidth, canvasHeight, unit, beautify } = window.__snapframeEditor.getState();
      return { canvasWidth, canvasHeight, unit, padding: beautify.padding };
    });
    const downloadPromise = editor.waitForEvent('download');
    await editor.keyboard.press('Control+s');
    const file = path.join(artifacts, `export-framed-${lang}.png`);
    await (await downloadPromise).saveAs(file);
    const framePadding = Math.round(state.padding * state.unit) * 2;
    assert.deepEqual(pngSize(await readFile(file)), {
      width: state.canvasWidth + framePadding,
      height: state.canvasHeight + framePadding,
    });
  });

  await step('editor: zoom holds still while dragging the padding slider, then fits once', async () => {
    const editor = visibleEditor;
    const zoomNow = () => editor.evaluate(() => window.__snapframeEditor.getState().zoom);
    const slider = editor.locator('.inspector input[type=range]').first();
    const box = await slider.boundingBox();
    const y = box.y + box.height / 2;
    const before = await zoomNow();
    await editor.mouse.move(box.x + box.width * 0.2, y);
    await editor.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await editor.mouse.move(box.x + box.width * (0.2 + i * 0.08), y);
      assert.equal(await zoomNow(), before, `zoom changed mid-drag at step ${i}`);
    }
    await editor.mouse.up();
    await editor.waitForTimeout(100);
    const after = await zoomNow();
    assert.ok(after < before, `should re-fit to the larger frame on release (${before} -> ${after})`);
  });

  await step('editor: fit-to-screen is stable at every padding and window size (no jitter)', async () => {
    const editor = visibleEditor;
    const unstable = [];
    for (const height of [640, 700, 760, 800]) {
      await editor.setViewportSize({ width: 1280, height });
      for (let padding = 0; padding <= 160; padding += 8) {
        const result = await editor.evaluate(async (value) => {
          const store = window.__snapframeEditor;
          store.getState().setBeautify({ padding: value });
          const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          await frame();
          await frame();
          const seen = new Set();
          for (let i = 0; i < 10; i++) {
            await frame();
            seen.add(store.getState().zoom.toFixed(6));
          }
          const scroller = document.querySelector('.viewport__scroller');
          return { zooms: seen.size, overflowX: scroller.scrollWidth > scroller.clientWidth };
        }, padding);
        if (result.zooms > 1 || result.overflowX) unstable.push({ height, padding, ...result });
      }
    }
    await editor.setViewportSize({ width: 1280, height: 800 });
    await editor.locator('.bg-swatch--none').click();
    assert.deepEqual(unstable, []);
  });

  await step('editor: crop shrinks the canvas and keeps annotations aligned', async () => {
    const editor = visibleEditor;
    const shell = await editor.locator('.canvas-shell').boundingBox();
    const zoom = await editor.evaluate(() => window.__snapframeEditor.getState().zoom);
    const toScreen = (x, y) => [shell.x + x * zoom, shell.y + y * zoom];
    await editor.keyboard.press('c');
    await editor.mouse.move(...toScreen(50, 50));
    await editor.mouse.down();
    await editor.mouse.move(...toScreen(650, 450), { steps: 6 });
    await editor.mouse.up();
    await editor.keyboard.press('Enter');
    const after = await editor.evaluate(() => {
      const { canvasWidth, canvasHeight, objects } = window.__snapframeEditor.getState();
      return { canvasWidth, canvasHeight, rect: objects.find((o) => o.type === 'shape') };
    });
    assert.ok(
      Math.abs(after.canvasWidth - 600) <= 2 && Math.abs(after.canvasHeight - 400) <= 2,
      `${after.canvasWidth}x${after.canvasHeight}`,
    );
    assert.ok(Math.abs(after.rect.x - 50) <= 2, `rect re-based to ${after.rect.x}`);
    await editor.keyboard.press('Control+z');
    assert.equal(await editor.evaluate(() => window.__snapframeEditor.getState().canvasWidth), 1280);
  });

  await step(
    'editor: device mockups show live, wrap the screenshot without cropping, and match the export',
    async () => {
      const editor = visibleEditor;
      const measure = () =>
        editor.evaluate(() => {
          const { canvasWidth, canvasHeight, zoom } = window.__snapframeEditor.getState();
          const screen = document.querySelector('.device__screen').getBoundingClientRect();
          const device = document.querySelector('.device').getBoundingClientRect();
          return {
            screen:
              Math.abs(screen.width - canvasWidth * zoom) < 1 && Math.abs(screen.height - canvasHeight * zoom) < 1,
            deviceWidth: device.width / zoom,
            deviceHeight: device.height / zoom,
            hasCanvas: !!document.querySelector('.device__screen .canvas-shell canvas'),
          };
        });

      await editor.locator('.mockup-tile').nth(2).click(); // laptop
      await editor.waitForSelector('.device');
      const laptop = await measure();
      assert.ok(laptop.screen && laptop.hasCanvas, 'laptop screen shows the full, unscaled canvas');
      await editor.screenshot({ path: path.join(artifacts, `editor-mockup-laptop-${lang}.png`) });

      await editor.locator('.mockup-tile').nth(3).click(); // phone
      const phone = await measure();
      assert.ok(phone.screen, 'phone screen shows the full canvas');
      assert.ok(phone.deviceWidth > phone.deviceHeight, 'a wide screenshot turns the phone to landscape');
      await editor.screenshot({ path: path.join(artifacts, `editor-mockup-phone-${lang}.png`) });

      await editor.locator('.mockup-tile').nth(1).click(); // browser
      const browserFrame = await measure();
      await editor.getByRole('button', { name: /preview|önizleme/i }).click();
      await editor.waitForFunction(() => document.querySelector('.preview__image')?.naturalWidth > 0);
      const natural = await editor.evaluate(() => {
        const image = document.querySelector('.preview__image');
        return { width: image.naturalWidth, height: image.naturalHeight };
      });
      assert.ok(
        Math.abs(natural.width - browserFrame.deviceWidth) <= 2,
        `export ${natural.width} vs editor ${browserFrame.deviceWidth}`,
      );
      assert.ok(
        Math.abs(natural.height - browserFrame.deviceHeight) <= 2,
        `export ${natural.height} vs editor ${browserFrame.deviceHeight}`,
      );
      await editor.screenshot({ path: path.join(artifacts, `editor-preview-${lang}.png`) });
      await editor.keyboard.press('Escape');
      await editor.locator('.mockup-tile').nth(0).click();
    },
  );

  await step('editor: shortcuts dialog and dark theme render', async () => {
    const editor = visibleEditor;
    await editor.keyboard.press('Shift+?');
    await editor.waitForSelector('.shortcuts');
    await editor.screenshot({ path: path.join(artifacts, `editor-shortcuts-${lang}.png`) });
    await editor.keyboard.press('Escape');
    await editor.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await editor.waitForTimeout(300); // let color transitions finish
    await editor.screenshot({ path: path.join(artifacts, `editor-dark-${lang}.png`) });
    await editor.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  });

  await step('editor: animated export renders real MP4 / WebM / GIF files on-device', async () => {
    const editor = visibleEditor;
    await editor.getByRole('button', { name: /^(animate|canlandır)(\s|$)/i }).click();
    await editor.waitForSelector('.animate__canvas');
    await editor.waitForTimeout(1500);
    await editor.screenshot({ path: path.join(artifacts, `editor-animate-${lang}.png`) });
    const formatGroup = editor.locator('.animate__controls .segmented').first();
    const results = {};
    for (const name of ['WebM', 'GIF', 'MP4']) {
      const button = formatGroup.getByRole('button', { name, exact: true });
      if (await button.isDisabled()) {
        results[name] = 'unsupported here';
        continue;
      }
      await button.click();
      const downloadPromise = editor.waitForEvent('download', { timeout: 180_000 });
      await editor.locator('.dialog__footer .btn--primary').click();
      const download = await downloadPromise;
      const file = path.join(artifacts, `animation-${lang}.${name.toLowerCase()}`);
      await download.saveAs(file);
      const bytes = await readFile(file);
      if (name === 'WebM') assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'EBML header');
      if (name === 'MP4') assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp');
      if (name === 'GIF') assert.equal(bytes.subarray(0, 6).toString('latin1'), 'GIF89a');
      results[name] = `${Math.round(bytes.length / 1024)} KB`;
      if (name === 'WebM') {
        // It must actually play: load it into a <video> and read the duration.
        const duration = await editor.evaluate(async (base64) => {
          const video = document.createElement('video');
          video.muted = true;
          video.src = `data:video/webm;base64,${base64}`;
          await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error('video failed to load'));
          });
          if (!Number.isFinite(video.duration)) {
            video.currentTime = 1e9;
            await new Promise((resolve) => (video.ontimeupdate = resolve));
          }
          return video.duration;
        }, bytes.toString('base64'));
        assert.ok(duration > 2, `WebM duration ${duration}`);
        results.WebM += `, ${duration.toFixed(1)} s`;
      }
    }
    console.log(`    formats: ${JSON.stringify(results)}`);
    assert.ok(typeof results.WebM === 'string' && results.WebM.includes('KB'), 'WebM must be supported in Chromium');
    await editor.keyboard.press('Escape');
  });

  await step('editor: autosave restores edits after the tab is reopened', async () => {
    const editor = visibleEditor;
    const url = editor.url();
    const count = await editor.evaluate(() => window.__snapframeEditor.getState().objects.length);
    await editor.close({ runBeforeUnload: true });
    const reopened = await context.newPage();
    await reopened.goto(url);
    await reopened.waitForFunction(() => window.__snapframeEditor?.getState().canvasWidth > 0);
    await reopened.waitForTimeout(200);
    assert.equal(await reopened.evaluate(() => window.__snapframeEditor.getState().objects.length), count);
    await reopened.close();
  });

  await step('editor: the magnifier enlarges the screenshot and never reveals a redaction', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const toScreen = await canvasMapper(editor);
    await editor.keyboard.press('m');
    await editor.mouse.click(...toScreen(310, 200));
    const lens = await editor.evaluate(() => window.__snapframeEditor.getState().objects.at(-1));
    assert.equal(lens.type, 'magnify');
    assert.ok(Math.abs(lens.width - 140) < 1 && Math.abs(lens.x - 240) < 2, `lens ${lens.x},${lens.width}`);

    // The black box ends at x=300. At 2x around x=310, canvas x=295 shows source x~302.5 - white
    // (it would be black without the lens).
    let pixels = await decodePixels(editor, await exportPng(editor, `magnify-${lang}.png`), [
      [295, 200],
      [250, 200],
    ]);
    assert.ok(near(pixels.samples[0], [255, 255, 255]), `enlarged edge ${pixels.samples[0]}`);
    assert.ok(near(pixels.samples[1], [0, 0, 0]), `enlarged box ${pixels.samples[1]}`);

    // A pixelated redaction over the box edge must show up pixelated inside the lens too.
    await editor.evaluate(() =>
      window.__snapframeEditor.getState().addObject({
        id: 'redaction-under-lens',
        type: 'blur',
        x: 280,
        y: 180,
        width: 40,
        height: 40,
        style: { mode: 'pixelate', strength: 14 },
      }),
    );
    pixels = await decodePixels(editor, await exportPng(editor, `magnify-redacted-${lang}.png`), [[295, 200]]);
    const [redacted] = pixels.samples;
    assert.ok(
      !near(redacted, [255, 255, 255], 40) && !near(redacted, [0, 0, 0], 40),
      `the lens must show the pixelated block, got ${redacted}`,
    );
    await editor.screenshot({ path: path.join(artifacts, `editor-magnify-${lang}.png`) });
    await editor.close();
  });

  await step('editor: a spotlight dims the page around it and keeps annotations bright', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const toScreen = await canvasMapper(editor);
    await editor.keyboard.press('n');
    await editor.mouse.click(...toScreen(1000, 650));
    await editor.keyboard.press('f');
    await editor.mouse.move(...toScreen(500, 350));
    await editor.mouse.down();
    await editor.mouse.move(...toScreen(650, 450), { steps: 4 });
    await editor.mouse.move(...toScreen(800, 550), { steps: 4 });
    await editor.mouse.up();
    const { spot, badge } = await editor.evaluate(() => {
      const { objects } = window.__snapframeEditor.getState();
      return { spot: objects.find((o) => o.type === 'spotlight'), badge: objects.find((o) => o.type === 'step') };
    });
    assert.ok(spot && Math.abs(spot.width - 300) <= 2 && Math.abs(spot.height - 200) <= 2, 'spotlight drawn');

    const pixels = await decodePixels(editor, await exportPng(editor, `spotlight-${lang}.png`), [
      [650, 450], // inside the spotlight
      [1100, 200], // outside
      [Math.round(badge.x + badge.width * 0.18), Math.round(badge.y + badge.height / 2)], // the badge, outside
    ]);
    const [inside, outside, badgePixel] = pixels.samples;
    assert.ok(near(inside, [255, 255, 255]), `inside ${inside}`);
    assert.ok(
      outside.slice(0, 3).every((value) => value < 150),
      `outside should be dimmed, got ${outside}`,
    );
    assert.ok(near(badgePixel, [255, 59, 48], 24), `annotations stay bright, got ${badgePixel}`);
    await editor.screenshot({ path: path.join(artifacts, `editor-spotlight-${lang}.png`) });
    await editor.close();
  });

  await step('animate: a full-page capture scrolls by inside its frame', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/long`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runFullPageCapture()),
    );
    await editor.getByRole('button', { name: /^(animate|canlandır)(\s|$)/i }).click();
    await editor.waitForSelector('.animate__canvas');
    const mode = editor.locator('.animate__controls .segmented').first();
    assert.equal(
      await mode.getByRole('button', { name: /page scroll|sayfa kaydırma/i }).getAttribute('aria-pressed'),
      'true',
      'full-page captures default to the scroll animation',
    );
    // The screen is the captured viewport (1280 x 800), not the whole 4600 px page.
    const ratio = await editor.evaluate(() => {
      const canvas = document.querySelector('.animate__canvas');
      return canvas.width / canvas.height;
    });
    assert.ok(Math.abs(ratio - 1.6) < 0.02, `screen ratio ${ratio}`);
    await editor.waitForTimeout(2500);
    await editor.screenshot({ path: path.join(artifacts, `editor-animate-scroll-${lang}.png`) });

    const formats = editor.locator('.animate__controls .segmented').nth(1);
    await formats.getByRole('button', { name: 'WebM', exact: true }).click();
    const downloadPromise = editor.waitForEvent('download', { timeout: 180_000 });
    await editor.locator('.dialog__footer .btn--primary').click();
    const file = path.join(artifacts, `animation-scroll-${lang}.webm`);
    await (await downloadPromise).saveAs(file);
    const duration = await editor.evaluate(
      async (base64) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = `data:video/webm;base64,${base64}`;
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('video failed to load'));
        });
        if (!Number.isFinite(video.duration)) {
          video.currentTime = 1e9;
          await new Promise((resolve) => (video.ontimeupdate = resolve));
        }
        return video.duration;
      },
      (await readFile(file)).toString('base64'),
    );
    assert.ok(duration > 4, `scroll video duration ${duration}`);
    console.log(`    scroll video: ${duration.toFixed(1)} s`);
    await editor.close();
  });

  await step('editor: Space + drag (or the middle button) pans without drawing', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    await canvasMapper(editor); // wait for the entrance to settle
    await editor.keyboard.press('Control+1'); // 100%: wider than the work area
    await editor.waitForTimeout(400);
    await editor.keyboard.press('r');
    const scroller = editor.locator('.viewport__scroller');
    const box = await scroller.boundingBox();
    const scrollOf = () =>
      editor.evaluate(() => {
        const element = document.querySelector('.viewport__scroller');
        return { left: element.scrollLeft, top: element.scrollTop };
      });
    const count = () => editor.evaluate(() => window.__snapframeEditor.getState().objects.length);
    const objectsBefore = await count();
    await editor.evaluate(() => {
      const element = document.querySelector('.viewport__scroller');
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });

    await editor.keyboard.down('Space');
    assert.ok(await editor.locator('.viewport__scroller--ready').count(), 'grab cursor while Space is held');
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await editor.mouse.down();
    await editor.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 80, { steps: 6 });
    await editor.mouse.up();
    await editor.keyboard.up('Space');
    const afterSpace = await scrollOf();
    assert.ok(Math.abs(afterSpace.left - 150) <= 3, `panned horizontally to ${afterSpace.left}`);
    assert.equal(await count(), objectsBefore, 'panning must not draw');

    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await editor.mouse.down({ button: 'middle' });
    await editor.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 4 });
    await editor.mouse.up({ button: 'middle' });
    assert.ok(Math.abs((await scrollOf()).left - 50) <= 3, 'middle-button drag pans too');
    assert.equal(await count(), objectsBefore);
    await editor.close();
  });

  await step('editor: arrows can be lines or double-headed, and any outline can be dashed', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const toScreen = await canvasMapper(editor);
    await editor.keyboard.press('a');
    await editor.mouse.move(...toScreen(400, 600));
    await editor.mouse.down();
    await editor.mouse.move(...toScreen(700, 600), { steps: 4 });
    await editor.mouse.move(...toScreen(1000, 600), { steps: 4 });
    await editor.mouse.up();
    await editor.keyboard.press('v');
    await editor
      .locator('.inspector button[title]')
      .filter({ has: editor.locator('.line-sample--dashed') })
      .click();
    await editor.getByTitle(/no arrowheads|ok başı yok/i).click();
    const arrow = await editor.evaluate(() => window.__snapframeEditor.getState().objects.at(-1));
    assert.equal(arrow.type, 'arrow');
    assert.deepEqual([arrow.style.heads, arrow.style.dashed], ['none', true]);

    // Along the dashed line there are both stroke pixels and gaps.
    const y = Math.round(arrow.y);
    const points = Array.from({ length: 120 }, (_, index) => [500 + index * 2, y]);
    const pixels = await decodePixels(editor, await exportPng(editor, `dashed-${lang}.png`), points);
    const red = pixels.samples.filter((sample) => near(sample, [255, 59, 48], 40)).length;
    const white = pixels.samples.filter((sample) => near(sample, [255, 255, 255], 20)).length;
    assert.ok(red > 20 && white > 20, `dashed line: ${red} stroke, ${white} gap samples`);
    await editor.screenshot({ path: path.join(artifacts, `editor-line-styles-${lang}.png`) });
    await editor.close();
  });

  await step('animate: every annotation type animates (preview and export)', async () => {
    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const errors = [];
    editor.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await editor.evaluate(() => {
      const store = window.__snapframeEditor.getState();
      const add = (object) => store.addObject({ id: crypto.randomUUID(), ...object });
      const red = '#ff3b30';
      add({ type: 'blur', x: 120, y: 120, width: 80, height: 40, style: { mode: 'pixelate', strength: 12 } });
      add({
        type: 'spotlight',
        x: 380,
        y: 80,
        width: 520,
        height: 360,
        style: { dim: 0.5, shape: 'rounded', radius: 12 },
      });
      add({
        type: 'shape',
        x: 400,
        y: 100,
        width: 200,
        height: 120,
        style: { stroke: red, strokeWidth: 4, dashed: true },
      });
      add({ type: 'ellipse', x: 650, y: 100, width: 200, height: 120, style: { stroke: red, strokeWidth: 4 } });
      add({
        type: 'arrow',
        x: 700,
        y: 420,
        width: 150,
        height: -100,
        style: { stroke: red, strokeWidth: 4, heads: 'both' },
      });
      add({ type: 'highlight', x: 400, y: 600, width: 300, height: 40, style: { color: '#ffcc00' } });
      add({ type: 'step', x: 900, y: 600, width: 30, height: 30, style: { color: red, number: 1 } });
      add({
        type: 'text',
        x: 900,
        y: 200,
        width: 160,
        height: 40,
        style: { text: 'Hello', fontSize: 18, color: '#fff', backgroundColor: '#6640f5', padding: 8, cornerRadius: 6 },
      });
      add({
        type: 'magnify',
        x: 240,
        y: 130,
        width: 140,
        height: 140,
        style: { zoom: 2, shape: 'circle', color: '#fff' },
      });
      store.clearSelection();
    });
    await editor.waitForTimeout(600);
    await editor.getByRole('button', { name: /^(animate|canlandır)(\s|$)/i }).click();
    await editor.waitForSelector('.animate__canvas', { timeout: 10_000 });
    await editor.waitForTimeout(1500); // let the preview play a while
    assert.equal(await editor.locator('.animate__message').count(), 0, 'the scene must build');
    await editor.screenshot({ path: path.join(artifacts, `editor-animate-all-${lang}.png`) });
    const formats = editor.locator('.animate__controls .segmented').first();
    await formats.getByRole('button', { name: 'WebM', exact: true }).click();
    const downloadPromise = editor.waitForEvent('download', { timeout: 180_000 });
    await editor.locator('.dialog__footer .btn--primary').click();
    const file = path.join(artifacts, `animation-all-${lang}.webm`);
    await (await downloadPromise).saveAs(file);
    assert.ok((await readFile(file)).length > 10_000, 'a real video was written');
    assert.deepEqual(errors, []);
    await editor.close();
  });

  let options;

  await step('settings page renders and saves', async () => {
    options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.waitForSelector('.choice');
    assert.equal(await options.locator('.choice').count(), 3);
    assert.equal(await options.locator('.choice').first().getAttribute('aria-checked'), 'true');
    await options.waitForTimeout(700); // sections rise in one after another
    await options.screenshot({ path: path.join(artifacts, `settings-${lang}.png`), fullPage: true });
  });

  await step('settings: quick copy skips the editor and puts the capture on the clipboard', async () => {
    await options.bringToFront();
    await options.locator('.choice').nth(1).click();
    await options.waitForFunction(
      () => document.querySelectorAll('.choice')[1].getAttribute('aria-checked') === 'true',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    let editorOpened = false;
    const onPage = (candidate) => {
      if (candidate.url().includes('editor.html')) editorOpened = true;
    };
    context.on('page', onPage);
    try {
      await page.bringToFront();
      await page.goto(`${origin}/plain`);
      await worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1));
      await page.waitForFunction(() => !!document.getElementById('snapframe-capture-toast'), null, { timeout: 15_000 });
      await page.waitForTimeout(450); // the card slides in
      await page.screenshot({ path: path.join(artifacts, `quick-copy-${lang}.png`) });
      const size = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read();
        const bitmap = await createImageBitmap(await item.getType('image/png'));
        return [bitmap.width, bitmap.height];
      });
      assert.deepEqual(size, [1280, 800], 'the capture is on the clipboard');
      await page.waitForTimeout(800);
      assert.equal(editorOpened, false, 'no editor tab for a quick copy');
    } finally {
      context.off('page', onPage);
    }

    // The card's "Edit" button asks the background to open the capture in the editor.
    const captureId = await options.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('snapframe');
        request.onsuccess = () => resolve(request.result);
      });
      return new Promise((resolve) => {
        const request = db.transaction('captures').objectStore('captures').index('createdAt').openCursor(null, 'prev');
        request.onsuccess = () => resolve(request.result.value.captureId);
      });
    });
    const editor = await waitForEditor(context, () =>
      options.evaluate((id) => chrome.runtime.sendMessage({ type: 'open-editor', captureId: id }), captureId),
    );
    assert.equal(captureIdOf(editor), captureId);
    await editor.close();
  });

  await step('settings: quick download uses the file name template and an offscreen document', async () => {
    await options.bringToFront();
    await options.locator('.choice').nth(2).click();
    await options.waitForFunction(
      () => document.querySelectorAll('.choice')[2].getAttribute('aria-checked') === 'true',
    );
    await options.locator('.template__input').fill('{site}-{date}');
    await options.waitForTimeout(700); // the template saves after a short pause
    await worker.evaluate(() => {
      globalThis.__suggestedNames = [];
      chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        globalThis.__suggestedNames.push(item.filename);
        suggest();
      });
    });

    await page.bringToFront();
    await page.goto(`${origin}/plain`);
    await worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1));
    await page.waitForFunction(() => !!document.getElementById('snapframe-capture-toast'), null, { timeout: 20_000 });
    const result = await worker.evaluate(async () => {
      const [latest] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
      const offscreen = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return {
        state: latest?.state,
        mime: latest?.mime,
        bytes: latest?.fileSize,
        names: globalThis.__suggestedNames,
        file: latest?.filename,
        offscreen: offscreen.length,
      };
    });
    assert.equal(result.state, 'complete');
    assert.ok(result.bytes > 1000, `downloaded ${result.bytes} bytes`);
    assert.equal(result.offscreen, 0, 'the offscreen document is closed afterwards');
    if (result.names.length > 0) {
      assert.match(result.names.at(-1), /^127-0-0-1-\d{4}-\d{2}-\d{2}\.png$/);
    } else {
      console.log(`    (suggested name not observable here; saved as ${result.file})`);
    }

    // Back to the defaults for the remaining steps.
    await options.bringToFront();
    await options.getByRole('button', { name: /reset to default|varsayılana dön/i }).click();
    await options.locator('.choice').first().click();
    await options.waitForTimeout(700);
  });

  await step('settings: page awareness can be turned off', async () => {
    await options.bringToFront();
    await options.locator('input[role=switch]').uncheck();
    await options.waitForTimeout(200);
    await page.bringToFront();
    await page.goto(`${origin}/sensitive`);
    const editor = await waitForEditor(context, () =>
      worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1)),
    );
    const pixels = await samplePixels(editor, captureIdOf(editor), [[0, 0]]);
    assert.equal(pixels.record.snapshot, undefined, 'nothing is read from the page');
    assert.equal(await editor.evaluate(() => window.__snapframeEditor.getState().pageData), null);
    await editor.close();
    await options.bringToFront();
    await options.locator('input[role=switch]').check();
    await options.waitForTimeout(200);
    await options.close();
  });

  await step('popup renders actions, shortcuts and recent captures', async () => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 340, height: 520 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('.popup__recent-thumb');
    assert.equal(await popup.locator('.capture-action').count(), 4);
    assert.equal(await popup.getByRole('button', { name: /^(settings|ayarlar)$/i }).count(), 1);
    await popup.screenshot({ path: path.join(artifacts, `popup-${lang}.png`), fullPage: true });
    await popup.close();
  });

  await step('library lists captures and imports an image into the editor', async () => {
    const library = await context.newPage();
    await library.goto(`chrome-extension://${extensionId}/library.html`);
    await library.waitForSelector('.capture-card');
    assert.ok((await library.locator('.capture-card').count()) >= 3);
    // Edited captures show their edited picture; every capture gets a small thumbnail.
    await library.waitForSelector('.capture-card img[data-edited="true"]');
    await library.waitForFunction(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('snapframe');
        request.onsuccess = () => resolve(request.result);
      });
      const records = await new Promise((resolve) => {
        const request = db.transaction('captures').objectStore('captures').getAll();
        request.onsuccess = () => resolve(request.result);
      });
      return records.every((record) => record.thumbnail instanceof Blob);
    });
    await library.waitForTimeout(500); // cards rise in one after another
    await library.screenshot({ path: path.join(artifacts, `library-${lang}.png`) });

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
      'base64',
    );
    await library.locator('input[type=file]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png });
    await library.waitForURL(/editor\.html/);
    await library.waitForFunction(() => window.__snapframeEditor?.getState().canvasWidth > 0);
    const imported = await library.evaluate(() => {
      const { canvasWidth, canvasHeight, unit } = window.__snapframeEditor.getState();
      return { canvasWidth, canvasHeight, unit };
    });
    assert.deepEqual(imported, { canvasWidth: 2, canvasHeight: 2, unit: 1 });
    await library.close();
  });

  await step(`UI language follows the browser (${lang})`, async () => {
    const probe = await context.newPage();
    await probe.goto(`chrome-extension://${extensionId}/library.html`);
    const info = await probe.evaluate(() => ({ lang: document.documentElement.lang, title: document.title }));
    await probe.close();
    assert.ok(info.lang.toLowerCase().startsWith(lang), `html lang ${info.lang}`);
    if (lang === 'tr') assert.match(info.title, /Kütüphane/);
  });
} finally {
  await context.close();
  server.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed · screenshots in ${path.relative(root, artifacts)}`,
);
if (failed.length > 0) exitCode = 1;
process.exit(exitCode);
