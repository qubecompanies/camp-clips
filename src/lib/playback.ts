import { useStore } from '../state/store';
import {
  buildPlaybackList,
  getIncludedSongs,
  getIncludedMedia,
  computePlan,
  sectionMap,
  sectionTimeForList,
} from './planning';
import { applyLiveKenBurns, cancelKbAnims, pauseKbAnims, resumeKbAnims } from './kenBurns';
import { ensureAudioCtx, getAudioCtx, getGainNode, unlockAudio } from './audioContext';
import { TEMPLATES } from './templates';
import { sleep } from './utils';
import { toast } from '../state/toastStore';
import type { Photo, Clip, MediaItem, Song } from '../state/types';

// ============ PLAYBACK ENGINE ============
// Ported verbatim from the prototype. Operates on the real DOM nodes the
// PlaybackOverlay component renders — the component registers them via
// setPlaybackRefs() on mount. State mutations route through the Zustand store
// (setPlayback) instead of the prototype's direct object writes; everything
// else is the same debugged logic.

interface KbImg extends HTMLImageElement {
  _kbAnim?: Animation | null;
}

interface PlaybackRefs {
  overlay: HTMLElement;
  imgA: KbImg;
  imgB: KbImg;
  video: HTMLVideoElement;
  textOverlay: HTMLElement;
  textOverlayTitle: HTMLElement;
  textOverlaySubtitle: HTMLElement;
  caption: HTMLElement;
  playbackProgress: HTMLElement;
}

// Show or hide the photo caption overlay. Text is set before revealing so the
// CSS opacity transition (tied to --fade-duration) fades it in with the photo.
function setCaption(text?: string): void {
  if (!refs) return;
  const el = refs.caption;
  if (text && text.trim()) {
    el.textContent = text;
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

let refs: PlaybackRefs | null = null;
let currentImg: KbImg | null = null;
let nextImg: KbImg | null = null;
let playbackController: { cancelled: boolean } | null = null;

// Single-slot decode warmer. We hold AT MOST one extra decoded image (the next
// photo) so the browser has it ready before its slide begins — this kills the
// hitch that used to happen because the decode landed exactly when Ken Burns
// motion started. Bounded to one image to stay within the memory-safe budget
// (the two visible <img> elements + this = 3 decoded images max at any time).
let _preloadImg: HTMLImageElement | null = null;
let _preloadUrl: string | null = null;
function preloadPhoto(url: string): void {
  if (_preloadUrl === url) return;
  _preloadUrl = url;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  _preloadImg = img;
  if (img.decode) img.decode().catch(() => {});
}
function clearPreload(): void {
  _preloadImg = null;
  _preloadUrl = null;
}

// Music playback (Web Audio API)
let musicQueue: Song[] = [];
let musicQueueIndex = 0;
let currentMusicSource: AudioBufferSourceNode | null = null;

export function setPlaybackRefs(r: PlaybackRefs): void {
  refs = r;
  currentImg = r.imgA;
  nextImg = r.imgB;
}

export function clearPlaybackRefs(): void {
  refs = null;
  currentImg = null;
  nextImg = null;
}

export async function startPlayback(): Promise<void> {
  if (!refs) return;
  if (!getIncludedMedia().length) {
    toast('Add some photos or clips first.', 'error');
    return;
  }

  const { list, hold } = buildPlaybackList();
  if (!list.length) {
    toast('No photos fit the current settings. Try widening the time limit or adding photos.', 'error');
    return;
  }

  const { overlay, playbackProgress } = refs;
  const { settings, sections } = useStore.getState();

  // Section cards only play in linear order — warn (before fullscreen) if the
  // current settings would hide them, so the omission isn't a surprise.
  if (sections.length && (settings.shuffleOnPlay || computePlan().looped)) {
    toast('Section cards are skipped when photos are shuffled or looped.', 'info');
  }

  useStore.getState().setPlayback({ active: true, paused: false });
  overlay.classList.add('active');
  if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});

  document.documentElement.style.setProperty('--fade-duration', settings.transitionDuration * 1000 + 'ms');

  playbackController = { cancelled: false };
  startMusic();

  try {
    await runSlideshowSequence(list, hold, playbackController);
  } catch (e) {
    console.error(e);
  }

  if (!playbackController.cancelled) stopPlayback();
}

export function stopPlayback(): void {
  if (!refs) return;
  const { overlay, imgA, imgB, video, textOverlay, playbackProgress } = refs;

  useStore.getState().setPlayback({ active: false });
  if (playbackController) playbackController.cancelled = true;
  clearPreload();
  // Stop & detach the clip video so its decoder + audio release immediately.
  try {
    video.pause();
  } catch (e) {
    /* ignore */
  }
  video.classList.remove('visible');
  video.removeAttribute('src');
  try {
    video.load();
  } catch (e) {
    /* ignore */
  }
  duckMusic(1); // restore music gain in case we stopped mid-clip while ducked
  overlay.classList.remove('active');
  cancelKbAnims([imgA, imgB]);
  imgA.style.transform = 'none';
  imgB.style.transform = 'none';
  imgA.classList.remove('kb-cover', 'kb-contain');
  imgB.classList.remove('kb-cover', 'kb-contain');
  // Stop Web Audio API music source
  if (currentMusicSource) {
    try {
      currentMusicSource.stop();
    } catch (e) {
      /* ignore */
    }
    try {
      currentMusicSource.disconnect();
    } catch (e) {
      /* ignore */
    }
    currentMusicSource = null;
  }
  imgA.classList.remove('visible');
  imgB.classList.remove('visible');
  textOverlay.classList.remove('visible');
  refs.caption.classList.remove('visible');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  playbackProgress.style.width = '0%';
}

export function togglePause(): void {
  const paused = !useStore.getState().playback.paused;
  useStore.getState().setPlayback({ paused });
  if (!refs) return;
  const { imgA, imgB } = refs;
  if (paused) {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    pauseKbAnims([imgA, imgB]);
  } else {
    unlockAudio(); // re-assert audio context within this gesture
    resumeKbAnims([imgA, imgB]);
  }
}

async function waitForUnpaused(controller: { cancelled: boolean }): Promise<void> {
  while (useStore.getState().playback.paused && !controller.cancelled) {
    await sleep(100);
  }
}

async function runSlideshowSequence(
  items: MediaItem[],
  holdSec: number,
  controller: { cancelled: boolean },
): Promise<void> {
  if (!refs) return;
  const { playbackProgress } = refs;
  const { intro, outro, settings } = useStore.getState();
  const looped = computePlan().looped;
  const cards = sectionMap(items, looped);
  // Warm the first photo while the intro card is on screen (only if it's a photo).
  if (items.length && items[0].kind === 'photo') preloadPhoto(items[0].url);
  // Each item costs its own screen time: photos hold for `holdSec`, clips play
  // their trimmed window. Plus one transition between adjacent items.
  let mediaTime = 0;
  for (const it of items) {
    mediaTime += it.kind === 'clip' ? Math.max(0, it.outPoint - it.inPoint) : holdSec;
  }
  const totalDuration =
    intro.duration +
    outro.duration +
    mediaTime +
    Math.max(0, items.length - 1) * settings.transitionDuration +
    sectionTimeForList(items, looped);
  const startTime = performance.now();
  const progressTimer = window.setInterval(() => {
    if (controller.cancelled) {
      clearInterval(progressTimer);
      return;
    }
    const pct = Math.min(100, ((performance.now() - startTime) / 1000 / totalDuration) * 100);
    playbackProgress.style.width = pct + '%';
  }, 100);

  // INTRO
  if (intro.title) {
    await showTextScreen(intro.title, intro.subtitle, intro.duration, controller);
    if (controller.cancelled) {
      clearInterval(progressTimer);
      return;
    }
  }

  // MEDIA — photos cross-fade with Ken Burns; clips play inline (audio ducks music)
  for (let i = 0; i < items.length; i++) {
    if (controller.cancelled) break;
    await waitForUnpaused(controller);
    const item = items[i];
    // A section card anchored to this item plays first: fade to black, show the
    // card, then the item fades in (crossfade-from-black).
    const card = cards.get(item.id);
    if (card) {
      await fadeImagesOut(settings.transitionDuration);
      if (controller.cancelled) break;
      await showTextScreen(card.title, card.subtitle, card.duration, controller);
      if (controller.cancelled) break;
    }
    if (item.kind === 'clip') {
      await crossfadeToClip(item, settings.transitionDuration, controller);
      if (controller.cancelled) break;
    } else {
      await crossfadeToPhoto(item, settings.transitionDuration, holdSec, controller);
      if (controller.cancelled) break;
      await waitWithPause(holdSec * 1000, controller);
    }
    // Decode the NEXT photo during this slide so it starts jank-free.
    const next = items[i + 1];
    if (next && next.kind === 'photo') preloadPhoto(next.url);
  }

  // OUTRO
  if (!controller.cancelled && outro.title) {
    await fadeImagesOut(settings.transitionDuration);
    await showTextScreen(outro.title, outro.subtitle, outro.duration, controller);
  }

  clearInterval(progressTimer);
  playbackProgress.style.width = '100%';
}

// Smoothly ramp the music gain. multiplier 0.3 ducks under a clip's own audio;
// 1 restores. setTargetAtTime gives a gentle ~0.15s glide instead of a click.
function duckMusic(multiplier: number): void {
  const gain = getGainNode();
  const ctx = getAudioCtx();
  if (!gain || !ctx) return;
  const base = useStore.getState().settings.musicVolume;
  try {
    gain.gain.setTargetAtTime(base * multiplier, ctx.currentTime, 0.15);
  } catch (e) {
    /* ignore */
  }
}

// Play one clip inline: seek to its in-point, fade the <video> in over the
// images, run until the out-point (honoring pause), duck the music under the
// clip's own audio, then fade back out. Clips are fixed-length — no hold after.
async function crossfadeToClip(
  clip: Clip,
  transSec: number,
  controller: { cancelled: boolean },
): Promise<void> {
  if (!refs) return;
  const { video, imgA, imgB, textOverlay } = refs;
  const { settings } = useStore.getState();
  textOverlay.classList.remove('visible');
  setCaption(); // captions are photo-only — hide while a clip plays

  video.style.objectFit = settings.photoFit; // match the photo framing choice
  video.muted = clip.muted;
  video.src = clip.src;
  // Seek to the in-point and wait until a frame is actually ready to show.
  try {
    video.currentTime = clip.inPoint;
  } catch (e) {
    /* ignore */
  }
  await new Promise<void>((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.onseeked = null;
      video.onloadeddata = null;
      video.onerror = null;
      res();
    };
    video.onseeked = finish;
    video.onloadeddata = finish;
    video.onerror = finish;
    window.setTimeout(finish, 2500); // safety: never hang the show on a bad clip
  });
  if (controller.cancelled) return;

  // Reveal the clip; hide the still images underneath.
  video.classList.add('visible');
  imgA.classList.remove('visible');
  imgB.classList.remove('visible');
  if (!clip.muted) duckMusic(0.3);

  try {
    await video.play();
  } catch (e) {
    /* autoplay may reject; the loop below still advances on currentTime */
  }

  // Hold the clip on screen until its out-point, pausing in lockstep with the show.
  while (!controller.cancelled) {
    if (useStore.getState().playback.paused) {
      if (!video.paused) video.pause();
      await sleep(80);
      continue;
    }
    if (video.paused && !video.ended) {
      try {
        await video.play();
      } catch (e) {
        /* ignore */
      }
    }
    if (video.ended || video.currentTime >= clip.outPoint) break;
    await sleep(80);
  }

  try {
    video.pause();
  } catch (e) {
    /* ignore */
  }
  if (!clip.muted) duckMusic(1); // restore music

  // Fade the clip out, then release its decoder before the next item.
  video.classList.remove('visible');
  await sleep(transSec * 1000);
  if (!controller.cancelled) {
    video.removeAttribute('src');
    try {
      video.load();
    } catch (e) {
      /* ignore */
    }
  }
}

async function waitWithPause(ms: number, controller: { cancelled: boolean }): Promise<void> {
  let remaining = ms;
  while (remaining > 0 && !controller.cancelled) {
    if (useStore.getState().playback.paused) {
      await sleep(80);
      continue;
    }
    const tick = Math.min(80, remaining);
    await sleep(tick);
    remaining -= tick;
  }
}

async function showTextScreen(
  title: string,
  subtitle: string,
  duration: number,
  controller: { cancelled: boolean },
): Promise<void> {
  if (!refs) return;
  const { imgA, imgB, textOverlay, textOverlayTitle, textOverlaySubtitle } = refs;
  imgA.classList.remove('visible');
  imgB.classList.remove('visible');
  setCaption(); // no photo caption over intro/outro/section cards
  textOverlayTitle.textContent = title;
  textOverlaySubtitle.textContent = subtitle || '';
  // Apply italic styling based on active template
  const tpl = TEMPLATES[useStore.getState().settings.templateId] || TEMPLATES.default;
  const italic = !!(tpl.intro && tpl.intro.titleStyle === 'italic');
  textOverlay.classList.toggle('italic', italic);
  textOverlay.classList.add('visible');
  await waitWithPause(duration * 1000, controller);
  textOverlay.classList.remove('visible');
  await sleep(800);
}

async function crossfadeToPhoto(
  photo: Photo,
  transSec: number,
  holdSec: number,
  controller: { cancelled: boolean },
): Promise<void> {
  if (!refs || !currentImg || !nextImg) return;
  const { textOverlay } = refs;
  textOverlay.classList.remove('visible');
  const incoming = nextImg;
  const outgoing = currentImg;
  incoming.src = photo.url;

  // Wait until the image is FULLY DECODED before we reveal it and start motion.
  // img.decode() resolves only when the bitmap is paint-ready, so the decode
  // cost never lands on the first animation frames (that was the visible
  // stutter). Thanks to preloadPhoto() during the prior hold this is usually
  // instant. Falls back to the load event if decode() rejects.
  try {
    if (incoming.decode) await incoming.decode();
  } catch (e) {
    await new Promise<void>((res) => {
      incoming.onload = () => res();
      incoming.onerror = () => res();
    });
  }
  if (controller.cancelled) return;

  // Start motion now, lasting the full time this photo is visible (its fade-in
  // plus its hold), so movement is continuous and smooth.
  applyLiveKenBurns(incoming, photo, (transSec + holdSec) * 1000);
  incoming.classList.add('visible');
  outgoing.classList.remove('visible');
  setCaption(photo.caption); // fades in with the photo; clears if it has none
  await sleep(transSec * 1000);
  currentImg = incoming;
  nextImg = outgoing;
}

async function fadeImagesOut(durationSec: number): Promise<void> {
  if (!refs) return;
  refs.imgA.classList.remove('visible');
  refs.imgB.classList.remove('visible');
  setCaption(); // fade any caption out alongside the image
  await sleep(durationSec * 1000);
}

// ===== MUSIC PLAYBACK (Web Audio API) =====
function startMusic(): void {
  const songs = getIncludedSongs();
  if (!songs.length) return;
  musicQueue = songs.slice();
  musicQueueIndex = 0;
  playNextSong();
}

async function playNextSong(): Promise<void> {
  if (!useStore.getState().playback.active) return;

  // Stop any existing source
  if (currentMusicSource) {
    try {
      currentMusicSource.stop();
    } catch (e) {
      /* ignore */
    }
    try {
      currentMusicSource.disconnect();
    } catch (e) {
      /* ignore */
    }
    currentMusicSource = null;
  }

  const { settings } = useStore.getState();
  if (musicQueueIndex >= musicQueue.length) {
    if (settings.loopMusic) {
      musicQueueIndex = 0;
    } else {
      return;
    }
  }

  const song = musicQueue[musicQueueIndex++];
  if (!song.arrayBuffer) {
    console.warn('Song has no buffer, skipping:', song.name);
    playNextSong();
    return;
  }

  try {
    const { ctx, gain } = ensureAudioCtx();
    gain.gain.value = settings.musicVolume;
    // decodeAudioData consumes the buffer, so we slice a copy
    const audioBuffer = await ctx.decodeAudioData(song.arrayBuffer.slice(0));
    if (!useStore.getState().playback.active) return; // user may have stopped while decoding

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gain);
    const thisSource = source;
    source.onended = () => {
      if (currentMusicSource === thisSource && useStore.getState().playback.active) {
        playNextSong();
      }
    };
    source.start(0);
    currentMusicSource = source;
    console.log('[audio] playing:', song.name, '| ctx state:', ctx.state, '| volume:', gain.gain.value);
  } catch (err) {
    console.error('Failed to play song', song.name, err);
    playNextSong(); // try the next one
  }
}
