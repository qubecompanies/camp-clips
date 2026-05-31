import { useStore } from '../state/store';
import { buildPlaybackList, getIncludedSongs } from './planning';
import { ensureKbPlan, drawKB } from './kenBurns';
import { TEMPLATES } from './templates';
import { sleep, fmtTime, easeInOut } from './utils';
import { toast } from '../state/toastStore';
import type { KbPlan } from '../state/types';

// ============ EXPORT ENGINE ============
// Ported verbatim from the prototype. Renders the slideshow to a canvas frame
// by frame, captures it with MediaRecorder, and mixes music via Web Audio.
// Progress is reported through a callback so the ExportModal owns its own UI.
// Ken Burns motion is driven by the SAME plan the live preview uses, so the
// export matches the preview.

type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let _recorder: MediaRecorder | null = null;
let _cancelled = false;

export function cancelExport(): void {
  if (_recorder && _recorder.state === 'recording') {
    _cancelled = true;
    _recorder.stop();
  }
}

// ===== ANIMATED INTRO/OUTRO =====
const TITLE_ANIM_FADE = 0.6; // seconds for fade-in/out at edges
const TITLE_ANIM_RISE = 0.45; // seconds for subtitle to rise into place

function drawAnimatedTitle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  title: string,
  subtitle: string,
  t: number,
  durationSec: number,
  opts: { titleStyle?: 'roman' | 'italic' } = {},
): void {
  const fadeInFrac = Math.min(0.35, TITLE_ANIM_FADE / durationSec);
  const fadeOutFrac = Math.min(0.25, TITLE_ANIM_FADE / durationSec);
  const riseFrac = Math.min(0.5, TITLE_ANIM_RISE / durationSec);

  let titleAlpha: number, subAlpha: number, subRise: number, underlineProgress: number;
  if (t < fadeInFrac) {
    // Phase A — fade in
    const p = t / fadeInFrac;
    titleAlpha = easeInOut(p);
    subAlpha = t < fadeInFrac * 0.4 ? 0 : easeInOut((p - 0.4) / 0.6);
    subRise = (1 - easeInOut(Math.min(1, t / riseFrac))) * 24;
    underlineProgress = Math.max(0, (p - 0.4) / 0.6);
  } else if (t > 1 - fadeOutFrac) {
    // Phase C — fade out
    const p = (1 - t) / fadeOutFrac;
    titleAlpha = easeInOut(p);
    subAlpha = easeInOut(p);
    subRise = 0;
    underlineProgress = 1;
  } else {
    titleAlpha = 1;
    subAlpha = 1;
    subRise = 0;
    underlineProgress = 1;
  }

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Scale type with canvas width — handles 720 / 1080 / 1440
  const sx = W / 1920;
  const titleSize = Math.round(88 * sx);
  const subSize = Math.round(32 * sx);

  // Title
  ctx.globalAlpha = titleAlpha;
  ctx.fillStyle = '#fff';
  const titleY = H / 2 - 30 * sx;
  if (opts.titleStyle === 'italic') {
    ctx.font = `italic 500 ${titleSize}px Fraunces, serif`;
  } else {
    ctx.font = `500 ${titleSize}px Fraunces, serif`;
  }
  ctx.fillText(title, W / 2, titleY);

  // Underline draws from center outward — subtle premium detail
  if (underlineProgress > 0 && title) {
    const titleWidth = ctx.measureText(title).width;
    const ulY = titleY + titleSize * 0.55;
    const halfLen = (titleWidth / 2) * underlineProgress;
    ctx.strokeStyle = '#FCE7B5';
    ctx.lineWidth = Math.max(2, 3 * sx);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2 - halfLen, ulY);
    ctx.lineTo(W / 2 + halfLen, ulY);
    ctx.stroke();
  }

  // Subtitle with rise animation
  if (subtitle) {
    ctx.globalAlpha = subAlpha;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `400 ${subSize}px Inter, sans-serif`;
    ctx.fillText(subtitle, W / 2, H / 2 + 50 * sx + subRise);
  }
  ctx.restore();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

async function renderTextFrames(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  title: string,
  subtitle: string,
  duration: number,
  onTick: () => void,
  opts: { titleStyle?: 'roman' | 'italic' },
): Promise<void> {
  const fps = 30;
  const totalFrames = Math.round(duration * fps);
  const titleStyle = (opts && opts.titleStyle) || 'roman';
  for (let f = 0; f < totalFrames; f++) {
    if (_cancelled) return;
    const t = f / Math.max(1, totalFrames - 1);
    drawAnimatedTitle(ctx, W, H, title, subtitle, t, duration, { titleStyle });
    onTick && onTick();
    await sleep(1000 / fps);
  }
}

async function renderFadeInKB(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  plan: KbPlan,
  t0: number,
  t1: number,
  duration: number,
  onTick: () => void,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const prog = f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, img, plan, t0 + (t1 - t0) * prog, prog);
    onTick && onTick();
    await sleep(1000 / fps);
  }
}

async function renderFadeOutKB(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  plan: KbPlan | null,
  t: number,
  duration: number,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, img, plan, t, 1 - f / total);
    await sleep(1000 / fps);
  }
}

async function renderCrossfadeKB(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  imgA: HTMLImageElement,
  planA: KbPlan | null,
  tA: number,
  imgB: HTMLImageElement,
  planB: KbPlan,
  tB0: number,
  tB1: number,
  duration: number,
  onTick: () => void,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const prog = f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, imgA, planA, tA, 1 - prog); // outgoing
    drawKB(ctx, W, H, imgB, planB, tB0 + (tB1 - tB0) * prog, prog); // incoming
    onTick && onTick();
    await sleep(1000 / fps);
  }
}

async function renderHoldKB(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  plan: KbPlan,
  t0: number,
  t1: number,
  duration: number,
  onTick: () => void,
): Promise<void> {
  if (duration <= 0) return;
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const prog = f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, img, plan, t0 + (t1 - t0) * prog, 1);
    onTick && onTick();
    await sleep(1000 / fps);
  }
}

export type ExportProgress = (pct: number, text: string) => void;

export async function doExport(onProgress: ExportProgress): Promise<'done' | 'cancelled'> {
  const { settings, intro, outro, eventName } = useStore.getState();
  onProgress(0, 'Preparing canvas…');

  // Build the same shuffled/capped photo list the preview uses
  const { list: photos, hold: effHold } = buildPlaybackList();
  // Resolution settings: 720p = 1280x720, 1080p = 1920x1080, 1440p = 2560x1440
  const resMap: Record<number, [number, number, number]> = {
    720: [1280, 720, 3_000_000],
    1080: [1920, 1080, 5_000_000],
    1440: [2560, 1440, 8_000_000],
  };
  const [W, H, videoBitsPerSecond] = resMap[settings.exportRes] || resMap[1080];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // pre-load images (deduplicated — looped lists reuse the same photo)
  onProgress(0, 'Loading images…');
  const imageCache = new Map<string, HTMLImageElement>();
  const loadedImages: HTMLImageElement[] = [];
  for (let i = 0; i < photos.length; i++) {
    if (!imageCache.has(photos[i].url)) {
      imageCache.set(photos[i].url, await loadImage(photos[i].url));
    }
    loadedImages.push(imageCache.get(photos[i].url)!);
    onProgress((i / photos.length) * 10, 'Loading images…');
  }

  // Build audio graph using Web Audio API (no <audio> elements — works in webviews)
  const audioCtx = new (window.AudioContext || (window as AnyWindow).webkitAudioContext!)();
  const audioDest = audioCtx.createMediaStreamDestination();
  const exportGain = audioCtx.createGain();
  exportGain.gain.value = settings.musicVolume;
  exportGain.connect(audioDest);
  exportGain.connect(audioCtx.destination); // user can hear it too
  const songs = getIncludedSongs();

  // Pre-decode all songs to AudioBuffers
  const decodedSongs: AudioBuffer[] = [];
  if (songs.length) {
    onProgress(0, 'Decoding music…');
    for (const song of songs) {
      if (!song.arrayBuffer) continue;
      try {
        const buf = await audioCtx.decodeAudioData(song.arrayBuffer.slice(0));
        decodedSongs.push(buf);
      } catch (err) {
        console.warn('Could not decode song for export:', song.name, err);
      }
    }
  }

  // Combine streams
  const canvasStream = canvas.captureStream(30);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (decodedSongs.length) tracks.push(...audioDest.stream.getAudioTracks());
  const combinedStream = new MediaStream(tracks);

  // MediaRecorder — pick codec based on user preference, with graceful fallback
  let mimeType: string | undefined;
  let fileExt: string | undefined;
  if (settings.exportFmt === 'mp4') {
    const mp4Candidates = ['video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    mimeType = mp4Candidates.find((t) => MediaRecorder.isTypeSupported(t));
    if (mimeType) {
      fileExt = 'mp4';
    } else {
      console.warn('MP4 not supported by MediaRecorder; falling back to WebM');
      toast('MP4 not supported in this browser. Saving as WebM instead.', 'info');
    }
  }
  if (!mimeType) {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mimeType = 'video/webm;codecs=vp8,opus';
    else mimeType = 'video/webm';
    fileExt = 'webm';
  }

  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond });
  _recorder = recorder;
  _cancelled = false;
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  let resolveDone: () => void;
  const donePromise = new Promise<void>((r) => (resolveDone = r));
  recorder.onstop = () => resolveDone();
  recorder.start(1000);

  // Schedule music: chain AudioBufferSourceNodes back-to-back, looping if needed
  const scheduledSources: AudioBufferSourceNode[] = [];
  if (decodedSongs.length) {
    const estimatedDuration =
      (intro.title ? intro.duration : 0) +
      photos.length * effHold +
      Math.max(0, photos.length - 1) * settings.transitionDuration +
      (outro.title ? outro.duration : 0);
    let scheduledTime = 0;
    let idx = 0;
    const startAt = audioCtx.currentTime + 0.1; // small lead-in
    while (scheduledTime < estimatedDuration + 5) {
      const buf = decodedSongs[idx % decodedSongs.length];
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(exportGain);
      src.start(startAt + scheduledTime);
      scheduledSources.push(src);
      scheduledTime += buf.duration;
      idx++;
      // If not looping and we've used every song once, stop scheduling
      if (!settings.loopMusic && idx >= decodedSongs.length) break;
      // Safety limit
      if (scheduledSources.length > 200) break;
    }
  }

  // Render frames
  const totalDuration =
    (intro.title ? intro.duration : 0) +
    photos.length * effHold +
    Math.max(0, photos.length - 1) * settings.transitionDuration +
    (outro.title ? outro.duration : 0);

  const renderStart = performance.now();
  const tpl = TEMPLATES[settings.templateId] || TEMPLATES.default;
  const titleStyle = (tpl.intro && tpl.intro.titleStyle) || 'roman';

  const tick = () => {
    const elapsed = (performance.now() - renderStart) / 1000;
    const pct = Math.min(100, (elapsed / totalDuration) * 100);
    onProgress(pct, `Rendering… ${Math.round(pct)}% (${fmtTime(elapsed)} of ~${fmtTime(totalDuration)})`);
  };

  // Intro
  if (intro.title && !_cancelled) {
    await renderTextFrames(ctx, W, H, intro.title, intro.subtitle, intro.duration, tick, { titleStyle });
  }

  // Photos with cross-fade + continuous Ken Burns motion
  const transFrac = settings.transitionDuration / (settings.transitionDuration + effHold);
  let prevPlan: KbPlan | null = null;
  for (let i = 0; i < loadedImages.length && !_cancelled; i++) {
    const plan = ensureKbPlan(photos[i], loadedImages[i].width, loadedImages[i].height);
    if (i > 0) {
      await renderCrossfadeKB(
        ctx,
        W,
        H,
        loadedImages[i - 1],
        prevPlan,
        1.0, // outgoing photo at end of its motion
        loadedImages[i],
        plan,
        0,
        transFrac, // incoming photo starts its motion
        settings.transitionDuration,
        tick,
      );
    } else {
      await renderFadeInKB(ctx, W, H, loadedImages[i], plan, 0, transFrac, settings.transitionDuration, tick);
    }
    // hold: continue this photo's motion from transFrac to 1.0
    await renderHoldKB(ctx, W, H, loadedImages[i], plan, transFrac, 1.0, effHold, tick);
    prevPlan = plan;
  }

  // Outro
  if (outro.title && !_cancelled) {
    await renderFadeOutKB(ctx, W, H, loadedImages[loadedImages.length - 1], prevPlan, 1.0, 0.8);
    await renderTextFrames(ctx, W, H, outro.title, outro.subtitle, outro.duration, tick, { titleStyle });
  }

  recorder.stop();
  await donePromise;
  audioCtx.close();
  _recorder = null;

  if (_cancelled) {
    onProgress(0, 'Export cancelled.');
    return 'cancelled';
  }

  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(eventName.trim() || 'camp-clips').replace(/[^a-z0-9-_]/gi, '_')}.${fileExt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  onProgress(100, 'Done. Video downloaded.');
  toast('Slideshow exported. Check your downloads.', 'success');
  return 'done';
}
