# SnapFrame Privacy Policy

_Last updated: 2026-11-20_

SnapFrame does not collect, transmit, sell or share any personal data.

## What the extension accesses

- **The current tab, only when you invoke SnapFrame** (toolbar button,
  keyboard shortcut or right-click menu), through Chrome's `activeTab`
  permission. SnapFrame reads the tab's pixels to create the screenshot,
  and its title and URL to label the capture in your library.
- **`scripting`**: used only during a capture: to show the area or element
  selection overlay, to scroll the page for a full-page capture (the page is
  put back exactly as it was afterwards), and to read the page's layout for
  the editor's page-aware features (see below).
- **Page layout and text, at capture time only.** To snap shapes to page
  elements and to offer one-click redaction, SnapFrame records where the
  captured page's elements are, and scans the captured text for patterns
  such as email addresses, phone numbers, card numbers, IBANs and API keys.
  This runs on your device. SnapFrame stores only **positions** and the
  **kind** of data found, never the text itself.
- **`contextMenus`**: adds the SnapFrame entries to the right-click menu.

## Where your data lives

Screenshots, their edits, and your preferences (theme, colors, export
settings) are stored only in your browser on your device, using IndexedDB
and local storage. The 30 most recent captures are kept and older ones are
deleted automatically. You can delete any capture, or all of them, from the
Library page. Uninstalling the extension removes all of this data.

SnapFrame makes no network requests. It has no analytics, no telemetry, no
accounts and no remote servers.

## Contact

Questions about this policy can be raised through the project's issue
tracker.
