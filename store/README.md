# Chrome Web Store kit

Everything needed to publish SnapFrame on the Chrome Web Store (and the
Microsoft Edge Add-ons store, which accepts the same package and images).

| File                                                               | Store field              | Size     |
| ------------------------------------------------------------------ | ------------------------ | -------- |
| `icon-128.png`                                                     | Store icon               | 128×128  |
| `<lang>/screenshot-1…5.png`                                        | Screenshots (per locale) | 1280×800 |
| `<lang>/promo-small.png`                                           | Small promo tile         | 440×280  |
| `<lang>/promo-marquee.png`                                         | Marquee promo tile       | 1400×560 |
| [`listing.en.md`](listing.en.md), [`listing.tr.md`](listing.tr.md) | Listing text, per locale | —        |

The package itself is `.output/snapframe-<version>-chrome.zip` (`npm run zip`).

## Regenerate

All images come from the real extension (`npm run store`), so they stay
accurate when the UI changes:

```sh
npm run brand
npm run build:e2e
npm run store -- --channel=msedge
```

`scripts/store/demo-page.html` is a fictional product used only as capture
material.

## Review notes (paste into the submission form)

**Single purpose:** Capture screenshots of web pages and edit them
(annotate, redact, frame) before saving or copying them.

**Permission justifications**

- `activeTab`: captures the tab the user is looking at, only when the user
  invokes SnapFrame from the toolbar button, a keyboard shortcut or the
  context menu.
- `scripting`: during a capture only, injects the area-selection overlay or
  scrolls the page for a full-page capture, then restores the page.
- `contextMenus`: adds the "SnapFrame" capture entries to the right-click
  menu.
- `offscreen`: when the user chooses "Download" as the after-capture action,
  a hidden extension page turns the screenshot (already stored locally in
  IndexedDB) into a blob URL for `chrome.downloads`, which a service worker
  cannot create. Nothing is loaded from the network.
- `downloads` (optional permission): requested from the Settings page only if
  the user picks direct downloads, to save captures to the Downloads folder;
  released again when they switch back.

**Remote code:** none. All code ships in the package.

**Data usage:** SnapFrame collects no user data. Screenshots are stored only
locally (IndexedDB) and are never transmitted. Privacy policy: see
[`PRIVACY.md`](../PRIVACY.md). Publish it at a public URL and link it in the
listing.
