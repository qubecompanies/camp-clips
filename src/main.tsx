import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useStore } from './state/store';
import { applyThemeAttr } from './lib/theme';
import { applyPaletteOverride, TEMPLATES } from './lib/templates';
import './styles/tokens.css';
import './styles/index.css';

// Paint the restored preferences before React mounts so there's no flash of the
// wrong theme/palette. The store already merged persisted settings over the
// defaults (see preferences.ts), so we just reflect them into the DOM here.
{
  const { theme, templateId } = useStore.getState().settings;
  applyThemeAttr(theme);
  applyPaletteOverride(TEMPLATES[templateId]?.paletteOverride ?? null);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker for offline + installability. Production only —
// in dev it would cache Vite's HMR modules and fight the dev server. We register
// after load so it never competes with the first paint for bandwidth.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[sw] registration failed:', err);
    });
  });
}
