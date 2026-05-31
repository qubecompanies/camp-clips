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
}

export interface Song {
  id: string;
  name: string;
  file: File;
  arrayBuffer: ArrayBuffer;
  duration: number;
  included: boolean;
}

export interface TextScreen {
  title: string;
  subtitle: string;
  duration: number;
}

export type ShowLength = 'all' | 'time' | 'music';
export type FillBehavior = 'loop' | 'stretch' | 'fit';
export type Theme = 'dark' | 'light';
export type ExportRes = 720 | 1080 | 1440;
export type ExportFmt = 'webm' | 'mp4';

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
