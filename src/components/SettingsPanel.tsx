import { useStore } from '../state/store';
import { Slider, Switch } from './controls';
import { computePlan, describePlan, getIncludedSongs } from '../lib/planning';
import { applyTheme } from '../lib/theme';
import { toast } from '../state/toastStore';
import type { ShowLength, FillBehavior } from '../state/types';

const KB_INTENSITIES: { label: string; value: number }[] = [
  { label: 'Subtle', value: 0.04 },
  { label: 'Moderate', value: 0.09 },
  { label: 'Energetic', value: 0.18 },
];

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  // Subscribe to media/songs so the plan readout updates live
  useStore((s) => s.media);
  useStore((s) => s.songs);
  useStore((s) => s.intro);
  useStore((s) => s.outro);

  const desc = describePlan();

  const setShowLength = (mode: ShowLength) => {
    updateSettings({ showLength: mode });
    if (mode === 'music' && getIncludedSongs().length === 0) {
      toast('Add songs first — match-music needs music to set the length.', 'info');
    }
  };

  const fitAll = () => {
    updateSettings({ fillBehavior: 'fit' });
    const plan = computePlan();
    if (plan.fitted) {
      toast(`Fitting all ${plan.count} photos — each shows for ${plan.hold.toFixed(1)}s.`, 'success');
    }
  };

  return (
    <div className="panel active" id="panel-settings">
      <div className="panel-section">
        <label className="panel-label">Per-Photo Duration</label>
        <Slider
          min={1.5}
          max={10}
          step={0.5}
          value={settings.photoDuration}
          display={settings.photoDuration.toFixed(1) + 's'}
          onChange={(v) => updateSettings({ photoDuration: v })}
        />
        <div className="panel-help">How long each photo stays on screen.</div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Transition (Cross-fade)</label>
        <Slider
          min={0.3}
          max={3}
          step={0.1}
          value={settings.transitionDuration}
          display={settings.transitionDuration.toFixed(1) + 's'}
          onChange={(v) => updateSettings({ transitionDuration: v })}
        />
        <div className="panel-help">Time to fade from one photo to the next.</div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Music Volume</label>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={settings.musicVolume}
          display={Math.round(settings.musicVolume * 100) + '%'}
          onChange={(v) => updateSettings({ musicVolume: v })}
        />
      </div>

      <div className="panel-section">
        <label className="panel-label">Show Length</label>
        <div className="field-row" style={{ gap: 6 }}>
          {(['all', 'time', 'music'] as ShowLength[]).map((mode) => (
            <button
              key={mode}
              className={'btn show-length-btn' + (settings.showLength === mode ? ' active' : '')}
              onClick={() => setShowLength(mode)}
            >
              {mode === 'all' ? 'All photos' : mode === 'time' ? 'Time limit' : 'Match music'}
            </button>
          ))}
        </div>
        {settings.showLength === 'time' && (
          <div style={{ marginTop: 12 }}>
            <Slider
              label="Minutes"
              min={1}
              max={30}
              step={0.5}
              value={settings.timeLimitMin}
              display={settings.timeLimitMin.toFixed(1) + 'm'}
              onChange={(v) => updateSettings({ timeLimitMin: v })}
            />
          </div>
        )}
        {settings.showLength !== 'all' && (
          <div style={{ marginTop: 12 }}>
            <label className="panel-label" style={{ marginBottom: 6 }}>
              If photos run short
            </label>
            <div className="field-row" style={{ gap: 6 }}>
              {(['loop', 'stretch'] as FillBehavior[]).map((fill) => (
                <button
                  key={fill}
                  className={'btn fill-behavior-btn' + (settings.fillBehavior === fill ? ' active' : '')}
                  onClick={() => updateSettings({ fillBehavior: fill })}
                >
                  {fill === 'loop' ? 'Loop photos' : 'Stretch to fit'}
                </button>
              ))}
            </div>
          </div>
        )}
        {desc && (
          <div className={'plan-readout' + (desc.tone === 'warn' ? ' warn' : '')}>
            <div className="plan-readout-text">{desc.text}</div>
            {desc.showFitButton && (
              <button className="btn btn-primary plan-fit-btn" onClick={fitAll}>
                <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Fit all photos
              </button>
            )}
          </div>
        )}
        <div className="panel-help">
          Choose when the show ends. With a time limit or music match, extra photos can be auto-fit by shortening
          per-photo duration.
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Shuffle</label>
        <Switch
          on={settings.shuffleOnPlay}
          label="Randomize photo order on every play"
          onToggle={() => updateSettings({ shuffleOnPlay: !settings.shuffleOnPlay })}
        />
        <div className="panel-help">Or use the Shuffle button above the photo grid to randomize once.</div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Motion Effect (Ken Burns)</label>
        <Switch
          on={settings.kenBurns}
          label="Zoom & pan on each photo"
          onToggle={() => updateSettings({ kenBurns: !settings.kenBurns })}
        />
        <div
          style={{
            marginTop: 12,
            opacity: settings.kenBurns ? 1 : 0.4,
            pointerEvents: settings.kenBurns ? 'auto' : 'none',
          }}
        >
          <div className="field-row" style={{ gap: 6 }}>
            {KB_INTENSITIES.map((kb) => (
              <button
                key={kb.value}
                className={
                  'btn kb-intensity-btn' +
                  (Math.abs(kb.value - settings.kenBurnsIntensity) < 0.001 ? ' active' : '')
                }
                onClick={() => updateSettings({ kenBurnsIntensity: kb.value })}
              >
                {kb.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-help">
          Adds gentle cinematic movement — a slow zoom on each photo, biased to keep faces in frame.
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Photo Framing</label>
        <div className="field-row" style={{ gap: 6 }}>
          <button
            className={'btn fill-behavior-btn' + (settings.photoFit === 'contain' ? ' active' : '')}
            onClick={() => updateSettings({ photoFit: 'contain' })}
            title="Show the whole photo, letterboxed — nothing is cropped"
          >
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="10" rx="1" />
            </svg>
            Fit (whole photo)
          </button>
          <button
            className={'btn fill-behavior-btn' + (settings.photoFit === 'cover' ? ' active' : '')}
            onClick={() => updateSettings({ photoFit: 'cover' })}
            title="Crop each photo to fill the frame edge-to-edge"
          >
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="1" />
            </svg>
            Fill (crop)
          </button>
        </div>
        <div className="panel-help">
          <strong>Fit</strong> keeps every photo whole with black bars around odd shapes. <strong>Fill</strong> crops
          to fill the screen — faces stay centered when detected. Applies live to preview and export.
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label">Music Behavior</label>
        <Switch
          on={settings.loopMusic}
          label="Loop music if shorter than slideshow"
          onToggle={() => updateSettings({ loopMusic: !settings.loopMusic })}
        />
      </div>

      <div className="panel-section">
        <label className="panel-label">Appearance</label>
        <div className="field-row" style={{ gap: 6 }}>
          <button
            className={'btn theme-btn' + (settings.theme === 'dark' ? ' active' : '')}
            onClick={() => applyTheme('dark')}
          >
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            Dark
          </button>
          <button
            className={'btn theme-btn' + (settings.theme === 'light' ? ' active' : '')}
            onClick={() => applyTheme('light')}
          >
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            Light
          </button>
        </div>
        <div className="panel-help">
          Dark stays cinematic for the editing experience. Light works well in bright rooms.
        </div>
      </div>
    </div>
  );
}
