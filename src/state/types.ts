export type KbType =
  | 'zoomIn'
  | 'zoomOut'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown';

export interface KbPlan {
  type: KbType;
  focal: { x: number; y: number };
  fillMode: 'cover' | 'contain';
  zoom?: number; // per-photo zoom override (face photos cap it); falls back to settings.kenBurnsIntensity
}

// Result of face detection, all coordinates NORMALIZED to 0..1 of the full
// (downscaled) image. `focal` is the size-weighted centre of all faces — the
// point Ken Burns motion anchors on. `region` is the union bounding box of all
// faces, used to keep faces inside the frame.
export interface FaceFraming {
  focal: { x: number; y: number };
  region: { x: number; y: number; w: number; h: number };
  count: number;
}

export interface Photo {
  id: string;
  name: string;
  url: string;
  revocable: boolean;
  width: number;
  height: number;
  included: boolean;
  loadError?: boolean;
  kbPlan?: KbPlan;
  face?: FaceFraming | null; // null = detection ran and found nothing; undefined = not yet run
  capturedAt?: number; // EXIF DateTimeOriginal (epoch ms); undefined when unreadable
}

export interface Song {
  id: string;
  name: string;
  file: File;
  arrayBuffer: ArrayBuffer;
  duration: number;
  included: boolean;
  // Provenance — present only for tracks added from the built-in library, so we
  // can show attribution and let the user verify the license/source. Uploaded
  // songs leave these undefined.
  builtIn?: boolean;
  trackId?: string; // manifest track id (so we don't add the same library track twice)
  artist?: string;
  source?: string; // URL the track was sourced from
  license?: string; // license label as stated by the source (NOT verified by the app)
  attribution?: string; // ready-to-paste credit line, when the license requires it
}

// ===== Built-in music library (public/music/manifest.json) =====
// The manifest is the single source of truth for bundled royalty-free tracks.
// Each track points at an audio file under public/music/ and carries the
// provenance we surface in the UI. License strings are copied verbatim from the
// source — the app never asserts a license is valid, it just shows what the
// source claimed so the user can verify.
export interface LibraryTrack {
  id: string;
  title: string;
  artist?: string;
  file: string; // path relative to public/music/, e.g. "upbeat/sunrise.mp3"
  duration?: number; // seconds, optional hint for the list before decode
  source?: string; // URL the track came from
  license?: string; // license label as stated by the source
  attribution?: string; // credit line to display/paste when required
}

export interface LibraryMood {
  id: string;
  name: string;
  blurb?: string;
  tracks: LibraryTrack[];
}

export interface MusicManifest {
  schemaVersion: number;
  moods: LibraryMood[];
}

export interface TextScreen {
  title: string;
  subtitle: string;
  duration: number;
}

// A section title card shown in the timeline immediately BEFORE its anchor
// photo. Anchoring by photo id (not index) keeps the card glued to its photo
// when the grid is reordered. Renders only in linear playback (see planning).
export interface SectionCard {
  id: string;
  beforePhotoId: string;
  title: string;
  subtitle: string;
  duration: number;
}

export type ShowLength = 'all' | 'time' | 'music';
export type FillBehavior = 'loop' | 'stretch' | 'fit';
export type Theme = 'dark' | 'light';
export type ExportRes = 720 | 1080 | 1440;
export type ExportFmt = 'webm' | 'mp4';
export type ExportAspect = '16:9' | '9:16' | '1:1';

export interface Settings {
  photoDuration: number;
  transitionDuration: number;
  musicVolume: number;
  loopMusic: boolean;
  kenBurns: boolean;
  kenBurnsIntensity: number;
  shuffleOnPlay: boolean;
  showLength: ShowLength;
  timeLimitMin: number;
  fillBehavior: FillBehavior;
  theme: Theme;
  exportRes: ExportRes;
  exportFmt: ExportFmt;
  exportAspect: ExportAspect;
  templateId: string;
}

export interface PlaybackState {
  active: boolean;
  paused: boolean;
}

export interface ProjectFile {
  schemaVersion: number;
  eventName: string;
  intro: TextScreen;
  outro: TextScreen;
  settings: Settings;
  photoOrder: { name: string; included: boolean }[];
  songOrder: { name: string; included: boolean }[];
  savedAt: string;
}
