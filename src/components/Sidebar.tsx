import { useState, useRef } from 'react';
import { useStore } from '../state/store';
import { Slider } from './controls';
import { SettingsPanel } from './SettingsPanel';
import { SongList } from './SongList';
import { applyTemplate } from '../lib/templates';

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
          placeholder="e.g. Stake Youth Camp 2026"
          value={intro.title}
          onChange={(e) => setIntro({ title: e.target.value })}
        />
        <input
          type="text"
          className="input mb-12"
          placeholder="e.g. Aiken, SC · June 2026"
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
    </div>
  );
}

function MusicPanel() {
  const addSongs = useStore((s) => s.addSongs);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel active" id="panel-music">
      <div className="panel-section">
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
      </div>
    </div>
  );
}
