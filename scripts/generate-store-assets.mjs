// Generates the Chrome Web Store listing images (en + tr) from the real extension:
//   store/<lang>/screenshot-{1..4}.png   1280x800
//   store/<lang>/promo-small.png         440x280
//   store/<lang>/promo-marquee.png       1400x560
//   .github/social-preview.png           1280x640 (GitHub repository social preview)
//
//   npm run build:e2e && npm run store -- [--channel=msedge]
//
// Step 1 drives the e2e build in a real browser against scripts/store/demo-page.html
// (a fictional product) to take raw UI shots. Step 2 composes them into branded frames.
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output', 'chrome-mv3-e2e');
const storeDir = path.join(root, 'store');
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.slice(10) ?? 'chromium';
const langs = ['en', 'tr'];

const COPY = {
  en: {
    shots: [
      ['Capture. Annotate. Beautify.', 'Turn any web page into a polished, shareable image in seconds.'],
      ['Present it on any device', 'Browser, laptop, phone and tablet frames that fit your screenshot.'],
      ['Every capture, one click away', 'A private library of your recent screenshots — search, re-edit, export.'],
      ['Select exactly what you need', 'Visible area, a precise region or the full page — with one shortcut.'],
    ],
    tagline: 'Screenshots that look finished.',
    label: 'Record week!',
    promo: 'Capture · Annotate · Beautify',
  },
  tr: {
    shots: [
      [
        'Yakala. Not ekle. Güzelleştir.',
        'Her web sayfasını saniyeler içinde şık, paylaşılabilir bir görsele dönüştürün.',
      ],
      ['Her cihazda sunun', 'Ekran görüntünüze uyan tarayıcı, dizüstü, telefon ve tablet çerçeveleri.'],
      [
        'Tüm çekimler bir tık uzakta',
        'Son ekran görüntülerinizden oluşan özel kütüphane — arayın, düzenleyin, dışa aktarın.',
      ],
      ['Tam ihtiyacınız olanı seçin', 'Görünen alan, belirli bir bölge ya da tam sayfa — tek kısayolla.'],
    ],
    tagline: 'Bitmiş görünen ekran görüntüleri.',
    label: 'Rekor hafta!',
    promo: 'Yakala · Not ekle · Güzelleştir',
  },
};

const toDataUrl = (buffer, type) => `data:${type};base64,${buffer.toString('base64')}`;

// ---------- Step 1: raw UI shots ----------

async function captureRawShots(lang, origin) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'snapframe-store-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: lang,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--lang=${lang}`],
  });
  const shots = {};
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    // A fresh profile opens the welcome page on install; wait for it and close it so it can't
    // become the active tab during a capture.
    const isWelcome = (candidate) => candidate.url().includes('welcome.html');
    const welcome =
      context.pages().find(isWelcome) ??
      (await context.waitForEvent('page', { predicate: isWelcome, timeout: 10_000 }).catch(() => null));
    await welcome?.close();

    const page = await context.newPage();
    await page.goto(`${origin}/demo`);
    await page.waitForTimeout(400);
    const boxes = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        kpi: box('#kpi-revenue'),
        chart: box('#chart'),
        cta: box('#cta'),
        signups: box('#signups'),
        emails: Array.from(document.querySelectorAll('.email')).map((el) => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }),
      };
    });

    // Area selection in progress (shot 4).
    await worker.evaluate(() => globalThis.__snapframeTest.startAreaSelection());
    await page.waitForFunction(() => document.getElementById('snapframe-capture-overlay'));
    const { chart } = boxes;
    await page.mouse.move(chart.x - 10, chart.y - 10);
    await page.mouse.down();
    await page.mouse.move(chart.x + chart.width * 0.6, chart.y + chart.height * 0.5, { steps: 4 });
    await page.mouse.move(chart.x + chart.width + 10, chart.y + chart.height + 10, { steps: 4 });
    shots.select = await page.screenshot();
    const areaEditor = context.waitForEvent('page', { predicate: (p) => p.url().includes('editor.html') });
    await page.mouse.up();
    await (await areaEditor).close();

    // Annotated editor (shot 1) and device mockup (shot 2).
    await page.bringToFront();
    const editorPromise = context.waitForEvent('page', { predicate: (p) => p.url().includes('editor.html') });
    await worker.evaluate(() => globalThis.__snapframeTest.runVisibleCapture(2));
    const editor = await editorPromise;
    await editor.waitForFunction(() => window.__snapframeEditor?.getState().canvasWidth > 0);
    await editor.waitForSelector('.canvas-shell canvas');
    await editor.evaluate(
      ({ boxes, label }) => {
        const store = window.__snapframeEditor.getState();
        const u = store.unit;
        const s = (rect, pad = 0) => ({
          x: (rect.x - pad) * u,
          y: (rect.y - pad) * u,
          width: (rect.width + pad * 2) * u,
          height: (rect.height + pad * 2) * u,
        });
        const id = () => crypto.randomUUID();
        const red = '#ff3b30';
        store.addObject({
          id: id(),
          type: 'shape',
          ...s(boxes.kpi, 6),
          style: { stroke: red, strokeWidth: 3 * u, fillMode: 'none', cornerRadius: 12 * u },
        });
        for (const email of boxes.emails) {
          store.addObject({ id: id(), type: 'blur', ...s(email, 2), style: { mode: 'pixelate', strength: 6 * u } });
        }
        const step = (number, x, y, color = red) =>
          store.addObject({
            id: id(),
            type: 'step',
            x: (x - 15) * u,
            y: (y - 15) * u,
            width: 30 * u,
            height: 30 * u,
            style: { color, number },
          });
        step(1, boxes.kpi.x + boxes.kpi.width + 2, boxes.kpi.y - 2);
        step(2, boxes.chart.x + boxes.chart.width - 30, boxes.chart.y + 16);
        step(3, boxes.cta.x - 18, boxes.cta.y - 14);
        store.addObject({
          id: id(),
          type: 'arrow',
          x: (boxes.cta.x - 150) * u,
          y: (boxes.cta.y + 110) * u,
          width: 130 * u,
          height: -78 * u,
          style: { stroke: red, strokeWidth: 4 * u },
        });
        store.addObject({
          id: id(),
          type: 'text',
          x: (boxes.chart.x + boxes.chart.width - 230) * u,
          y: (boxes.chart.y + 120) * u,
          width: 200 * u,
          height: 40 * u,
          style: {
            text: label,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: 18 * u,
            fontWeight: 700,
            color: '#ffffff',
            backgroundColor: '#6640f5',
            padding: 9 * u,
            cornerRadius: 8 * u,
            align: 'left',
          },
        });
        store.clearSelection();
        store.setBeautify({
          background: { type: 'gradient', from: '#a18cd1', to: '#fbc2eb', angle: 135 },
          padding: 44,
          radius: 12,
          shadow: 'strong',
        });
      },
      { boxes, label: COPY[lang].label },
    );
    await editor.mouse.move(5, 300);
    await editor.waitForTimeout(500);
    shots.editor = await editor.screenshot();

    await editor.evaluate(() => {
      const store = window.__snapframeEditor.getState();
      store.setBeautify({ background: { type: 'gradient', from: '#2193b0', to: '#6dd5ed', angle: 135 }, padding: 36 });
      store.setMockupId('laptop-generic');
    });
    await editor.waitForTimeout(500);
    shots.mockup = await editor.screenshot();

    // Library (shot 3) and popup (overlaid on shot 3).
    const library = await context.newPage();
    await library.goto(`chrome-extension://${extensionId}/library.html`);
    await library.waitForSelector('.capture-card img');
    await library.waitForTimeout(400);
    shots.library = await library.screenshot();

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 340, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('.popup__recent-thumb img');
    await popup.waitForTimeout(300);
    shots.popup = await popup.locator('.popup').screenshot();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return shots;
}

// ---------- Step 2: branded composition ----------

const fontCss = async () => {
  const latin = await readFile(require.resolve('@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2'));
  const ext = await readFile(require.resolve('@fontsource-variable/inter/files/inter-latin-ext-opsz-normal.woff2'));
  return `@font-face{font-family:Inter;font-weight:100 900;src:url(${toDataUrl(latin, 'font/woff2')}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+2000-206F}
@font-face{font-family:Inter;font-weight:100 900;src:url(${toDataUrl(ext, 'font/woff2')}) format('woff2');unicode-range:U+0100-02BA}`;
};

function frame({ width, height, fonts, body, extraCss = '' }) {
  return `<!doctype html><html><head><style>${fonts}
*{box-sizing:border-box}html,body{margin:0}
body{width:${width}px;height:${height}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#fff;position:relative;
background:radial-gradient(900px 500px at 15% -10%,rgba(255,255,255,.18),transparent 60%),radial-gradient(700px 500px at 110% 110%,rgba(255,211,78,.16),transparent 60%),linear-gradient(135deg,#7457ff 0%,#5034e6 55%,#3a22b0 100%)}
.spark{position:absolute;fill:#ffd34e;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))}
${extraCss}</style></head><body>${body}</body></html>`;
}

const sparkSvg = (style) =>
  `<svg class="spark" style="${style}" viewBox="0 0 40 40"><path d="M20 2Q23 17 38 20Q23 23 20 38Q17 23 2 20Q17 17 20 2Z"/></svg>`;

async function compose(lang, shots, page, fonts, logoDark) {
  const outDir = path.join(storeDir, lang);
  await mkdir(outDir, { recursive: true });
  const copy = COPY[lang];
  const img = (buffer) => toDataUrl(buffer, 'image/png');

  const shotCss = `
.copy{position:absolute;left:0;right:0;top:54px;text-align:center;padding:0 80px}
.copy h1{margin:0;font-size:46px;font-weight:800;letter-spacing:-.035em;line-height:1.05}
.copy p{margin:14px auto 0;max-width:760px;font-size:19px;line-height:1.45;color:rgba(255,255,255,.82)}
.shot{position:absolute;left:50%;top:214px;width:1080px;transform:translateX(-50%);border-radius:16px 16px 0 0;overflow:hidden;
box-shadow:0 30px 80px rgba(20,8,80,.55),0 0 0 1px rgba(255,255,255,.14)}
.shot img{display:block;width:100%}
.float{position:absolute;right:70px;top:250px;width:300px;border-radius:16px;overflow:hidden;box-shadow:0 30px 70px rgba(20,8,80,.6),0 0 0 1px rgba(255,255,255,.2)}
.float img{display:block;width:100%}`;

  const variants = [
    { shot: shots.editor },
    { shot: shots.mockup },
    { shot: shots.library, float: shots.popup },
    { shot: shots.select },
  ];
  for (const [index, variant] of variants.entries()) {
    const [headline, sub] = copy.shots[index];
    const body =
      `<div class="copy"><h1>${headline}</h1><p>${sub}</p></div>` +
      `<div class="shot"><img src="${img(variant.shot)}"></div>` +
      (variant.float ? `<div class="float"><img src="${img(variant.float)}"></div>` : '') +
      sparkSvg('width:44px;height:44px;left:120px;top:150px') +
      sparkSvg('width:26px;height:26px;right:150px;top:70px');
    await render(
      page,
      frame({ width: 1280, height: 800, fonts, body, extraCss: shotCss }),
      1280,
      800,
      path.join(outDir, `screenshot-${index + 1}.png`),
    );
  }

  // Small promo tile.
  await render(
    page,
    frame({
      width: 440,
      height: 280,
      fonts,
      extraCss: `.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:0 28px}
.wrap img{height:52px}.wrap h2{margin:0;font-size:24px;font-weight:800;letter-spacing:-.03em;line-height:1.15}
.wrap p{margin:0;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75)}`,
      body:
        `<div class="wrap"><img src="${logoDark}"><h2>${copy.tagline}</h2><p>${copy.promo}</p></div>` +
        sparkSvg('width:26px;height:26px;right:34px;top:30px') +
        sparkSvg('width:16px;height:16px;left:40px;bottom:40px'),
    }),
    440,
    280,
    path.join(outDir, 'promo-small.png'),
  );

  // Marquee.
  await render(
    page,
    frame({
      width: 1400,
      height: 560,
      fonts,
      extraCss: `.left{position:absolute;left:90px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.left img{height:56px;align-self:flex-start}.left h2{margin:0;font-size:46px;font-weight:800;letter-spacing:-.035em;line-height:1.05}
.left p{margin:0;font-size:15px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75)}
.right{position:absolute;right:-60px;top:70px;width:780px;border-radius:16px;overflow:hidden;transform:rotate(-3deg);
box-shadow:0 40px 90px rgba(20,8,80,.6),0 0 0 1px rgba(255,255,255,.16)}.right img{display:block;width:100%}`,
      body:
        `<div class="left"><img src="${logoDark}"><h2>${copy.tagline}</h2><p>${copy.promo}</p></div>` +
        `<div class="right"><img src="${img(shots.editor)}"></div>` +
        sparkSvg('width:40px;height:40px;left:560px;top:80px'),
    }),
    1400,
    560,
    path.join(outDir, 'promo-marquee.png'),
  );

  // GitHub social preview (repository Settings > Social preview), English only.
  if (lang === 'en') {
    await render(
      page,
      frame({
        width: 1280,
        height: 640,
        fonts,
        extraCss: `.left{position:absolute;left:80px;top:0;bottom:0;width:430px;display:flex;flex-direction:column;justify-content:center;gap:20px}
.left img{height:54px;align-self:flex-start}.left h2{margin:0;font-size:44px;font-weight:800;letter-spacing:-.035em;line-height:1.05}
.left p{margin:0;font-size:15px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75)}
.right{position:absolute;right:-70px;top:96px;width:720px;border-radius:16px;overflow:hidden;transform:rotate(-3deg);
box-shadow:0 40px 90px rgba(20,8,80,.6),0 0 0 1px rgba(255,255,255,.16)}.right img{display:block;width:100%}`,
        body:
          `<div class="left"><img src="${logoDark}"><h2>${copy.tagline}</h2><p>${copy.promo}</p></div>` +
          `<div class="right"><img src="${img(shots.editor)}"></div>` +
          sparkSvg('width:38px;height:38px;left:520px;top:90px'),
      }),
      1280,
      640,
      path.join(root, '.github', 'social-preview.png'),
    );
  }
}

async function render(page, html, width, height, outFile) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await writeFile(outFile, await page.screenshot({ clip: { x: 0, y: 0, width, height } }));
  console.log(path.relative(root, outFile));
}

// ---------- Run ----------

const demoHtml = await readFile(path.join(root, 'scripts', 'store', 'demo-page.html'));
const server = createServer((request, response) => {
  const ok = request.url?.startsWith('/demo');
  response.writeHead(ok ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(ok ? demoHtml : 'not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const fonts = await fontCss();
const logoDark = toDataUrl(await readFile(path.join(root, 'branding', 'logo-horizontal-dark.svg')), 'image/svg+xml');
const composer = await chromium.launch();
try {
  const page = await composer.newPage({ deviceScaleFactor: 1 });
  for (const lang of langs) {
    const shots = await captureRawShots(lang, origin);
    await compose(lang, shots, page, fonts, logoDark);
  }
} finally {
  await composer.close();
  server.close();
}
