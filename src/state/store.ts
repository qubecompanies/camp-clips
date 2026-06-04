import { create } from 'zustand';
import type { Photo, Clip, MediaItem, Song, Settings, TextScreen, PlaybackState, SectionCard, LibraryTrack } from './types';
import { processImageFile, rotateImage } from '../lib/imageProcessing';
import { analyzePhoto, findDuplicateIds, type PhotoAnalysis } from '../lib/photoAnalysis';
import { ingestVideo, convertToH264, extractStillFrame } from '../lib/videoIngest';
import { partitionLivePhotos } from '../lib/livePhotos';
import { readCaptureTime } from '../lib/exif';
import { ensureAudioCtx, getGainNode } from '../lib/audioContext';
import { trackUrl } from '../lib/musicLibrary';
import { isImageFile, isAudioFile, isVideoFile, uid, shuffle } from '../lib/utils';
import { loadPersistedSettings, persistSettings } from '../lib/preferences';
import { persistAutosave, loadAutosave } from '../lib/autosave';
import { toast } from './toastStore';

// Defaults the app falls back to on first run (or when a persisted blob is
// missing/older keys). Persisted preferences are merged OVER these at startup,
// so unknown/older keys degrade gracefully to the default.
const DEFAULT_SETTINGS: Settings = {
  photoDuration: 4,
  transitionDuration: 1.5,
  musicVolume: 0.7,
  loopMusic: true,
  kenBurns: true,
  kenBurnsIntensity: 0.09, // moderate: ~9% zoom
  shuffleOnPlay: false,
  showLength: 'all',
  timeLimitMin: 5,
  fillBehavior: 'loop',
  photoFit: 'contain', // default: show the whole photo (letterbox), quality over fill
  theme: 'light',
  exportRes: 1080,
  exportFmt: 'webm',
  exportAspect: '16:9',
  templateId: 'default',
};

export interface AppState {
  eventName: string;
  // ONE ordered list of everything that occupies a slide slot: photos and clips,
  // freely interleaved. The unified grid renders this in order; playback walks it.
  // Use the selectPhotos/selectClips helpers below for filtered views.
  media: MediaItem[];
  songs: Song[];
  sections: SectionCard[];
  intro: TextScreen;
  outro: TextScreen;
  settings: Settings;
  playback: PlaybackState;

  // setters
  setEventName: (v: string) => void;
  setIntro: (patch: Partial<TextScreen>) => void;
  setOutro: (patch: Partial<TextScreen>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setPlayback: (patch: Partial<PlaybackState>) => void;

  // media actions
  addPhotos: (fileList: FileList | File[]) => Promise<void>;
  addVideos: (fileList: FileList | File[]) => Promise<void>;
  convertClip: (id: string) => Promise<void>;
  useClipAsPhoto: (id: string) => Promise<void>;
  setClipTrim: (id: string, inPoint: number, outPoint: number) => void;
  setClipMuted: (id: string, muted: boolean) => void;
  rotatePhoto: (id: string, quarterTurns: number) => Promise<void>;
  setPhotoCaption: (id: string, caption: string) => void;
  // smart selection (blur + near-duplicate)
  scanPhotos: () => Promise<void>;
  excludeFlagged: () => void;
  clearScanFlags: () => void;
  addSongs: (fileList: FileList | File[]) => Promise<void>;
  addBuiltInTrack: (track: LibraryTrack) => Promise<void>;
  removeMedia: (id: string) => void;
  removeSong: (id: string) => void;
  clearMedia: () => void;
  toggleMedia: (id: string) => void;
  reorderMedia: (orderedIds: string[]) => void;
  reorderSongs: (orderedIds: string[]) => void;
  shuffleMedia: () => void;
  sortByDate: () => void;

  // section title cards
  addSection: (beforePhotoId: string) => void;
  updateSection: (id: string, patch: Partial<SectionCard>) => void;
  removeSection: (id: string) => void;

  // media edit modal (rotate photos / trim+mute clips)
  editingId: string | null;
  openEditor: (id: string) => void;
  closeEditor: () => void;

  // text autosave restore (silent; media binaries never persisted)
  restoreAutosave: () => boolean;

  // project load
  replaceProject: (data: {
    eventName: string;
    intro: TextScreen;
    outro: TextScreen;
    settings: Settings;
  }) => void;
}

export const useStore = create<AppState>((set, get) => ({
  eventName: '',
  media: [],
  songs: [],
  sections: [],
  intro: { title: '', subtitle: '', duration: 5 },
  outro: { title: '', subtitle: '', duration: 5 },
  // Merge any persisted preferences over the defaults so the app remembers the
  // user's last setup (framing, durations, motion, theme, export defaults).
  settings: { ...DEFAULT_SETTINGS, ...(loadPersistedSettings() ?? {}) },
  playback: { active: false, paused: false },
  editingId: null,

  setEventName: (v) => set({ eventName: v }),
  setIntro: (patch) => set((s) => ({ intro: { ...s.intro, ...patch } })),
  setOutro: (patch) => set((s) => ({ outro: { ...s.outro, ...patch } })),
  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    // Live-update audio gain if music is playing
    if (patch.musicVolume !== undefined) {
      const gain = getGainNode();
      if (gain) gain.gain.value = patch.musicVolume;
    }
    // Silently remember the user's preferences (debounced; see preferences.ts).
    persistSettings(get().settings);
  },
  setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),

  addPhotos: async (fileList) => {
    const all = Array.from(fileList);
    const files = all.filter(isImageFile);
    const allVideos = all.filter(isVideoFile);
    if (!files.length) {
      // Videos can arrive mixed in via the folder picker; route them through the
      // clip pipeline instead of rejecting.
      if (allVideos.length) {
        await get().addVideos(allVideos);
      } else {
        toast("Those don't look like image files. Try JPG, PNG, or HEIC.", 'error');
      }
      return;
    }

    // Live Photo pairing: when a still and its same-basename motion clip arrive
    // together (the iPhone IMG_1234.HEIC + IMG_1234.MOV pair), keep the still and
    // drop the clip. Unpaired videos still get added as real clips afterward.
    const { keptVideos, pairedCount } = partitionLivePhotos(files, allVideos);

    // Soft warning for very large imports — memory pressure can crash older devices
    if (files.length > 100) {
      if (
        !confirm(
          `That's ${files.length} photos. Camp Clips can handle it, but on older devices or phones this may take a few minutes and use significant memory. Continue?`,
        )
      ) {
        return;
      }
    }

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const hasHeic = files.some((f) => /\.(heic|heif)$/i.test(f.name));
    toast(
      hasHeic
        ? `Processing ${files.length} photo${files.length === 1 ? '' : 's'} (converting HEIC)…`
        : `Processing ${files.length} photo${files.length === 1 ? '' : 's'}…`,
      'info',
    );

    let added = 0;
    let failed = 0;
    for (const file of files) {
      try {
        // Read capture time from the ORIGINAL bytes — our canvas re-encode
        // strips EXIF, and HEIC loses it during conversion, so we must read it
        // here before processImageFile() touches the file.
        const capturedAt = (await readCaptureTime(file)) ?? undefined;
        const result = await processImageFile(file);
        const photo: Photo = {
          id: uid(),
          kind: 'photo',
          name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          url: result.url,
          revocable: result.revocable,
          width: result.width,
          height: result.height,
          included: true,
          capturedAt,
          face: result.face,
        };
        set((s) => ({ media: [...s.media, photo] }));
        added++;
        // CRITICAL: yield to the browser so it can garbage-collect between photos.
        // Without this, the loop runs hot and memory keeps climbing even though
        // each individual photo's intermediate data should be eligible for GC.
        await new Promise((r) => setTimeout(r, 0));
      } catch (err) {
        console.error('Failed to process', file.name, err);
        failed++;
        // Don't silently drop it — surface the failure as a visible, removable
        // tile so the user knows exactly which file didn't load (the grid renders
        // a loadError placeholder). Keep the ORIGINAL filename (e.g. .heic) so the
        // error hint can be format-aware. Excluded, zero-dimension, no url — it
        // never reaches playback or export.
        const placeholder: Photo = {
          id: uid(),
          kind: 'photo',
          name: file.name,
          url: '',
          revocable: false,
          width: 0,
          height: 0,
          included: false,
          loadError: true,
        };
        set((s) => ({ media: [...s.media, placeholder] }));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (added > 0 && failed === 0) {
      toast(`Added ${added} photo${added === 1 ? '' : 's'}.`, 'success');
    } else if (added > 0 && failed > 0) {
      toast(`Added ${added} photo${added === 1 ? '' : 's'}; ${failed} flagged as unreadable in the grid.`, 'info');
    } else if (failed > 0) {
      toast(
        `${failed} photo${failed === 1 ? " couldn't" : "s couldn't"} load — flagged in the grid so you can remove or replace ${failed === 1 ? 'it' : 'them'}.`,
        'error',
      );
    }

    if (pairedCount > 0) {
      toast(
        `${pairedCount} Live Photo${pairedCount === 1 ? '' : 's'} added as still${pairedCount === 1 ? '' : 's'} (motion clip skipped).`,
        'info',
      );
    }
    // Any videos that weren't half of a Live Photo become real clips.
    if (keptVideos.length) {
      await get().addVideos(keptVideos);
    }
  },

  addVideos: async (fileList) => {
    const files = Array.from(fileList).filter(isVideoFile);
    if (!files.length) {
      toast("Those don't look like video files. Try MP4 or MOV.", 'error');
      return;
    }

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    toast(`Processing ${files.length} clip${files.length === 1 ? '' : 's'}…`, 'info');

    let ready = 0;
    let needsConvert = 0;
    let failed = 0;
    const photoDuration = get().settings.photoDuration;
    for (const file of files) {
      try {
        const result = await ingestVideo(file);
        const outPoint = result.decodable ? Math.min(result.naturalDuration, photoDuration) : 0;
        const clip: Clip = {
          id: uid(),
          kind: 'clip',
          name: file.name,
          src: result.src,
          revocable: result.revocable,
          posterUrl: result.poster?.url,
          posterRevocable: result.poster?.revocable,
          naturalDuration: result.naturalDuration,
          width: result.width,
          height: result.height,
          included: true,
          inPoint: 0,
          outPoint,
          muted: false,
          status: result.decodable ? 'ready' : 'needs-convert',
        };
        set((s) => ({ media: [...s.media, clip] }));
        if (result.decodable) ready++;
        else needsConvert++;
        // Yield between clips so the browser can reclaim decode memory.
        await new Promise((r) => setTimeout(r, 0));
      } catch (err) {
        console.error('Failed to ingest video', file.name, err);
        failed++;
      }
    }

    if (ready > 0 && needsConvert === 0 && failed === 0) {
      toast(`Added ${ready} clip${ready === 1 ? '' : 's'}.`, 'success');
    } else if (needsConvert > 0) {
      toast(
        `Added ${ready + needsConvert} clip${ready + needsConvert === 1 ? '' : 's'}. ${needsConvert} need${
          needsConvert === 1 ? 's' : ''
        } converting to play here (iPhone HEVC).`,
        'info',
      );
    } else if (failed > 0 && ready === 0) {
      toast(`Couldn't read ${failed} clip${failed === 1 ? '' : 's'}.`, 'error');
    } else if (ready > 0) {
      toast(`Added ${ready} clip${ready === 1 ? '' : 's'}; ${failed} couldn't be read.`, 'info');
    }
  },

  convertClip: async (id) => {
    const clip = get().media.find((m): m is Clip => m.kind === 'clip' && m.id === id);
    if (!clip || clip.status === 'converting') return;

    // We re-fetch the original bytes from the object URL we minted at ingest.
    let sourceFile: File;
    try {
      const res = await fetch(clip.src);
      const blob = await res.blob();
      sourceFile = new File([blob], clip.name, { type: blob.type || 'video/quicktime' });
    } catch (err) {
      console.error('Convert: could not read source for', clip.name, err);
      toast(`Couldn't read "${clip.name}" to convert.`, 'error');
      return;
    }

    set((s) => ({
      media: s.media.map((m) =>
        m.kind === 'clip' && m.id === id ? { ...m, status: 'converting' as const, convertProgress: 0 } : m,
      ),
    }));
    toast(`Converting "${clip.name}" on your device… this can take a minute.`, 'info');

    try {
      const mp4 = await convertToH264(sourceFile, (ratio) => {
        set((s) => ({
          media: s.media.map((m) => (m.kind === 'clip' && m.id === id ? { ...m, convertProgress: ratio } : m)),
        }));
      });
      const converted = new File([mp4], clip.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' });

      // Re-ingest the H.264 result to grab a poster + true dimensions.
      const result = await ingestVideo(converted);
      if (!result.decodable) {
        throw new Error('converted file still does not decode');
      }
      const photoDuration = get().settings.photoDuration;
      // Revoke the old (HEVC) object URL now that we've replaced it.
      const old = get().media.find((m): m is Clip => m.kind === 'clip' && m.id === id);
      if (old?.revocable) URL.revokeObjectURL(old.src);

      set((s) => ({
        media: s.media.map((m) =>
          m.kind === 'clip' && m.id === id
            ? {
                ...m,
                src: result.src,
                revocable: result.revocable,
                posterUrl: result.poster?.url,
                posterRevocable: result.poster?.revocable,
                naturalDuration: result.naturalDuration,
                width: result.width,
                height: result.height,
                outPoint: Math.min(result.naturalDuration, photoDuration),
                status: 'ready' as const,
                convertProgress: undefined,
              }
            : m,
        ),
      }));
      toast(`"${clip.name}" is ready to play.`, 'success');
    } catch (err) {
      console.error('Convert failed for', clip.name, err);
      set((s) => ({
        media: s.media.map((m) =>
          m.kind === 'clip' && m.id === id ? { ...m, status: 'error' as const, convertProgress: undefined } : m,
        ),
      }));
      toast(`Couldn't convert "${clip.name}". You can still play it after converting on your computer.`, 'error');
    }
  },

  // Promote a (short) clip to a still photo using its middle frame. The clip's
  // slot is replaced in place so order is preserved, and its object URLs are
  // freed. Used by the "Use as photo" chip on short clips / Live Photos.
  useClipAsPhoto: async (id) => {
    const clip = get().media.find((m): m is Clip => m.kind === 'clip' && m.id === id);
    if (!clip) return;
    if (clip.status !== 'ready' || !clip.width || !clip.height) {
      toast('This clip needs to play here before it can become a photo.', 'info');
      return;
    }

    // Middle frame — the locked "still = middle frame" decision.
    const mid = clip.naturalDuration > 0 ? clip.naturalDuration / 2 : 0;
    const frame = await extractStillFrame(clip.src, clip.width, clip.height, mid);
    if (!frame) {
      toast(`Couldn't grab a frame from "${clip.name}".`, 'error');
      return;
    }

    const photo: Photo = {
      id: uid(),
      kind: 'photo',
      name: clip.name.replace(/\.[^.]+$/, '.jpg'),
      url: frame.url,
      revocable: frame.revocable,
      width: frame.width,
      height: frame.height,
      included: clip.included,
    };
    // Swap the clip out for the photo at the same position.
    set((s) => ({ media: s.media.map((m) => (m.id === id ? photo : m)) }));
    // Free the clip's now-unused object URLs.
    if (clip.revocable) URL.revokeObjectURL(clip.src);
    if (clip.posterRevocable && clip.posterUrl) URL.revokeObjectURL(clip.posterUrl);
    toast(`Using a still from "${clip.name}".`, 'success');
  },

  // ===== Media edit modal ===== (editingId initial value is set in the state block above)
  openEditor: (id) => set({ editingId: id }),
  closeEditor: () => set({ editingId: null }),

  // Restore the last autosaved text (event name + intro/outro + section cards).
  // Called once when the Editor mounts. Media/songs are never persisted, so this
  // only rehydrates text. Section cards anchor to photo ids that won't exist on a
  // fresh load — they're harmless (just never render) until their anchor returns.
  // Returns true if something was actually restored so the caller can toast.
  restoreAutosave: () => {
    const snap = loadAutosave();
    if (!snap) return false;
    set((s) => ({
      eventName: snap.eventName ?? s.eventName,
      intro: snap.intro ?? s.intro,
      outro: snap.outro ?? s.outro,
      sections: Array.isArray(snap.sections) ? snap.sections : s.sections,
    }));
    return true;
  },

  // Set a clip's trim window. Clamps both points into [0, naturalDuration] and
  // enforces a minimum playable gap so the in/out handles can't cross or collapse.
  setClipTrim: (id, inPoint, outPoint) => {
    const MIN_GAP = 0.3; // seconds — shortest clip we allow after trimming
    set((s) => ({
      media: s.media.map((m) => {
        if (m.id !== id || m.kind !== 'clip') return m;
        const dur = m.naturalDuration || 0;
        let inP = Math.max(0, Math.min(inPoint, dur));
        let outP = Math.max(0, Math.min(outPoint, dur));
        if (outP - inP < MIN_GAP) {
          // Whichever handle the caller moved last wins; nudge the other to keep the gap.
          if (inP !== m.inPoint) inP = Math.max(0, outP - MIN_GAP);
          else outP = Math.min(dur, inP + MIN_GAP);
        }
        return { ...m, inPoint: inP, outPoint: outP };
      }),
    }));
  },

  setClipMuted: (id, muted) =>
    set((s) => ({
      media: s.media.map((m) => (m.id === id && m.kind === 'clip' ? { ...m, muted } : m)),
    })),

  // Set (or clear) a photo's caption. Captions live on the in-memory Photo only —
  // like the photo binaries themselves they are never serialized to localStorage,
  // and they can't re-anchor across a reload, so they're intentionally not part of
  // autosave. Empty/whitespace clears the caption back to undefined.
  setPhotoCaption: (id, caption) =>
    set((s) => ({
      media: s.media.map((m) =>
        m.id === id && m.kind === 'photo' ? { ...m, caption: caption.trim() ? caption : undefined } : m,
      ),
    })),

  // ===== Smart selection: flag likely-blurry + near-duplicate photos =====
  // Runs entirely on-device over the downscaled photo URLs (see photoAnalysis.ts).
  // Sets `blurry`/`duplicate` flags but never removes or even excludes anything —
  // the user reviews the flags and decides (excludeFlagged / manual toggle). This
  // respects the standing "don't delete without being told" rule.
  scanPhotos: async () => {
    const photos = get().media.filter((m): m is Photo => m.kind === 'photo' && !m.loadError);
    if (photos.length < 2) {
      toast('Add at least two photos to scan for blurry or duplicate shots.', 'info');
      return;
    }
    toast(`Scanning ${photos.length} photo${photos.length === 1 ? '' : 's'} for blurry & duplicate shots…`, 'info');

    const results = new Map<string, PhotoAnalysis>();
    for (const p of photos) {
      const a = await analyzePhoto(p.url);
      if (a) results.set(p.id, a);
      // Yield so a big set doesn't lock the UI / spike memory.
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!results.size) {
      toast("Couldn't analyze these photos.", 'error');
      return;
    }

    // Blur is judged RELATIVE to this set's own median sharpness, so it adapts to
    // the camera/lighting instead of relying on a brittle absolute threshold. We
    // only flag clear outliers (well below the typical shot).
    const scores = [...results.values()].map((r) => r.blurScore).sort((a, b) => a - b);
    const median = scores[Math.floor(scores.length / 2)] || 0;
    const blurThreshold = median * 0.3;

    const duplicateIds = findDuplicateIds(results);

    let blurCount = 0;
    let dupCount = 0;
    set((s) => ({
      media: s.media.map((m) => {
        if (m.kind !== 'photo') return m;
        const a = results.get(m.id);
        if (!a) return { ...m, blurry: false, duplicate: false };
        const blurry = a.blurScore < blurThreshold;
        const duplicate = duplicateIds.has(m.id);
        if (blurry) blurCount++;
        if (duplicate) dupCount++;
        return { ...m, blurry, duplicate };
      }),
    }));

    if (!blurCount && !dupCount) {
      toast('Scan complete — no blurry or duplicate shots stood out. Nice set.', 'success');
    } else {
      const parts: string[] = [];
      if (blurCount) parts.push(`${blurCount} likely blurry`);
      if (dupCount) parts.push(`${dupCount} near-duplicate`);
      toast(`Flagged ${parts.join(' and ')}. Review the marks, then "Exclude flagged" or toggle individually.`, 'info');
    }
  },

  // Exclude (don't delete) every flagged photo in one tap. Reversible — the user
  // can click any tile to re-include it.
  excludeFlagged: () => {
    let count = 0;
    set((s) => ({
      media: s.media.map((m) => {
        if (m.kind === 'photo' && (m.blurry || m.duplicate) && m.included) {
          count++;
          return { ...m, included: false };
        }
        return m;
      }),
    }));
    if (count) toast(`Excluded ${count} flagged photo${count === 1 ? '' : 's'} from the show. Click any to add it back.`, 'success');
    else toast('No flagged photos to exclude.', 'info');
  },

  // Clear all scan flags (e.g. to start a fresh review).
  clearScanFlags: () =>
    set((s) => ({
      media: s.media.map((m) => (m.kind === 'photo' ? { ...m, blurry: false, duplicate: false } : m)),
    })),

  // Rotate a photo by N quarter-turns, baking the result into a fresh downscaled
  // image (see rotateImage). Swaps in the new url/dims, resets the Ken Burns plan
  // (geometry changed) and revokes the old object URL once the new one is live.
  rotatePhoto: async (id, quarterTurns) => {
    const photo = get().media.find((m): m is Photo => m.kind === 'photo' && m.id === id);
    if (!photo) return;
    try {
      const rotated = await rotateImage(photo.url, quarterTurns);
      const oldUrl = photo.url;
      const oldRevocable = photo.revocable;
      set((s) => ({
        media: s.media.map((m) =>
          m.id === id && m.kind === 'photo'
            ? {
                ...m,
                url: rotated.url,
                revocable: rotated.revocable,
                width: rotated.width,
                height: rotated.height,
                face: rotated.face,
                kbPlan: undefined, // re-planned on next playback from the new geometry
                loadError: false,
              }
            : m,
        ),
      }));
      if (oldRevocable) URL.revokeObjectURL(oldUrl);
    } catch (err) {
      console.error('Rotate failed for', photo.name, err);
      toast(`Couldn't rotate "${photo.name}".`, 'error');
    }
  },

  addSongs: async (fileList) => {
    const files = Array.from(fileList).filter(isAudioFile);
    if (!files.length) {
      toast("Those don't look like audio files. Try MP3, M4A, WAV, or AAC.", 'error');
      return;
    }

    toast(`Loading ${files.length} song${files.length === 1 ? '' : 's'}…`, 'info');

    const { ctx } = ensureAudioCtx();

    let added = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        // Decode briefly to validate the file and read duration.
        // We pass a copy because decodeAudioData consumes the buffer.
        let duration = 0;
        try {
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          duration = decoded.duration;
        } catch (decodeErr) {
          console.error('Audio decode failed for', file.name, decodeErr);
          failed++;
          continue;
        }
        const song: Song = {
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, ''),
          file,
          arrayBuffer,
          duration,
          included: true,
        };
        set((s) => ({ songs: [...s.songs, song] }));
        added++;
      } catch (err) {
        console.error('Failed to read song', file.name, err);
        failed++;
      }
    }

    if (added > 0 && failed === 0) toast(`Added ${added} song${added === 1 ? '' : 's'}.`, 'success');
    else if (added > 0) toast(`Added ${added} songs; ${failed} couldn't be decoded.`, 'info');
    else toast("Couldn't decode any of those audio files. Try MP3 or M4A.", 'error');
  },

  addBuiltInTrack: async (track) => {
    // No duplicates — adding the same library track twice is a no-op.
    if (get().songs.some((s) => s.trackId === track.id)) {
      toast('That track is already in your show.', 'info');
      return;
    }

    const { ctx } = ensureAudioCtx();
    try {
      // Lazy-fetch the bundled file only now (keeps the initial load light).
      const res = await fetch(trackUrl(track.file), { cache: 'force-cache' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();

      // Validate + read true duration the same way uploaded songs do. We pass a
      // copy because decodeAudioData consumes the buffer.
      let duration = track.duration ?? 0;
      try {
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        duration = decoded.duration;
      } catch (decodeErr) {
        console.error('Built-in track decode failed for', track.title, decodeErr);
        toast(`Couldn't load "${track.title}". The file may be missing.`, 'error');
        return;
      }

      // Build a File so the rest of the pipeline (export, etc.) treats it like
      // any other song — the only difference is the provenance fields.
      const fileName = track.file.split('/').pop() || `${track.id}.mp3`;
      const file = new File([arrayBuffer], fileName, { type: res.headers.get('content-type') || 'audio/mpeg' });

      const song: Song = {
        id: uid(),
        name: track.artist ? `${track.title} — ${track.artist}` : track.title,
        file,
        arrayBuffer,
        duration,
        included: true,
        builtIn: true,
        trackId: track.id,
        artist: track.artist,
        source: track.source,
        license: track.license,
        attribution: track.attribution,
      };
      set((s) => ({ songs: [...s.songs, song] }));
      toast(`Added "${track.title}".`, 'success');
    } catch (err) {
      console.error('Failed to add built-in track', track.title, err);
      toast(`Couldn't load "${track.title}". Check your connection and try again.`, 'error');
    }
  },

  // Remove one item (photo OR clip) and free whatever object URLs it owns.
  removeMedia: (id) =>
    set((s) => {
      const item = s.media.find((m) => m.id === id);
      if (item) {
        if (item.kind === 'photo') {
          if (item.revocable) URL.revokeObjectURL(item.url);
        } else {
          if (item.revocable) URL.revokeObjectURL(item.src);
          if (item.posterRevocable && item.posterUrl) URL.revokeObjectURL(item.posterUrl);
        }
      }
      return {
        media: s.media.filter((m) => m.id !== id),
        // Drop any section card anchored to the item we just removed.
        sections: s.sections.filter((c) => c.beforePhotoId !== id),
      };
    }),

  removeSong: (id) => set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),

  clearMedia: () =>
    set((s) => {
      s.media.forEach((m) => {
        if (m.kind === 'photo') {
          if (m.revocable) URL.revokeObjectURL(m.url);
        } else {
          if (m.revocable) URL.revokeObjectURL(m.src);
          if (m.posterRevocable && m.posterUrl) URL.revokeObjectURL(m.posterUrl);
        }
      });
      return { media: [], sections: [] };
    }),

  toggleMedia: (id) =>
    set((s) => ({
      media: s.media.map((m) => (m.id === id ? { ...m, included: !m.included } : m)),
    })),

  reorderMedia: (orderedIds) =>
    set((s) => ({
      media: [...s.media].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
    })),

  reorderSongs: (orderedIds) =>
    set((s) => ({
      songs: [...s.songs].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
    })),

  shuffleMedia: () => set((s) => ({ media: shuffle([...s.media]) })),

  // Sort by capture date. Only photos carry a capturedAt; clips (and undated
  // photos) keep their relative order and land at the end.
  sortByDate: () => {
    const media = get().media;
    const dated = media.filter((m): m is Photo => m.kind === 'photo' && m.capturedAt != null);
    const undated = media.filter((m) => !(m.kind === 'photo' && m.capturedAt != null));
    if (!dated.length) {
      toast("Couldn't read capture dates from these photos — order unchanged.", 'error');
      return;
    }
    // Ascending by capture time; undated items keep their order at the end.
    dated.sort((a, b) => a.capturedAt! - b.capturedAt!);
    set({ media: [...dated, ...undated] });
    if (undated.length) {
      toast(`Sorted ${dated.length} by date taken — ${undated.length} had no timestamp (moved to the end).`, 'info');
    } else {
      toast(`Sorted ${dated.length} photo${dated.length === 1 ? '' : 's'} by date taken.`, 'success');
    }
  },

  addSection: (beforePhotoId) =>
    set((s) => {
      // One card per anchor photo — adding again on the same photo is a no-op.
      if (s.sections.some((c) => c.beforePhotoId === beforePhotoId)) return {};
      const section: SectionCard = {
        id: uid(),
        beforePhotoId,
        title: 'New Section',
        subtitle: '',
        duration: 4,
      };
      return { sections: [...s.sections, section] };
    }),

  updateSection: (id, patch) =>
    set((s) => ({
      sections: s.sections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeSection: (id) => set((s) => ({ sections: s.sections.filter((c) => c.id !== id) })),

  replaceProject: (data) =>
    set((s) => ({
      eventName: data.eventName ?? s.eventName,
      intro: data.intro ?? s.intro,
      outro: data.outro ?? s.outro,
      settings: { ...s.settings, ...data.settings },
    })),
}));

// ===== Media selectors =====
// `media` is the single ordered source of truth (photos + clips interleaved).
// These give the photos-only / clips-only views the rest of the app still needs.
// In components, wrap with useShallow so the derived array doesn't churn renders:
//   const photos = useStore(useShallow(selectPhotos));
export const isPhoto = (m: MediaItem): m is Photo => m.kind === 'photo';
export const isClip = (m: MediaItem): m is Clip => m.kind === 'clip';
export const selectPhotos = (s: AppState): Photo[] => s.media.filter(isPhoto);
export const selectClips = (s: AppState): Clip[] => s.media.filter(isClip);

// ===== Text autosave subscription =====
// Silently snapshot the show's TEXT (event name + intro/outro + section cards)
// to localStorage whenever any of it changes. Debounced inside persistAutosave so
// per-keystroke edits don't hammer storage. Media/songs are deliberately never
// serialized — browsers can't re-hydrate a File and the product promise is that
// nothing about your media leaves the device. (Settings persist separately via
// preferences.ts; explicit file save/load lives in persistence.ts.)
useStore.subscribe((state, prev) => {
  if (
    state.eventName !== prev.eventName ||
    state.intro !== prev.intro ||
    state.outro !== prev.outro ||
    state.sections !== prev.sections
  ) {
    persistAutosave({
      eventName: state.eventName,
      intro: state.intro,
      outro: state.outro,
      sections: state.sections,
    });
  }
});
