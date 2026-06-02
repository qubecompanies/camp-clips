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
