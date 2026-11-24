// Builds every brand asset from the sources in branding/:
//   - wordmark + horizontal lockups as outlined SVG (no font needed to render them)
//   - extension icons (public/icon/*.png) and the Chrome Web Store icon (store/icon-128.png)
//
// Usage: npm run brand   (needs Playwright's Chromium: npx playwright install chromium)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'branding');

const COLORS = {
  ink: '#17162B',
  iris: '#6640F5',
  inkOnDark: '#FFFFFF',
  irisOnDark: '#B5A3FF',
};

// ---------- Wordmark ----------

const fontBuffer = await readFile(require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff'));
const font = opentype.parse(
  fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
);

/** Lays out text glyph by glyph (kerning + tracking) and returns outline path data and its advance width. */
function outline(text, x, baseline, size, tracking) {
  // Glyph-per-character (no GSUB pass): the wordmark has no ligatures, and opentype.js chokes on Inter's ccmp table.
  const glyphs = Array.from(text, (char) => font.charToGlyph(char));
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let d = '';
  glyphs.forEach((glyph, index) => {
    d += glyph.getPath(cursor, baseline, size).toPathData(2);
    const next = glyphs[index + 1];
    cursor += glyph.advanceWidth * scale + tracking * size;
    if (next) cursor += font.getKerningValue(glyph, next) * scale;
  });
  return { d, end: cursor - tracking * size };
}

const WORD_SIZE = 76;
const TRACKING = -0.03;
const capHeight = (font.tables.os2.sCapHeight / font.unitsPerEm) * WORD_SIZE;

function wordmarkPaths(x, baseline, colors) {
  const snap = outline('Snap', x, baseline, WORD_SIZE, TRACKING);
  const frame = outline('Frame', snap.end + TRACKING * WORD_SIZE, baseline, WORD_SIZE, TRACKING);
  return {
    svg: `<path d="${snap.d}" fill="${colors[0]}"/><path d="${frame.d}" fill="${colors[1]}"/>`,
    end: frame.end,
  };
}

const markSvg = await readFile(path.join(brandDir, 'logo-mark.svg'), 'utf8');
const markSmallSvg = await readFile(path.join(brandDir, 'logo-mark-small.svg'), 'utf8');
const markInner = markSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

function lockup(colors) {
  const gap = 30;
  const baseline = 64 + capHeight / 2;
  const words = wordmarkPaths(128 + gap, baseline, colors);
  const width = Math.ceil(words.end + 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 128">${markInner}${words.svg}</svg>\n`;
}

function wordmark(colors) {
  const baseline = Math.ceil(capHeight) + 2;
  const words = wordmarkPaths(0, baseline, colors);
  const height = Math.ceil(baseline + WORD_SIZE * 0.24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(words.end + 2)} ${height}">${words.svg}</svg>\n`;
}

await writeFile(path.join(brandDir, 'logo-horizontal.svg'), lockup([COLORS.ink, COLORS.iris]));
await writeFile(path.join(brandDir, 'logo-horizontal-dark.svg'), lockup([COLORS.inkOnDark, COLORS.irisOnDark]));
await writeFile(path.join(brandDir, 'logo-wordmark.svg'), wordmark([COLORS.ink, COLORS.iris]));
console.log('branding/logo-horizontal.svg, logo-horizontal-dark.svg, logo-wordmark.svg');

// ---------- Rasterized icons ----------

const toDataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

async function rasterize(page, svg, size, outFile, { artSize = size } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const offset = (size - artSize) / 2;
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="${toDataUrl(svg)}" width="${artSize}" height="${artSize}" style="position:absolute;left:${offset}px;top:${offset}px">` +
      `</body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, png);
  console.log(path.relative(root, outFile));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await rasterize(page, markSmallSvg, 16, path.join(root, 'public', 'icon', '16.png'));
  for (const size of [32, 48, 96, 128]) {
    await rasterize(page, markSvg, size, path.join(root, 'public', 'icon', `${size}.png`));
  }
  // Chrome Web Store: 128x128 with 96x96 artwork and 16px transparent padding.
  await rasterize(page, markSvg, 128, path.join(root, 'store', 'icon-128.png'), { artSize: 96 });
} finally {
  await browser.close();
}
