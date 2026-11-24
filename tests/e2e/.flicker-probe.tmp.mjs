// Reproduces the reported "jitter at some padding values": samples the editor's zoom
// repeatedly after setting each padding; an unstable fit shows up as changing zoom values.
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const extensionPath = process.argv[2];
const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(
    '<!doctype html><title>t</title><body style="margin:0;background:#fff"><div style="height:600px;background:#eee"></div>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = await mkdtemp(path.join(tmpdir(), 'sf-probe-'));
const context = await chromium.launchPersistentContext(dir, {
  channel: 'msedge',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = context.pages()[0];
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForTimeout(300);
  const editorPromise = context.waitForEvent('page');
  await worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(1));
  const editor = await editorPromise;
  await editor.waitForFunction(() => window.__snapframeEditor?.getState().canvasWidth > 0);
  await editor.waitForSelector('.canvas-shell canvas');
  const unstable = [];
  for (const height of [660, 680, 700, 720, 740, 760]) {
    await editor.setViewportSize({ width: 1280, height });
    for (let padding = 0; padding <= 160; padding += 4) {
      const samples = await editor.evaluate(async (p) => {
        const s = window.__snapframeEditor.getState();
        s.setBeautify({ background: { type: 'solid', color: '#a18cd1' }, padding: p });
        const values = new Set();
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          values.add(window.__snapframeEditor.getState().zoom.toFixed(5));
        }
        return [...values];
      }, padding);
      if (samples.length > 2) unstable.push({ height, padding, distinctZooms: samples.length });
    }
  }
  console.log(unstable.length ? `UNSTABLE: ${JSON.stringify(unstable)}` : 'stable at all paddings');
} finally {
  await context.close();
  server.close();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
