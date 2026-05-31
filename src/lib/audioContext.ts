import { useStore } from '../state/store';

// ============ AUDIO CONTEXT (shared) ============
// We use the Web Audio API for all song decoding and playback because some
// sandboxed webviews block both blob: and large data: URLs for <audio>
// elements. Web Audio API works on raw ArrayBuffers directly — no URLs needed.
let _appAudioCtx: AudioContext | null = null;
let _appGainNode: GainNode | null = null;

export function getGainNode(): GainNode | null {
  return _appGainNode;
}

export function ensureAudioCtx(): { ctx: AudioContext; gain: GainNode } {
  if (!_appAudioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    _appAudioCtx = new Ctx();
    _appGainNode = _appAudioCtx.createGain();
    _appGainNode.gain.value = useStore.getState().settings.musicVolume;
    _appGainNode.connect(_appAudioCtx.destination);
  }
  if (_appAudioCtx.state === 'suspended') {
    _appAudioCtx.resume().catch(() => {});
  }
  return { ctx: _appAudioCtx, gain: _appGainNode! };
}

export function getAudioCtx(): AudioContext | null {
  return _appAudioCtx;
}

// iOS audio unlock — MUST be called synchronously inside a user gesture
// (button click). Plays a tiny silent buffer through the AudioContext,
// which iOS WebKit treats as the "first user-initiated sound", unlocking
// the context for all subsequent async audio work in the session.
export function unlockAudio(): void {
  const { ctx } = ensureAudioCtx();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  try {
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silentBuffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    console.warn('[audio] silent unlock failed', e);
  }
  console.log('[audio] unlock attempted, context state:', ctx.state);
}
