import { useStore } from '../state/store';
import type { Theme } from '../state/types';

// Theme toggle (dark / light). Affects ONLY --bg-* / --text-* / --shadow-*
// tokens (via the [data-theme] attribute on <html>). Brand colors and template
// palette overrides are a separate system — do not merge them.
export function applyTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  useStore.getState().updateSettings({ theme });
  try {
    localStorage.setItem('campClipsTheme', theme);
  } catch (e) {
    /* ignore */
  }
}

export function restoreTheme(): void {
  try {
    const saved = localStorage.getItem('campClipsTheme');
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  } catch (e) {
    /* ignore */
  }
}
