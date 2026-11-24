import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // OffscreenCanvas in the service worker, `scrollTo({ behavior: 'instant' })`
    // and React 19 all need a reasonably recent Chromium.
    minimum_chrome_version: '116',
    action: {
      default_title: '__MSG_extName__',
    },
    // Least privilege: `activeTab` grants access to the current tab only when
    // the user invokes the extension (toolbar, shortcut or context menu);
    // `scripting` injects the area overlay / full-page driver into that tab;
    // `contextMenus` backs the right-click entries. No host permissions, no
    // network access - captures never leave the device.
    permissions: ['activeTab', 'scripting', 'contextMenus'],
    // The e2e build (npm run build:e2e) drives captures without a user
    // gesture, which needs host access. Production builds never include it.
    ...(mode === 'e2e' ? { host_permissions: ['<all_urls>'] } : {}),
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+X' },
      },
      'capture-visible-area': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: '__MSG_captureVisible__',
      },
      'select-area': {
        suggested_key: { default: 'Alt+Shift+A' },
        description: '__MSG_captureArea__',
      },
      'capture-full-page': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: '__MSG_captureFullPage__',
      },
      // Chrome allows at most four suggested shortcuts; users can bind this one at chrome://extensions/shortcuts.
      'select-element': {
        description: '__MSG_captureElement__',
      },
    },
  }),
});
