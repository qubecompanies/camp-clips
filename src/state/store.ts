import { create } from 'zustand';
import type { Photo, Song, Settings, TextScreen, PlaybackState } from './types';
import { processImageFile } from '../lib/imageProcessing';
import { readCaptureTime } from '../lib/exif';
import { ensureAudioCtx, getGainNode } from '../lib/audioContext';
import { isImageFile, isAudioFile, uid, shuffle } from '../lib/utils';
import { toast } from './toastStore';

interface AppState {
  eventName: string;
  photos: Photo[];
  songs: Song[];
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
  addSongs: (fileList: FileList | File[]) => Promise<void>;
  removePhoto: (id: string) => void;
  removeSong: (id: string) => void;
  clearPhotos: () => void;
  togglePhoto: (id: string) => void;
  reorderPhotos: (orderedIds: string[]) => void;
  reorderSongs: (orderedIds: string[]) => void;
  shufflePhotos: () => void;
  sortPhotosByDate: () => void;

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
  photos: [],
  songs: [],
  intro: { title: '', subtitle: '', duration: 5 },
  outro: { title: '', subtitle: '', duration: 5 },
  settings: {
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
    theme: 'light',
    exportRes: 1080,
    exportFmt: 'webm',
    templateId: 'default',
  },
  playback: { active: false, paused: false },

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
  },
  setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),

  addPhotos: async (fileList) => {
    const files = Array.from(fileList).filter(isImageFile);
    if (!files.length) {
      toast("Those don't look like image files. Try JPG, PNG, or HEIC.", 'error');
      return;
    }

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
          name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          url: result.url,
          revocable: result.revocable,
          width: result.width,
          height: result.height,
          included: true,
          capturedAt,
        };
        set((s) => ({ photos: [...s.photos, photo] }));
        added++;
        // CRITICAL: yield to the browser so it can garbage-collect between photos.
        // Without this, the loop runs hot and memory keeps climbing even though
        // each individual photo's intermediate data should be eligible for GC.
        await new Promise((r) => setTimeout(r, 0));
      } catch (err) {
        console.error('Failed to process', file.name, err);
        failed++;
      }
    }

    if (added > 0 && failed === 0) {
      toast(`Added ${added} photo${added === 1 ? '' : 's'}.`, 'success');
    } else if (added > 0 && failed > 0) {
      toast(`Added ${added} photos; ${failed} couldn't load.`, 'info');
    } else if (failed > 0) {
      toast(`${failed} photo${failed === 1 ? " couldn't" : "s couldn't"} load. The rest are ready.`, 'error');
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

  removePhoto: (id) =>
    set((s) => {
      const photo = s.photos.find((p) => p.id === id);
      if (photo?.revocable) URL.revokeObjectURL(photo.url);
      return { photos: s.photos.filter((p) => p.id !== id) };
    }),

  removeSong: (id) => set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),

  clearPhotos: () =>
    set((s) => {
      s.photos.forEach((p) => {
        if (p.revocable) URL.revokeObjectURL(p.url);
      });
      return { photos: [] };
    }),

  togglePhoto: (id) =>
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, included: !p.included } : p)),
    })),

  reorderPhotos: (orderedIds) =>
    set((s) => ({
      photos: [...s.photos].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
    })),

  reorderSongs: (orderedIds) =>
    set((s) => ({
      songs: [...s.songs].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
    })),

  shufflePhotos: () => set((s) => ({ photos: shuffle([...s.photos]) })),

  sortPhotosByDate: () => {
    const photos = get().photos;
    const dated = photos.filter((p) => p.capturedAt != null);
    const undated = photos.filter((p) => p.capturedAt == null);
    if (!dated.length) {
      toast("Couldn't read capture dates from these photos — order unchanged.", 'error');
      return;
    }
    // Ascending by capture time; undated photos keep their order at the end.
    dated.sort((a, b) => a.capturedAt! - b.capturedAt!);
    set({ photos: [...dated, ...undated] });
    if (undated.length) {
      toast(`Sorted ${dated.length} by date taken — ${undated.length} had no timestamp (moved to the end).`, 'info');
    } else {
      toast(`Sorted ${dated.length} photo${dated.length === 1 ? '' : 's'} by date taken.`, 'success');
    }
  },

  replaceProject: (data) =>
    set((s) => ({
      eventName: data.eventName ?? s.eventName,
      intro: data.intro ?? s.intro,
      outro: data.outro ?? s.outro,
      settings: { ...s.settings, ...data.settings },
    })),
}));
