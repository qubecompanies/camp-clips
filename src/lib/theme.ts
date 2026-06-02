import { useStore } from '../state/store';
import type { Theme } from '../state/types';

// Set ONLY the [data-theme] attribute on <html>. Affects --bg-* / --text-* /
// --shadow-* tokens. Brand colors and template palette overrides are a separate
// system — do not merge them. Pure DOM side-effect, safe to call at startup
// before React mounts (used by main.tsx to paint the restored theme).
export function applyThemeAttr(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Theme toggle (dark / light). Paints the attribute AND records the choice in
// settings — which the store auto-persists (see preferences.ts), so the theme
// rides along with every other preference instead of its own localStorage key.
export function applyTheme(theme: Theme): void {
  applyThemeAttr(theme);
  useStore.getState().updateSettings({ theme });
}
