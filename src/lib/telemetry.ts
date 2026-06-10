// ============ ERROR TELEMETRY (privacy-minimal, opt-in by config) ============
// Fire-and-forget error reporting to the Camp Clips telemetry Worker (see
// telemetry-worker/). Sends only error text + minimal context — NEVER photos,
// songs, or any media (those never leave the browser, and aren't in errors
// anyway). Completely inert unless VITE_TELEMETRY_URL is set at build time, so
// shipping this before the Worker exists is harmless.

const ENDPOINT = (import.meta.env as Record<string, string | undefined>).VITE_TELEMETRY_URL;
const APP = 'camp-clips';
const VERSION = '1.0.0';
const MAX_PER_SESSION = 20; // don't spam the endpoint from one bad session

let sent = 0;
const seen = new Set<string>(); // de-dupe identical messages within a session

// Report a single error with a short context label (e.g. 'export', 'addPhotos').
// Safe to call anywhere — it can never throw and no-ops without an endpoint.
export function reportError(err: unknown, context: string): void {
  try {
    if (!ENDPOINT || sent >= MAX_PER_SESSION) return;
    const e = err as { message?: string; stack?: string } | undefined;
    const message = typeof err === 'string' ? err : e?.message || String(err);
    const dedupeKey = `${context}|${message}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    sent++;

    const body = JSON.stringify({
      message,
      stack: e?.stack,
      context,
      app: APP,
      version: VERSION,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
    });
    // keepalive lets the report still flush if the page is unloading.
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* telemetry must never affect the app */
    });
  } catch {
    /* swallow — reporting errors must not create errors */
  }
}

// Install lightweight global handlers once (uncaught errors + promise rejections).
// Both are de-duped and capped by reportError. No-op without an endpoint.
export function initTelemetry(): void {
  if (!ENDPOINT) return;
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}
