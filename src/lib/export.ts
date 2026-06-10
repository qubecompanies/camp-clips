import { useStore } from '../state/store';
import { buildPlaybackList, getIncludedSongs, computePlan, sectionMap, sectionTimeForList } from './planning';
import { ensureKbPlan, drawKB } from './kenBurns';
import { TEMPLATES } from './templates';
import { sleep, fmtTime, easeInOut } from './utils';
import { acquireWakeLock, releaseWakeLock } from './wakeLock';
import { toast } from '../state/toastStore';
import type { KbPlan, ExportAspect, ExportRes, Photo, Clip } from '../state/types';

// Map the chosen aspect + resolution to canvas pixels and a target bitrate.
// `exportRes` is treated as the SHORT edge (the conventional meaning of
// 720/1080/1440 for 16:9), so each preset keeps comparable per-axis sharpness.
// Bitrate is keyed to the res tier (portrait shares 16:9's pixel count; square
// has fewer pixels, so it simply renders at slightly higher quality — fine).
export function exportDimensions(aspect: ExportAspect, res: ExportRes): [number, number, number] {
  const bitrateByRes: Record<number, number> = {
    720: 3_000_000,
    1080: 5_000_000,
    1440: 8_000_000,
  };
  const short = res;
  const long = Math.round((short * 16) / 9) & ~1; // even for codec safety
  let W: number, H: number;
  if (aspect === '9:16') {
    W = short;
    H = long;
  } else if (aspect === '1:1') {
    W = short;
    H = short;
  } else {
    W = long;
    H = short;
  }
  return [W, H, bitrateByRes[res] || bitrateByRes[1080]];
}

// ============ EXPORT ENGINE ============
// Ported verbatim from the prototype. Renders the slideshow to a canvas frame
// by frame, captures it with MediaRecorder, and mixes music via Web Audio.
// Progress is reported through a callback so the ExportModal owns its own UI.
// Ken Burns motion is driven by the SAME plan the live preview uses, so the
// export matches the preview.

type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

// Called once per fully-rendered canvas frame. The MediaRecorder path advances
// progress and sleeps 1000/fps to pace the real-time captureStream; the (Phase B)
// WebCodecs path will instead grab the canvas as a VideoFrame and encode it. By
// routing every render segment through this one hook, both engines share the
// exact same drawing code — only the per-frame "sink" differs.
type FrameEmitter = () => Promise<void>;

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

  // Scale type with the canvas SHORT edge so titles stay proportionate and fit
  // across every aspect (for 16:9 this equals the old W/1920 exactly).
  const sx = Math.min(W, H) / 1080;
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

// Trace a rounded-rectangle path (no reliance on the newer ctx.roundRect, which
// isn't universally available across the browsers we target).
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Draw a photo caption as a bottom-centered pill (dark scrim + white text) so it
// stays legible over any photo. Scrim + white text means it reads without relying
// on color (deuteranopia-safe). `alpha` lets callers fade it in/out in lockstep
// with the photo's own crossfade. Font auto-shrinks to fit the frame width.
function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, alpha: number): void {
  const caption = text.trim();
  if (!caption || alpha <= 0) return;
  const sx = Math.min(W, H) / 1080;
  const maxTextWidth = W * 0.82;
  let fontSize = Math.round(34 * sx);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${fontSize}px Inter, sans-serif`;
  let tw = ctx.measureText(caption).width;
  while (tw > maxTextWidth && fontSize > Math.round(16 * sx)) {
    fontSize -= 1;
    ctx.font = `500 ${fontSize}px Inter, sans-serif`;
    tw = ctx.measureText(caption).width;
  }
  const padX = Math.round(fontSize * 0.7);
  const padY = Math.round(fontSize * 0.42);
  const pillW = tw + padX * 2;
  const pillH = fontSize + padY * 2;
  const cx = W / 2;
  const cy = H - Math.round(H * 0.07) - pillH / 2;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRectPath(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(caption, cx, cy + 1);
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
  emit: FrameEmitter,
  opts: { titleStyle?: 'roman' | 'italic' },
): Promise<void> {
  const fps = 30;
  const totalFrames = Math.round(duration * fps);
  const titleStyle = (opts && opts.titleStyle) || 'roman';
  for (let f = 0; f < totalFrames; f++) {
    if (_cancelled) return;
    const t = f / Math.max(1, totalFrames - 1);
    drawAnimatedTitle(ctx, W, H, title, subtitle, t, duration, { titleStyle });
    await emit();
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
  emit: FrameEmitter,
  caption?: string,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const prog = f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, img, plan, t0 + (t1 - t0) * prog, prog);
    if (caption) drawCaption(ctx, W, H, caption, prog); // fade caption in with the photo
    await emit();
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
  emit: FrameEmitter,
  caption?: string,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const fade = 1 - f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, img, plan, t, fade);
    if (caption) drawCaption(ctx, W, H, caption, fade); // fade caption out with the photo
    await emit();
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
  emit: FrameEmitter,
  captionA?: string,
  captionB?: string,
): Promise<void> {
  const fps = 30;
  const total = Math.max(1, Math.round(duration * fps));
  for (let f = 0; f < total; f++) {
    if (_cancelled) return;
    const prog = f / total;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawKB(ctx, W, H, imgA, planA, tA, 1 - prog); // outgoing
    if (captionA) drawCaption(ctx, W, H, captionA, 1 - prog);
    drawKB(ctx, W, H, imgB, planB, tB0 + (tB1 - tB0) * prog, prog); // incoming
    if (captionB) drawCaption(ctx, W, H, captionB, prog);
    await emit();
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
  emit: FrameEmitter,
  caption?: string,
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
    if (caption) drawCaption(ctx, W, H, caption, 1); // caption held fully on during the hold
    await emit();
  }
}

// Draw the current frame of a <video> onto the canvas, letterboxed/cropped to
// match the chosen photoFit (mirrors drawKB's framing but for live video).
function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain',
): void {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const scale = fit === 'cover' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Audio plumbing handed to renderClip so a clip's own sound can be mixed into
// the export (Phase 5). When present and the clip isn't muted, we route the
// clip element through the export graph and duck the music while it plays —
// mirroring the live preview's ducking behaviour.
interface ClipAudioBus {
  ctx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  musicGain: GainNode; // the export's music gain, ducked during unmuted clips
  musicVolume: number; // base music level to duck from / restore to
}

// Render a clip's trimmed range to the canvas in real time, captured by the
// MediaRecorder via the canvas stream. Clip audio is mixed in when `audio` is
// provided and the clip isn't muted (Phase 5); otherwise the music bed carries
// the soundtrack alone. We fade in from / out to black so clips read as clean
// cuts regardless of what precedes or follows them.
async function renderClip(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clip: Clip,
  transSec: number,
  fit: 'cover' | 'contain',
  emit: FrameEmitter,
  audio?: ClipAudioBus,
): Promise<void> {
  const fps = 30;
  const fadeFrames = Math.max(1, Math.round(transSec * fps));
  const wantsAudio = !!audio && !clip.muted;
  const video = document.createElement('video');
  // Element audio flows into the graph only when unmuted; createMediaElementSource
  // below still respects the element's muted/volume, so muted clips stay silent.
  video.muted = !wantsAudio;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous'; // object URLs are same-origin; harmless otherwise
  video.src = clip.src;

  // Wire the clip's audio into the export graph + speakers, and duck the music.
  let clipSource: MediaElementAudioSourceNode | null = null;
  let clipGain: GainNode | null = null;
  if (wantsAudio && audio) {
    try {
      clipSource = audio.ctx.createMediaElementSource(video);
      clipGain = audio.ctx.createGain();
      clipGain.gain.value = 1;
      clipSource.connect(clipGain);
      clipGain.connect(audio.dest); // into the recording
      clipGain.connect(audio.ctx.destination); // audible to the user
      // Duck the music under the clip (same 0.3x target as the live preview).
      audio.musicGain.gain.setTargetAtTime(audio.musicVolume * 0.3, audio.ctx.currentTime, 0.15);
    } catch (err) {
      console.warn('Clip audio routing failed; rendering visuals only.', err);
    }
  }
  const restoreMusic = () => {
    if (wantsAudio && audio) {
      audio.musicGain.gain.setTargetAtTime(audio.musicVolume, audio.ctx.currentTime, 0.15);
    }
    try {
      clipGain?.disconnect();
      clipSource?.disconnect();
    } catch {
      /* already torn down */
    }
  };

  // Wait for metadata/data, then seek to the trim in-point.
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    video.onloadeddata = done;
    video.onerror = done;
    setTimeout(done, 5000);
  });
  if (_cancelled) {
    restoreMusic();
    video.removeAttribute('src');
    video.load();
    return;
  }

  const inPoint = Math.max(0, clip.inPoint);
  const endAt = clip.outPoint > inPoint ? clip.outPoint : video.duration || inPoint;
  if (Math.abs(video.currentTime - inPoint) > 0.05) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      video.onseeked = done;
      video.onerror = done;
      setTimeout(done, 5000);
      video.currentTime = inPoint;
    });
  }
  if (_cancelled) {
    restoreMusic();
    video.removeAttribute('src');
    video.load();
    return;
  }

  try {
    await video.play();
  } catch {
    /* a user gesture already unlocked playback; ignore late rejections */
  }

  // Real-time playback loop. Draw each frame; overlay a black veil that lifts
  // over the first `fadeFrames` frames (fade-in from black). NOTE: a clip plays
  // in wall-clock time (the <video> advances in real time), so this loop stays
  // real-time in BOTH engines — the WebCodecs emit must still pace itself here so
  // it samples one canvas frame per real video frame rather than spinning.
  let frame = 0;
  while (!_cancelled && !video.ended && video.currentTime < endAt) {
    drawVideoFrame(ctx, W, H, video, fit);
    if (frame < fadeFrames) {
      ctx.save();
      ctx.globalAlpha = 1 - frame / fadeFrames;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    frame++;
    await emit();
  }
  video.pause();
  restoreMusic(); // un-duck before the fade-out / next item

  // Fade out to black on the last frame so the next item starts clean.
  if (!_cancelled) {
    for (let f = 0; f <= fadeFrames; f++) {
      if (_cancelled) break;
      drawVideoFrame(ctx, W, H, video, fit);
      ctx.save();
      ctx.globalAlpha = f / fadeFrames;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      await emit();
    }
  }

  video.removeAttribute('src');
  video.load();
}

export type ExportProgress = (pct: number, text: string) => void;

export async function doExport(onProgress: ExportProgress): Promise<'done' | 'cancelled'> {
  const { settings, intro, outro, eventName } = useStore.getState();
  onProgress(0, 'Preparing canvas…');
  // Keep the screen awake for the whole render so a sleeping display can't stall
  // the real-time capture. No-op where unsupported; released at every exit below.
  await acquireWakeLock();

  // Build the same shuffled/capped list the preview uses. The exported file
  // renders clips in real time (Phase 4) AND mixes their audio when unmuted
  // (Phase 5), ducking the music under each clip — mirroring the live preview.
  const { list, hold: effHold } = buildPlaybackList();
  const photos = list.filter((m): m is Photo => m.kind === 'photo');
  const clips = list.filter((m): m is Clip => m.kind === 'clip');
  const clipSeconds = clips.reduce((s, c) => s + Math.max(0, c.outPoint - c.inPoint), 0);
  // Each clip is bracketed by a fade-in and fade-out to black (~2 transitions).
  const clipOverhead = clipSeconds + clips.length * 2 * settings.transitionDuration;
  // Section title cards interleaved before their anchor photos (linear runs only).
  const looped = computePlan().looped;
  const cards = sectionMap(photos, looped);
  const sectionTime = sectionTimeForList(photos, looped);
  // Canvas pixels for the chosen aspect + resolution (16:9 / 9:16 / 1:1).
  const [W, H, videoBitsPerSecond] = exportDimensions(settings.exportAspect, settings.exportRes);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // pre-load images (deduplicated — looped lists reuse the same photo)
  onProgress(0, 'Loading images…');
  const imageCache = new Map<string, HTMLImageElement>();
  for (let i = 0; i < photos.length; i++) {
    if (!imageCache.has(photos[i].url)) {
      imageCache.set(photos[i].url, await loadImage(photos[i].url));
    }
    onProgress((i / Math.max(1, photos.length)) * 10, 'Loading images…');
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

  // Audio bus handed to each clip so its sound mixes into the export (Phase 5).
  const clipAudioBus: ClipAudioBus = {
    ctx: audioCtx,
    dest: audioDest,
    musicGain: exportGain,
    musicVolume: settings.musicVolume,
  };
  const hasClipAudio = clips.some((c) => !c.muted);

  // Combine streams. Include the mixed audio track when there's music OR any
  // unmuted clip — otherwise the clip's own sound would never reach the file.
  const canvasStream = canvas.captureStream(30);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (decodedSongs.length || hasClipAudio) tracks.push(...audioDest.stream.getAudioTracks());
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
      (outro.title ? outro.duration : 0) +
      sectionTime +
      clipOverhead;
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
    (outro.title ? outro.duration : 0) +
    sectionTime +
    clipOverhead;

  const renderStart = performance.now();
  const tpl = TEMPLATES[settings.templateId] || TEMPLATES.default;
  const titleStyle = (tpl.intro && tpl.intro.titleStyle) || 'roman';

  const tick = () => {
    const elapsed = (performance.now() - renderStart) / 1000;
    const pct = Math.min(100, (elapsed / totalDuration) * 100);
    onProgress(pct, `Rendering… ${Math.round(pct)}% (${fmtTime(elapsed)} of ~${fmtTime(totalDuration)})`);
  };

  // Per-frame sink for the MediaRecorder engine: advance progress, then sleep one
  // frame so the canvas captureStream is paced to real time. (Phase B swaps in a
  // sink that grabs a VideoFrame and encodes it instead of sleeping.)
  const FPS = 30;
  const emit: FrameEmitter = async () => {
    tick();
    await sleep(1000 / FPS);
  };

  // Intro
  if (intro.title && !_cancelled) {
    await renderTextFrames(ctx, W, H, intro.title, intro.subtitle, intro.duration, emit, { titleStyle });
  }

  // Walk the unified media list: photos cross-fade with continuous Ken Burns
  // motion; clips play in real time bracketed by fades to/from black. A clip
  // breaks the photo crossfade chain, so a photo following a clip fades in from
  // black rather than crossfading from a frame that's no longer on screen.
  const transFrac = settings.transitionDuration / (settings.transitionDuration + effHold);
  const fit: 'cover' | 'contain' = settings.photoFit === 'cover' ? 'cover' : 'contain';
  let prevPlan: KbPlan | null = null;
  let prevImg: HTMLImageElement | null = null;
  let prevCaption: string | undefined;
  let prevWasClip = false;
  let firstItem = true;
  for (let i = 0; i < list.length && !_cancelled; i++) {
    const item = list[i];
    if (item.kind === 'clip') {
      // Cleanly close out a preceding photo so we don't jump-cut into the clip.
      if (prevImg && !prevWasClip) {
        await renderFadeOutKB(ctx, W, H, prevImg, prevPlan, 1.0, settings.transitionDuration, emit, prevCaption);
      }
      await renderClip(ctx, W, H, item, settings.transitionDuration, fit, emit, clipAudioBus);
      prevWasClip = true;
      prevImg = null;
      prevPlan = null;
      prevCaption = undefined;
      firstItem = false;
      continue;
    }

    // Photo
    const img = imageCache.get(item.url)!;
    const plan = ensureKbPlan(item, img.width, img.height);
    const caption = item.caption;
    const card = cards.get(item.id);
    if (card) {
      // Fade the previous photo out, render the section card, then fade this
      // photo in from black (so the card reads as a clean chapter break).
      if (prevImg && !prevWasClip) await renderFadeOutKB(ctx, W, H, prevImg, prevPlan, 1.0, 0.8, emit, prevCaption);
      await renderTextFrames(ctx, W, H, card.title, card.subtitle, card.duration, emit, { titleStyle });
      await renderFadeInKB(ctx, W, H, img, plan, 0, transFrac, settings.transitionDuration, emit, caption);
    } else if (!firstItem && prevImg && !prevWasClip) {
      await renderCrossfadeKB(
        ctx,
        W,
        H,
        prevImg,
        prevPlan,
        1.0, // outgoing photo at end of its motion
        img,
        plan,
        0,
        transFrac, // incoming photo starts its motion
        settings.transitionDuration,
        emit,
        prevCaption,
        caption,
      );
    } else {
      // First item overall, or the first photo coming out of a clip → fade in.
      await renderFadeInKB(ctx, W, H, img, plan, 0, transFrac, settings.transitionDuration, emit, caption);
    }
    // hold: continue this photo's motion from transFrac to 1.0
    await renderHoldKB(ctx, W, H, img, plan, transFrac, 1.0, effHold, emit, caption);
    prevPlan = plan;
    prevImg = img;
    prevCaption = caption;
    prevWasClip = false;
    firstItem = false;
  }

  // Outro
  if (outro.title && !_cancelled) {
    // If the last visible item was a photo, fade it out first; coming out of a
    // clip we're already on black, so go straight to the title.
    if (prevImg && !prevWasClip) await renderFadeOutKB(ctx, W, H, prevImg, prevPlan, 1.0, 0.8, emit, prevCaption);
    await renderTextFrames(ctx, W, H, outro.title, outro.subtitle, outro.duration, emit, { titleStyle });
  }

  recorder.stop();
  await donePromise;
  audioCtx.close();
  _recorder = null;
  await releaseWakeLock();

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
