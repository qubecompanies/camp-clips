// ============ VIDEO INGEST (memory-safe, GPL-isolated) ============
// Three jobs, in increasing cost:
//   1. probeVideo()   — does this clip decode in THIS browser? (videoWidth > 0)
//   2. capturePoster()— one seek + one downscaled draw → a small JPEG thumbnail
//   3. convertToH264()— LAST resort: lazy-load ffmpeg.wasm and transcode HEVC→H.264
//
// Memory discipline mirrors imageProcessing.ts: we stream off a single <video>
// element (the browser never decodes every frame into RAM), draw exactly one
// poster frame to a downscaled canvas, then release. Clips never upload — the
// only URLs we mint are in-memory object URLs (or data-URL fallback).
//
// LICENSING: ffmpeg.wasm (@ffmpeg/core, GPL-2.0) is touched ONLY by
// convertToH264(), and it's dynamic-import()ed so it stays out of the main
// bundle until a user explicitly clicks Convert. Probe, poster, ingest, and
// everything downstream are GPL-free.

import { MAX_IMAGE_DIM, blobToUsableUrl } from './imageProcessing';

// How far into the clip to grab the poster frame. A tiny offset avoids the
// black/garbage first frame some encoders emit; clamped for very short clips.
const POSTER_SEEK_FRACTION = 0.1;
const POSTER_SEEK_MAX = 1.0; // seconds

export interface VideoProbe {
  decodable: boolean; // false ⇒ this browser can't decode it (HEVC on Chrome/Windows)
  width: number;
  height: number;
  naturalDuration: number;
}

export interface IngestResult {
  src: string; // object URL (or data URL) for the video the rest of the app plays
  revocable: boolean; // whether we own `src` and must revoke it on remove
  decodable: boolean;
  width: number;
  height: number;
  naturalDuration: number;
  poster?: { url: string; revocable: boolean }; // present only when decodable
}

// Load a video src into an off-screen element far enough to read dimensions +
// duration. Resolves with decodable:false (rather than rejecting) when the
// browser can't decode the codec — that's an expected outcome we guide the user
// through, not an error.
function probeVideoEl(src: string): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
    video.crossOrigin = 'anonymous';

    let settled = false;
    const finish = (probe: VideoProbe) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(probe);
    };
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const onLoaded = () => {
      // videoWidth === 0 after metadata loads is the tell-tale sign the codec
      // decoded as audio-only / not at all (HEVC in Chrome on Windows).
      const decodable = video.videoWidth > 0 && video.videoHeight > 0;
      finish({
        decodable,
        width: video.videoWidth,
        height: video.videoHeight,
        naturalDuration: isFinite(video.duration) ? video.duration : 0,
      });
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', () => finish({ decodable: false, width: 0, height: 0, naturalDuration: 0 }), {
      once: true,
    });
    // Safety net — never hang the import on a file the browser silently chokes on.
    setTimeout(() => finish({ decodable: false, width: 0, height: 0, naturalDuration: 0 }), 8000);

    video.src = src;
  });
}

// Grab one frame at `atTime` (seconds) from a decodable clip, downscaled to the
// same memory ceiling photos use, encoded as a JPEG blob. Returns the blob plus
// the downscaled pixel dimensions, or null on any failure. Shared by both the
// poster thumbnail and the "use as photo" middle-frame promotion — streams off a
// single <video> element so the browser never holds more than one frame in RAM.
async function grabFrame(
  src: string,
  width: number,
  height: number,
  atTime: number,
): Promise<{ blob: Blob; w: number; h: number } | null> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('frame load failed')), { once: true });
      setTimeout(() => reject(new Error('frame load timeout')), 8000);
      video.src = src;
    });

    // Seek to the requested frame and wait for it to paint.
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('frame seek failed')), { once: true });
      setTimeout(() => resolve(), 4000); // draw whatever we have rather than hang
      try {
        video.currentTime = Math.max(0, atTime);
      } catch {
        resolve();
      }
    });

    // Downscale to the same ceiling photos use, so a clip frame never costs
    // more memory than a photo.
    const scale = Math.min(MAX_IMAGE_DIM / width, MAX_IMAGE_DIM / height, 1);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;
    return { blob, w, h };
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

// A single downscaled poster frame from a decodable clip (a tiny offset in, to
// dodge the black/garbage first frame some encoders emit). Returns null on
// failure — the tile just shows a generic placeholder, non-fatal.
async function capturePoster(
  src: string,
  width: number,
  height: number,
  duration: number,
): Promise<{ url: string; revocable: boolean } | null> {
  const seekTo = Math.min(POSTER_SEEK_MAX, (duration || 0) * POSTER_SEEK_FRACTION);
  const frame = await grabFrame(src, width, height, seekTo);
  if (!frame) return null;
  return await blobToUsableUrl(frame.blob);
}

// Promote a clip to a still: grab the frame at `atTime` (the caller passes the
// midpoint) and return a photo-ready object URL plus its downscaled dimensions.
// Used by "Use as photo" on short clips / Live Photos. Returns null on failure.
export async function extractStillFrame(
  src: string,
  width: number,
  height: number,
  atTime: number,
): Promise<{ url: string; revocable: boolean; width: number; height: number } | null> {
  const frame = await grabFrame(src, width, height, atTime);
  if (!frame) return null;
  const usable = await blobToUsableUrl(frame.blob);
  return { url: usable.url, revocable: usable.revocable, width: frame.w, height: frame.h };
}

// Full ingest of one video file: mint a playable URL, probe decode support, and
// (when decodable) capture a poster. Never throws for the expected
// "can't decode this codec" case — that surfaces as decodable:false.
export async function ingestVideo(file: File): Promise<IngestResult> {
  const url = URL.createObjectURL(file);
  const probe = await probeVideoEl(url);

  if (!probe.decodable) {
    // Keep the object URL: ffmpeg reads the same File for Convert, and we want a
    // single source of truth to revoke later.
    return { src: url, revocable: true, decodable: false, width: 0, height: 0, naturalDuration: 0 };
  }

  const poster = (await capturePoster(url, probe.width, probe.height, probe.naturalDuration)) ?? undefined;
  return {
    src: url,
    revocable: true,
    decodable: true,
    width: probe.width,
    height: probe.height,
    naturalDuration: probe.naturalDuration,
    poster,
  };
}

// ---- Convert (GPL-2.0 ffmpeg.wasm; lazy, single shared instance) ----

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
let _ffmpeg: FFmpegInstance | null = null;
let _ffmpegLoading: Promise<FFmpegInstance> | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (_ffmpeg) return _ffmpeg;
  if (_ffmpegLoading) return _ffmpegLoading;

  _ffmpegLoading = (async () => {
    // Dynamic imports keep the ~30MB GPL core out of the initial bundle — it
    // only downloads the first time someone clicks Convert.
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const coreURL = (await import('@ffmpeg/core?url')).default;
    const wasmURL = (await import('@ffmpeg/core/wasm?url')).default;
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => console.log('[ffmpeg]', message));
    await ff.load({ coreURL, wasmURL });
    _ffmpeg = ff;
    return ff;
  })();

  try {
    return await _ffmpegLoading;
  } finally {
    _ffmpegLoading = null;
  }
}

// Transcode any file ffmpeg can read into a browser-friendly H.264/AAC MP4.
// onProgress receives 0..1. Returns the converted file as a Blob; the caller
// re-ingests it to get a poster + dimensions.
export async function convertToH264(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import('@ffmpeg/util');

  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  };
  ff.on('progress', progressHandler);

  const inName = 'in' + (/\.[a-z0-9]+$/i.exec(file.name)?.[0] ?? '.mov');
  const outName = 'out.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    // ultrafast/crf26 trades file size for speed — this runs on the user's
    // device, so wall-clock time matters more than a few extra MB.
    await ff.exec([
      '-i', inName,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outName,
    ]);
    const data = await ff.readFile(outName);
    // data is a Uint8Array; copy into a fresh ArrayBuffer-backed view so the Blob
    // ctor accepts it (readFile's type allows a SharedArrayBuffer backing).
    const src = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const bytes = new Uint8Array(src.length);
    bytes.set(src);
    return new Blob([bytes], { type: 'video/mp4' });
  } finally {
    ff.off('progress', progressHandler);
    // Free the virtual FS so a second convert doesn't accumulate.
    try {
      await ff.deleteFile(inName);
    } catch {
      /* ignore */
    }
    try {
      await ff.deleteFile(outName);
    } catch {
      /* ignore */
    }
  }
}
