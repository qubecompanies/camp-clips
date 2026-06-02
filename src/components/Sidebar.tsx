import { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, selectPhotos } from '../state/store';
import { Slider } from './controls';
import { SettingsPanel } from './SettingsPanel';
import { SongList } from './SongList';
import { applyTemplate } from '../lib/templates';
import { loadMusicManifest } from '../lib/musicLibrary';
import { fmtTime } from '../lib/utils';
import type { MusicManifest, LibraryTrack } from '../state/types';

type Tab = 'setup' | 'music' | 'settings';

interface Props {
  onShowGooglePhotos: () => void;
}

const TEMPLATE_BUTTONS: { id: string; name: string; tag: string }[] = [
  { id: 'default', name: 'Default', tag: 'Brand · balanced' },
  { id: 'camp', name: 'Camp Recap', tag: 'Energetic · fast' },
  { id: 'reunion', name: 'Family Reunion', tag: 'Warm · medium' },
  { id: 'wedding', name: 'Wedding', tag: 'Cinematic · subtle' },
];

export function Sidebar(_props: Props) {
  const [tab, setTab] = useState<Tab>('setup');

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={'sidebar-tab' + (tab === 'setup' ? ' active' : '')} onClick={() => setTab('setup')}>
          <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Setup
        </button>
        <button className={'sidebar-tab' + (tab === 'music' ? ' active' : '')} onClick={() => setTab('music')}>
          <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          Music
        </button>
        <button
          className={'sidebar-tab' + (tab === 'settings' ? ' active' : '')}
          onClick={() => setTab('settings')}
        >
          <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          Settings
        </button>
      </div>

      <div className="sidebar-content">
        {tab === 'setup' && <SetupPanel />}
        {tab === 'music' && <MusicPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
}

function SetupPanel() {
  const settings = useStore((s) => s.settings);
  const intro = useStore((s) => s.intro);
  const outro = useStore((s) => s.outro);
  const setIntro = useStore((s) => s.setIntro);
  const setOutro = useStore((s) => s.setOutro);

  return (
    <div className="panel active" id="panel-setup">
      <div className="panel-section">
        <label className="panel-label">Template</label>
        <div className="template-grid">
          {TEMPLATE_BUTTONS.map((t) => (
            <button
              key={t.id}
              className={'btn template-btn' + ((settings.templateId || 'default') === t.id ? ' active' : '')}
              onClick={() => applyTemplate(t.id)}
            >
              <span className="tpl-name">{t.name}</span>
              <span className="tpl-tag">{t.tag}</span>
            </button>
          ))}
        </div>
        <div className="panel-help">
          Templates set pacing, motion, and colors at once. You can still tweak individual settings after applying.
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Intro Screen</label>
        <input
          type="text"
          className="input mb-12"
          placeholder="e.g. Summer Camp 2026"
          value={intro.title}
          onChange={(e) => setIntro({ title: e.target.value })}
        />
        <input
          type="text"
          className="input mb-12"
          placeholder="e.g. Lakeside · June 2026"
          value={intro.subtitle}
          onChange={(e) => setIntro({ subtitle: e.target.value })}
        />
        <Slider
          label="Duration"
          min={2}
          max={10}
          step={0.5}
          value={intro.duration}
          display={intro.duration.toFixed(1) + 's'}
          onChange={(v) => setIntro({ duration: v })}
        />
      </div>

      <div className="panel-section">
        <label className="panel-label">Outro Screen</label>
        <input
          type="text"
          className="input mb-12"
          placeholder="e.g. See you next year"
          value={outro.title}
          onChange={(e) => setOutro({ title: e.target.value })}
        />
        <input
          type="text"
          className="input mb-12"
          placeholder="e.g. Thanks for a great week"
          value={outro.subtitle}
          onChange={(e) => setOutro({ subtitle: e.target.value })}
        />
        <Slider
          label="Duration"
          min={2}
          max={10}
          step={0.5}
          value={outro.duration}
          display={outro.duration.toFixed(1) + 's'}
          onChange={(v) => setOutro({ duration: v })}
        />
      </div>

      <div className="panel-help">
        The intro plays at the start of the slideshow. The outro plays at the end. Leave either field blank to skip
        that screen.
      </div>

      <SectionCardsPanel />
    </div>
  );
}

function SectionCardsPanel() {
  const photos = useStore(useShallow(selectPhotos));
  const sections = useStore((s) => s.sections);
  const updateSection = useStore((s) => s.updateSection);
  const removeSection = useStore((s) => s.removeSection);

  if (!sections.length) {
    return (
      <div className="panel-section">
        <label className="panel-label">Section Cards</label>
        <div className="panel-help" style={{ marginTop: 0 }}>
          Break the show into chapters. Hover a photo and tap its{' '}
          <svg
            className="inline-hint-icon"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="17" x2="11" y2="17" />
          </svg>{' '}
          button to add a title card before it.
        </div>
      </div>
    );
  }

  // Order the editor list to match slideshow order (by anchor photo position).
  const indexOf = new Map(photos.map((p, i) => [p.id, i]));
  const ordered = [...sections].sort(
    (a, b) => (indexOf.get(a.beforePhotoId) ?? 1e9) - (indexOf.get(b.beforePhotoId) ?? 1e9),
  );

  return (
    <div className="panel-section">
      <label className="panel-label">Section Cards</label>
      <div className="section-card-list">
        {ordered.map((card) => {
          const anchor = photos.find((p) => p.id === card.beforePhotoId);
          const anchorIndex = indexOf.get(card.beforePhotoId);
          return (
            <div className="section-card-item" key={card.id}>
              <div className="section-card-anchor">
                {anchor && <img src={anchor.url} alt="" />}
                <span className="section-card-pos">
                  Before #{anchorIndex != null ? anchorIndex + 1 : '?'}
                </span>
                <button
                  className="section-card-remove"
                  title="Remove section card"
                  onClick={() => removeSection(card.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <input
                type="text"
                className="input mb-12"
                placeholder="Section title — e.g. Day Two"
                value={card.title}
                onChange={(e) => updateSection(card.id, { title: e.target.value })}
              />
              <input
                type="text"
                className="input mb-12"
                placeholder="Subtitle (optional)"
                value={card.subtitle}
                onChange={(e) => updateSection(card.id, { subtitle: e.target.value })}
              />
              <Slider
                label="Duration"
                min={2}
                max={10}
                step={0.5}
                value={card.duration}
                display={card.duration.toFixed(1) + 's'}
                onChange={(v) => updateSection(card.id, { duration: v })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MusicPanel() {
  const addSongs = useStore((s) => s.addSongs);
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'mine' | 'library'>('mine');

  return (
    <div className="panel active" id="panel-music">
      <div className="panel-section">
        <div className="music-source-toggle mb-12">
          <button
            className={'btn music-source-btn' + (view === 'mine' ? ' active' : '')}
            onClick={() => setView('mine')}
          >
            My Songs
          </button>
          <button
            className={'btn music-source-btn' + (view === 'library' ? ' active' : '')}
            onClick={() => setView('library')}
          >
            Browse Library
          </button>
        </div>

        {view === 'mine' ? (
          <>
            <button className="btn btn-block mb-12" onClick={() => inputRef.current?.click()}>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Songs
            </button>
            <input
              ref={inputRef}
              type="file"
              className="file-input"
              accept="audio/*,audio/mpeg,audio/mp3,audio/mp4,audio/wav,audio/x-wav,audio/x-m4a,audio/aac,audio/ogg,audio/flac,.mp3,.m4a,.wav,.aac,.ogg,.flac,.mp4"
              multiple
              onChange={(e) => {
                if (e.target.files) addSongs(e.target.files);
                e.target.value = '';
              }}
            />
            <SongList />
          </>
        ) : (
          <MusicLibrary />
        )}
      </div>
    </div>
  );
}

function MusicLibrary() {
  const addBuiltInTrack = useStore((s) => s.addBuiltInTrack);
  const songs = useStore((s) => s.songs);
  const [manifest, setManifest] = useState<MusicManifest | null | 'loading' | 'error'>('loading');
  const [moodId, setMoodId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMusicManifest().then((m) => {
      if (cancelled) return;
      if (!m) {
        setManifest('error');
        return;
      }
      setManifest(m);
      setMoodId((cur) => cur ?? m.moods[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (manifest === 'loading') {
    return <div className="panel-help" style={{ textAlign: 'center', padding: '20px 0' }}>Loading library…</div>;
  }
  if (manifest === 'error' || manifest === null) {
    return (
      <div className="panel-help" style={{ textAlign: 'center', padding: '20px 0' }}>
        Couldn't load the music library. You can still add your own songs from the “My Songs” tab.
      </div>
    );
  }

  const mood = manifest.moods.find((m) => m.id === moodId) ?? manifest.moods[0];
  const inShow = new Set(songs.map((s) => s.trackId).filter(Boolean));

  const handleAdd = async (track: LibraryTrack) => {
    setAdding(track.id);
    try {
      await addBuiltInTrack(track);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="music-library">
      <div className="mood-tabs">
        {manifest.moods.map((m) => (
          <button
            key={m.id}
            className={'mood-tab' + (m.id === mood?.id ? ' active' : '')}
            onClick={() => setMoodId(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>

      {mood?.blurb && <div className="panel-help" style={{ marginTop: 0 }}>{mood.blurb}</div>}

      {mood && mood.tracks.length > 0 ? (
        <div className="library-track-list">
          {mood.tracks.map((track) => {
            const already = inShow.has(track.id);
            const busy = adding === track.id;
            return (
              <div className="library-track" key={track.id}>
                <div className="library-track-info">
                  <div className="library-track-title">{track.title}</div>
                  <div className="library-track-meta">
                    {track.artist ? track.artist : 'Unknown artist'}
                    {track.duration ? ` · ${fmtTime(track.duration)}` : ''}
                    {track.license ? ` · ${track.license}` : ''}
                  </div>
                </div>
                {track.pending ? (
                  <a
                    className="btn library-track-get"
                    href={track.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Opens the source so you can download this track"
                  >
                    Get track
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17 17 7" />
                      <path d="M8 7h9v9" />
                    </svg>
                  </a>
                ) : (
                  <button
                    className={'btn library-track-add' + (already ? ' added' : '')}
                    disabled={already || busy}
                    onClick={() => handleAdd(track)}
                    title={already ? 'Already in your show' : 'Add to show'}
                  >
                    {already ? 'Added' : busy ? 'Adding…' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel-help" style={{ textAlign: 'center', padding: '20px 0' }}>
          Tracks for this mood are coming soon. In the meantime, add your own from the “My Songs” tab.
        </div>
      )}

      {mood?.browseUrl && (
        <a className="library-browse-more" href={mood.browseUrl} target="_blank" rel="noopener noreferrer">
          Browse more {mood.name.toLowerCase()} tracks ↗
        </a>
      )}

      <div className="panel-help library-license-note">
        These are suggestions, not bundled audio. <strong>Get track</strong> opens the source to download — drop the
        file into <code>public/music/</code> to make it addable. Licenses shown are as stated by each source; verify
        terms before public use.
      </div>
    </div>
  );
}
