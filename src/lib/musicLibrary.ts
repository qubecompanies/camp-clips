import type { MusicManifest } from '../state/types';

// ============ BUILT-IN MUSIC LIBRARY ============
// Loads public/music/manifest.json once and caches it. The manifest is the
// single source of truth for bundled royalty-free tracks; audio files live
// under public/music/<mood>/ and are fetched lazily only when the user adds a
// track to their show (see store.addBuiltInTrack).

const MANIFEST_URL = '/music/manifest.json';
const MUSIC_BASE = '/music/';

let _manifestPromise: Promise<MusicManifest | null> | null = null;

export function loadMusicManifest(): Promise<MusicManifest | null> {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const data = (await res.json()) as MusicManifest;
      if (!data || !Array.isArray(data.moods)) throw new Error('bad manifest shape');
      return data;
    } catch (err) {
      console.warn('[music] manifest load failed', err);
      return null;
    }
  })();
  return _manifestPromise;
}

// Resolve a track's manifest-relative file path to a fetchable URL.
export function trackUrl(file: string): string {
  // Allow absolute paths/URLs in the manifest to pass through untouched.
  if (/^(https?:)?\/\//.test(file) || file.startsWith('/')) return file;
  return MUSIC_BASE + file;
}
