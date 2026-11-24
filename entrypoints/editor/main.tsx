import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { applyDocumentLanguage } from '@/src/shared/i18n';
import { applyStoredTheme } from '@/src/shared/theme';
import { loadSettings, onSettingsChanged } from '@/src/shared/settings';
import { exposeEditorForE2E } from '@/src/editor/e2e';
import '@/src/shared/fonts.css';
import '@/src/shared/theme.css';
import '@/src/shared/ui.css';

applyDocumentLanguage();
applyStoredTheme();
// File names follow the user's template; keep the cached settings current.
void loadSettings();
onSettingsChanged(() => undefined);
exposeEditorForE2E();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
