import { useStore } from '../state/store';
import { buildPlaybackList, getIncludedSongs, getIncludedPhotos } from './planning';
import { applyLiveKenBurns, cancelKbAnims, pauseKbAnims, resumeKbAnims } from './kenBurns';
import { ensureAudioCtx, getAudioCtx, unlockAudio } from './audioContext';
import { TEMPLATES } from './templates';
import { sleep } from './utils';
import { toast } from '../state/toastStore';
import type { Photo, Song } from '../state/types';

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
  textOverlay: HTMLElement;
  textOverlayTitle: HTMLElement;
  textOverlaySubtitle: HTMLElement;
  playbackProgress: HTMLElement;
}

let refs: PlaybackRefs | null = null;
let currentImg: KbImg | null = null;
let nextImg: KbImg | null = null;
let playbackController: { cancelled: boolean } | null = null;

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
  if (!getIncludedPhotos().length) {
    toast('Add some photos first.', 'error');
    return;
  }

  const { list, hold } = buildPlaybackList();
  if (!list.length) {
    toast('No photos fit the current settings. Try widening the time limit or adding photos.', 'error');
    return;
  }

  const { overlay, playbackProgress } = refs;
  const { settings } = useStore.getState();

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
  const { overlay, imgA, imgB, textOverlay, playbackProgress } = refs;

  useStore.getState().setPlayback({ active: false });
  if (playbackController) playbackController.cancelled = true;
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
  photos: Photo[],
  holdSec: number,
  controller: { cancelled: boolean },
): Promise<void> {
  if (!refs) return;
  const { playbackProgress } = refs;
  const { intro, outro, settings } = useStore.getState();
  const totalDuration =
    intro.duration +
    outro.duration +
    photos.length * holdSec +
    Math.max(0, photos.length - 1) * settings.transitionDuration;
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

  // PHOTOS with cross-fade + Ken Burns motion
  for (let i = 0; i < photos.length; i++) {
    if (controller.cancelled) break;
    await waitForUnpaused(controller);
    await crossfadeToPhoto(photos[i], settings.transitionDuration, holdSec, controller);
    if (controller.cancelled) break;
    await waitWithPause(holdSec * 1000, controller);
  }

  // OUTRO
  if (!controller.cancelled && outro.title) {
    await fadeImagesOut(settings.transitionDuration);
    await showTextScreen(outro.title, outro.subtitle, outro.duration, controller);
  }

  clearInterval(progressTimer);
  playbackProgress.style.width = '100%';
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
  _controller: { cancelled: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    if (!refs || !currentImg || !nextImg) {
      resolve();
      return;
    }
    const { textOverlay } = refs;
    textOverlay.classList.remove('visible');
    const incoming = nextImg;
    const outgoing = currentImg;
    incoming.onload = () => {
      // Start motion now, lasting the full time this photo is visible
      // (its fade-in plus its hold), so movement is continuous and smooth.
      applyLiveKenBurns(incoming, photo, (transSec + holdSec) * 1000);
      incoming.classList.add('visible');
      outgoing.classList.remove('visible');
      setTimeout(() => {
        currentImg = incoming;
        nextImg = outgoing;
        resolve();
      }, transSec * 1000);
    };
    incoming.onerror = () => resolve();
    incoming.src = photo.url;
  });
}

async function fadeImagesOut(durationSec: number): Promise<void> {
  if (!refs) return;
  refs.imgA.classList.remove('visible');
  refs.imgB.classList.remove('visible');
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
