import type { TextScreen, SectionCard } from '../state/types';

// ============ TIER 0 TEXT AUTOSAVE ============
// A silent, debounced snapshot of the *text* of a show — the event name, the
// intro/outro screens, and the section title cards — to localStorage, restored
// automatically next time the Editor mounts.
//
// What this deliberately does NOT touch:
//   - Photos / clips / songs (binaries). Browsers can't re-hydrate a File across
//     sessions, and the product promise is that nothing about your media leaves
//     the device. Section cards anchor to a photo id (`beforePhotoId`) that won't
//     exist after a reload, so on restore we drop cards whose anchor is gone.
//   - Settings — those already persist via preferences.ts (different key).
//
// Section anchors: we keep them as-is on save. On restore we hand them back and
// let the caller reconcile against the freshly-imported media (a card whose
// anchor photo isn't present is harmless — it just never renders — but we filter
// the obviously-orphaned ones to keep the store tidy).

const AUTOSAVE_KEY = 'campclips:autosave:v1';
const DEBOUNCE_MS = 400;

export interface AutosaveSnapshot {
  schemaVersion: 1;
  eventName: string;
  intro: TextScreen;
  outro: TextScreen;
  sections: SectionCard[];
  savedAt: string;
}

let _timer: ReturnType<typeof setTimeout> | null = null;

// Persist the text of the current show. Debounced so per-keystroke edits to the
// event name / intro / outro don't hammer localStorage.
export function persistAutosave(data: Omit<AutosaveSnapshot, 'schemaVersion' | 'savedAt'>): void {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    try {
      const snapshot: AutosaveSnapshot = {
        schemaVersion: 1,
        ...data,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota or privacy mode — autosave just won't persist this session */
    }
  }, DEBOUNCE_MS);
}

// Read the last autosaved text snapshot, or null if nothing is stored / it's
// unreadable. Only returns it when there's actually something worth restoring
// (a non-empty event name, intro/outro text, or at least one section card) so a
// blank first run never shows a spurious "restored" toast.
export function loadAutosave(): AutosaveSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    const hasContent =
      !!parsed.eventName?.trim() ||
      !!parsed.intro?.title?.trim() ||
      !!parsed.intro?.subtitle?.trim() ||
      !!parsed.outro?.title?.trim() ||
      !!parsed.outro?.subtitle?.trim() ||
      (Array.isArray(parsed.sections) && parsed.sections.length > 0);
    if (!hasContent) return null;
    return parsed as AutosaveSnapshot;
  } catch {
    return null;
  }
}

// Wipe the autosave (used by an explicit "clear/start over" if we wire one up).
export function clearAutosave(): void {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}
