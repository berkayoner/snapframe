# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-11-24

### Added

- **Element capture:** hover any element on the page to highlight it, use
  ↑/↓ or the mouse wheel to move to its parent or child, and click to capture
  exactly that element. It is available from the popup and the right-click
  menu, and has a bindable shortcut.
- **Page-aware editor:** captures now carry a local snapshot of the page
  layout.
  - Rectangles, ellipses, highlights, redactions and crops snap to element
    edges, with guide lines.
  - A single click frames the element under the pointer.
  - Alt draws freely, and a "Magnetic drawing" switch turns snapping off.
- **One-click redaction:** detects emails, phone numbers, card numbers (Luhn),
  IBANs (mod-97), Turkish national IDs (checksum) and common API keys in the
  captured page. Dates, prices and order numbers are deliberately ignored.
  - A suggestion bar and the Privacy panel can show the detected spots or
    pixelate them all as one undo step.
  - Only positions and kinds are stored, never the text.
- **Animated export:** MP4, WebM and GIF clips in which annotations appear one
  by one, with an optional camera that follows them. Encoded on-device with
  WebCodecs, with a live preview, speed options and cancel.
- **Motion:**
  - A shutter flash and a "fly to toolbar" effect after capture.
  - A gliding active-tool indicator and eased zoom that keeps the view
    centered.
  - Pop-in for new steps, labels and pastes, and staggered redactions.
  - Confirmation morphs on Copy and Download, and staggered popup and
    library entrances.
  - All of it respects `prefers-reduced-motion`.

### Fixed

- Two messages lost their number placeholder ("Sensitive data found ()"). A
  unit test now checks that every parameterized message has placeholders.

## [1.2.0] - 2026-11-20

### Added

- **Brand identity.**
  - A new logo: two crop corners framing a spark, on the Iris gradient. It
    has a pixel-tuned master for 16px.
  - A two-tone wordmark and light and dark lockups, all outlined SVG in
    `branding/`. The extension icons are regenerated from it.
- **Design language** (`docs/brand`): the Iris and Spark palette with
  violet-tinted neutrals, the bundled Inter Variable typeface (offline, Latin
  and Latin Extended), type, radius, shadow and motion tokens, iconography,
  illustration and voice guidelines.
- **Welcome page** on first install: what SnapFrame does, how to pin it, the
  user's actual shortcuts, and the privacy promise.
- Brand illustrations for empty states. The popup and the library show the
  logo lockup, and the area-selection overlay carries the brand.
- **Chrome Web Store kit** (`store/`):
  - Store icon, plus four screenshots and two promo tiles each in English
    and Turkish, generated from the real extension (`npm run store`).
  - Listing copy and permission justifications for review.
- `THIRD_PARTY_NOTICES.md`.

### Fixed

- Visible-area captures measure their pixel ratio from the captured image
  and the page's own viewport width, instead of trusting the reported
  `devicePixelRatio` or `tab.width`. Both can differ under page zoom,
  fractional scaling or headless browsers, and annotation and frame sizes then
  came out wrong.

## [1.1.0] - 2026-11-20

### Changed

- **Device mockups are now live in the editor.** Each frame is drawn around
  the screenshot at the screenshot's own aspect ratio. Screenshots are no
  longer cropped or squeezed into a fixed screen. Phones and tablets turn to
  landscape for wide screenshots. The editor and the export use the same
  geometry, so the preview always matches.
- **New captures start plain.** Background, padding, corner radius and shadow
  are off until a background is picked. Then they appear with the last-used
  values. "No background" is the first option.

### Fixed

- **Jitter while changing frame padding and zooming.** Konva drew one frame
  at the old scale after every resize; the canvas now redraws before the
  browser paints. The zoom also holds still while a frame slider is dragged
  and fits once on release.
- **Fit-to-screen could oscillate between two zoom levels** at certain window
  sizes when a scrollbar appeared and disappeared. The scrollbar space is
  now reserved, and the fit uses the layout's real margins.

## [1.0.0] - 2026-11-20

### Fixed

- **Area capture included the selection overlay.** Screenshots came out
  darkened, with the selection border and hint baked in. The overlay now
  removes itself and waits for a repaint before capturing.
- **Annotations were drawn in the wrong place whenever the editor was zoomed
  out** (for example every capture on a HiDPI screen). Pointer positions now
  account for the zoom level.
- **The base screenshot could be selected, dragged off-canvas and deleted.**
  It is now locked and can only be cropped.
- **Blur regions sampled the wrong pixels after a crop.**
- **Resizing an arrow that pointed left or up collapsed it.** Arrows now have
  endpoint handles.
- **Full-page captures could produce a blank or failed image on HiDPI
  displays.** Canvas limits are now computed in device pixels.
- **Full-page captures misaligned slices** on pages with smooth scrolling,
  repeated sticky headers and fixed bars on every slice, and baked the
  scrollbar into the image.
- Very tall captures rendered a blank editor canvas. The canvas backing-store
  resolution is now capped to browser limits.
- The crop overlay and selection handles could be baked into exports.
- Keyboard-shortcut and context-menu captures failed silently. Errors now
  show on the toolbar icon.
- Captures taken right after a navigation or tab switch failed with "image
  readback failed". These are now retried.
- Edits made in the last moment before closing the editor tab were lost.
  Autosave now flushes on close.
- Frame padding in the export depended on the editor's window size and zoom.
  It is now defined in source-page pixels.

### Added

- Redesigned editor: tool rail with icons and shortcuts; properties
  inspector; zoom (fit, 100%, Ctrl/⌘ + wheel); export menu; preview dialog;
  keyboard shortcuts dialog; toasts.
- New tools: ellipse, numbered steps and pixelate redaction. Colors, stroke
  widths, fill modes and text styling. Shift constrains shapes and snaps
  arrows to 45°.
- Multi-selection with marquee and Shift, group move, front/back ordering,
  duplicate, select all. Slider edits and new text labels each count as a
  single undo step.
- Crop handles and aspect-ratio presets.
- Mockups combine with the background, padding and shadow, and render at the
  screenshot's resolution.
- Library page: search, download the original, delete, clear all, and import
  images by file picker, drag & drop or paste.
- New popup with the user's actual shortcuts, full-page progress, recent
  captures and a link to the library.
- English and Turkish localization.
- Light and dark design system and a new icon.
- Last-used colors, frame and export settings are remembered.
- ESLint, Prettier, Vitest unit tests, a Playwright end-to-end suite and
  GitHub Actions CI.
