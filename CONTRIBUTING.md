# Contributing to SnapFrame

Thanks for helping make SnapFrame better! Bug reports, ideas, translations
and pull requests are all welcome.

## Ground rules

- **Privacy is a feature.** SnapFrame makes no network requests and asks for
  the minimum permissions (`activeTab`, `scripting`, `contextMenus`). Changes
  that add network access, analytics or broader permissions need a very good
  reason and a discussion first.
- **Small, focused pull requests** are much easier to review than large ones.
  For bigger changes, open an issue to agree on the approach first.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

Requirements: Node.js 20+ and npm.

```sh
npm install        # also generates WXT types (.wxt/)
npm run dev        # hot-reloading dev build in .output/chrome-mv3-dev
```

Load the dev build: open `chrome://extensions` (or `edge://extensions`),
turn on **Developer mode**, click **Load unpacked** and pick
`.output/chrome-mv3-dev`.

## Before you open a pull request

```sh
npm run check      # typecheck + ESLint + Prettier + unit tests (exactly what CI runs)
npm run build:e2e && npm run test:e2e   # if you touched capture, the editor or export
```

- `npm run format` fixes formatting and `npm run lint:fix` fixes most lint
  issues.
- Branded Google Chrome ignores `--load-extension` since version 137. If
  Playwright's Chromium isn't available on your machine, run the e2e suite in
  Edge with `npm run test:e2e -- --channel=msedge`.
- Never commit `.output/chrome-mv3-e2e`. That test build has `<all_urls>`
  access and test hooks, and must not be loaded as a normal extension.

## Code style

- TypeScript in strict mode. Explain _why_ in comments, not _what_.
- Pure logic (geometry, detection, timelines, zoom math) lives in plain
  modules with unit tests in `tests/unit/`. Keep DOM and Konva code thin.
- UI uses the design tokens in `src/shared/theme.css`. Don't hard-code
  colors. See the [design language](docs/brand/README.md).
- Every user-visible string goes through `t('key')` (see below).
- Respect `prefers-reduced-motion` for any new animation.

## Translations

UI strings live in `public/_locales/<lang>/messages.json` (English and
Turkish today).

1. Add the key to **every** language file, with the same placeholders.
   Unit tests fail if a language misses a key or a placeholder.
2. Messages with values use Chrome's named placeholders:
   `"message": "$ARG1$ of $ARG2$"` with
   `"placeholders": { "arg1": { "content": "$1" }, "arg2": { "content": "$2" } }`.
3. Call it as `t('key', [first, second])`.

Want to add a language? Copy `public/_locales/en/messages.json` to a new
locale folder, translate the `message` values, and open a pull request.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org) are appreciated,
for example `feat(editor): add curved arrows` or
`fix(capture): restore scroll after full-page capture`.

## Releases (maintainers)

1. Bump `version` in `package.json` and move the `Unreleased` notes in
   `CHANGELOG.md` under the new version.
2. Commit, then tag: `git tag v1.4.0 && git push --follow-tags`.
3. The **Release** workflow builds the extension, attaches the zip and
   creates the GitHub release from the changelog.
4. Upload the same zip to the Chrome Web Store (see [store/README.md](store/README.md)).
