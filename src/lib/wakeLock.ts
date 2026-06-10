// ============ SCREEN WAKE LOCK ============
// Keeps the screen awake during a long export so the machine doesn't sleep
// mid-render (which would stall/kill the MediaRecorder capture). Feature-detected
// and fully optional — on browsers without the API (or if the request is denied)
// these are graceful no-ops. The lock auto-releases when the tab is hidden, so we
// re-acquire it on visibilitychange for as long as `wanted` is set.

// Minimal shape so we don't depend on a specific TS lib.dom version for the
// WakeLock types (they've moved around across versions).
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;
let listenerAttached = false;

async function request(): Promise<void> {
  const nav = navigator as WakeLockNavigator;
  if (!nav.wakeLock || document.visibilityState !== 'visible') return;
  try {
    sentinel = await nav.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied, not visible, or unsupported — non-fatal. Export still works; the
    // screen just isn't pinned awake.
    sentinel = null;
  }
}

function onVisibility(): void {
  if (wanted && document.visibilityState === 'visible' && !sentinel) {
    void request();
  }
}

// Acquire a screen wake lock for the duration of an export. Safe to call when
// unsupported — it just does nothing.
export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  if (!listenerAttached) {
    document.addEventListener('visibilitychange', onVisibility);
    listenerAttached = true;
  }
  await request();
}

// Release the wake lock (call when the export finishes or is cancelled).
export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  try {
    await s?.release();
  } catch {
    /* already released */
  }
}
