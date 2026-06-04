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
  kind: 'photo'; // discriminator — lets Photo and Clip share a grid/timeline (Phase 2 unifies them)
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
  caption?: string; // optional text overlay shown on this photo in playback + export
}

// Lifecycle of a video clip from drop to playable.
//   ready        — decodes in this browser; poster + dimensions captured, good to go
//   needs-convert— failed to decode (HEVC on Chrome-Windows is the usual cause);
//                  we show guidance + an opt-in on-device Convert button
//   converting   — ffmpeg.wasm transcode in flight (see convertProgress)
//   error        — convert failed or the file is genuinely unreadable
export type ClipStatus = 'ready' | 'needs-convert' | 'converting' | 'error';

// A video clip. Mirrors Photo's shape where it can (id/name/included/dimensions)
// so the two can sit side by side in the grid. Ken Burns + face framing are
// photo-only and deliberately absent here. Clips never upload — `src`/`posterUrl`
// are in-memory object URLs, same privacy promise as photos.
export interface Clip {
  id: string;
  kind: 'clip';
  name: string;
  src: string; // object URL of the video (original, or the H.264 result after Convert)
  revocable: boolean; // whether `src` is an object URL we own and must revoke
  posterUrl?: string; // object URL of the downscaled poster frame; absent until decoded
  posterRevocable?: boolean;
  naturalDuration: number; // seconds; 0 until decoded
  width: number; // 0 until decoded
  height: number;
  included: boolean;
  // Trim window. Phase 1 sets inPoint=0 and outPoint=min(naturalDuration, photoDuration);
  // Phase 5 exposes handles to widen it up to naturalDuration.
  inPoint: number;
  outPoint: number;
  muted: boolean; // clip audio is played (ducking the music) unless muted
  status: ClipStatus;
  convertProgress?: number; // 0..1 while status === 'converting'
  loadError?: boolean;
}

// Anything that can occupy a slot in the grid/timeline. Phase 2 will thread this
// union through planning/playback/export; Phase 1 keeps clips in their own array.
export type MediaItem = Photo | Clip;

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
  // A "suggestion" whose audio file isn't bundled yet. The UI shows a
  // "Get track" link to `source` instead of an Add button. Once you download
  // the file into public/music/ and drop the flag (or set it false), the same
  // entry becomes addable. Lets us ship curated picks before hosting audio.
  pending?: boolean;
}

export interface LibraryMood {
  id: string;
  name: string;
  blurb?: string;
  browseUrl?: string; // optional "browse more like this" link (e.g. a Pixabay mood page)
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
  fillBehavior: FillBehavior; // MUSIC vs show-length behaviour (loop/stretch/fit)
  photoFit: 'cover' | 'contain'; // how each PHOTO sits in the frame: cover=fill+crop, contain=fit+letterbox
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
