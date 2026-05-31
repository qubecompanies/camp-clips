import { useRef } from 'react';
import { useStore } from '../state/store';
import { computePlan, getIncludedPhotos, getIncludedSongs } from '../lib/planning';
import { saveProject, loadProject } from '../lib/persistence';
import { fmtTime } from '../lib/utils';

interface Props {
  onPlay: () => void;
  onExport: () => void;
}

export function AppHeader({ onPlay, onExport }: Props) {
  const eventName = useStore((s) => s.eventName);
  const setEventName = useStore((s) => s.setEventName);
  // Subscribe to the slices that affect the duration readout
  const photos = useStore((s) => s.photos);
  const songs = useStore((s) => s.songs);
  const settings = useStore((s) => s.settings);
  const intro = useStore((s) => s.intro);
  const outro = useStore((s) => s.outro);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const photoCount = getIncludedPhotos().length;
  const songCount = getIncludedSongs().length;
  const introDur = intro.title ? intro.duration : 0;
  const outroDur = outro.title ? outro.duration : 0;
  const plan = computePlan();
  const totalSec =
    introDur + outroDur + plan.count * plan.hold + Math.max(0, plan.count - 1) * settings.transitionDuration;

  // Reference photos/songs so eslint/ts treats the subscriptions as used
  void photos;
  void songs;

  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-mark" aria-label="Camp Clips">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: 'var(--text-primary)' }} />
            <path d="M32 8 A24 24 0 0 0 8 32 L20 32 A12 12 0 0 1 32 20 Z" fill="#F59E0B" />
            <path d="M8 32 A24 24 0 0 0 32 56 L32 44 A12 12 0 0 1 20 32 Z" fill="#4338CA" />
            <path d="M32 56 A24 24 0 0 0 56 32 L44 32 A12 12 0 0 1 32 44 Z" fill="currentColor" style={{ color: 'var(--text-primary)' }} />
            <circle cx="32" cy="32" r="6" fill="var(--bg-panel)" />
          </svg>
        </div>
        <span>Camp Clips</span>
      </div>
      <input
        type="text"
        className="event-name-input"
        placeholder="Untitled Event"
        value={eventName}
        onChange={(e) => setEventName(e.target.value)}
      />
      <div className="header-stats">
        <div className="stat">
          <strong>{photoCount}</strong> photos
        </div>
        <div className="stat">
          <strong>{songCount}</strong> songs
        </div>
        <div className="stat">
          <strong>{fmtTime(totalSec)}</strong>
        </div>
      </div>
      <div className="header-actions">
        <input
          ref={loadInputRef}
          type="file"
          className="file-input"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadProject(file);
            e.target.value = '';
          }}
        />
        <button className="btn btn-ghost" title="Load project" onClick={() => loadInputRef.current?.click()}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Load
        </button>
        <button className="btn btn-ghost" title="Save project file" onClick={saveProject}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save
        </button>
        <button className="btn btn-secondary" title="Export video" onClick={onExport}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Export
        </button>
        <button className="btn btn-primary" title="Play slideshow" onClick={onPlay}>
          <svg className="icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Play
        </button>
      </div>
    </header>
  );
}
