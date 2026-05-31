export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmtTime = (s: number): string => {
  if (!isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// In-place Fisher-Yates shuffle (returns the same array).
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ---- File type detection ----
// On mobile (especially iOS Safari), file.type often comes back as empty string
// or unexpected MIME types for MP3/M4A files. Fall back to extension matching.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac|opus|mp4|wma|aiff?)$/i;

export const isImageFile = (f: File) =>
  (f.type && f.type.startsWith('image/')) || IMAGE_EXT.test(f.name);
export const isAudioFile = (f: File) =>
  (f.type && f.type.startsWith('audio/')) || AUDIO_EXT.test(f.name);
