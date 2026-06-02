import type { Settings } from '../state/types';

// ============ TIER 0 PREFERENCE PERSISTENCE ============
// Local-only, no account. We auto-persist the user's *preferences* (the whole
// Settings object: framing, durations, motion, theme, template, export defaults)
// to localStorage so the app remembers their last setup across sessions.
//
// We deliberately do NOT persist media (photos/songs) or the intro/outro text:
// browsers can't re-hydrate a File across sessions, and the product promise is
// that nothing about your photos leaves the device. Settings are tiny + safe.
// (Explicit, file-based project save/load lives in persistence.ts — different
// concern: that's a shareable snapshot; this is silent last-used recall.)

const PREFS_KEY = 'campclips:prefs:v1';
const DEBOUNCE_MS = 250;

let _timer: ReturnType<typeof setTimeout> | null = null;

// Load persisted preferences as a partial so the store can merge it over its
// defaults — missing/older keys fall back to defaults, extra unknown keys are
// harmless. Returns null if nothing is stored or the blob is unreadable.
export function loadPersistedSettings(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<Settings>;
  } catch {
    return null;
  }
}

// Persist preferences. Debounced so slider drags (which fire updateSettings on
// every step) don't hammer localStorage.
export function persistSettings(settings: Settings): void {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(settings));
    } catch {
      /* quota or privacy mode — preferences just won't persist this session */
    }
  }, DEBOUNCE_MS);
}
