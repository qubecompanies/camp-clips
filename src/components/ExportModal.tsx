import { useState } from 'react';
import { useStore } from '../state/store';
import { doExport, cancelExport } from '../lib/export';
import { unlockAudio } from '../lib/audioContext';
import type { ExportRes, ExportFmt, ExportAspect } from '../state/types';
import { exportDimensions } from '../lib/export';

interface Props {
  onClose: () => void;
}

const RES_OPTIONS: { res: ExportRes; label: string }[] = [
  { res: 720, label: '720p · faster' },
  { res: 1080, label: '1080p · sharp' },
  { res: 1440, label: '1440p · projector' },
];

// Aspect presets. Icons are distinct SHAPES (wide / tall / square) so they read
// without relying on color — landscape for TV/projector, portrait for Reels &
// Stories, square for feed posts.
const ASPECT_OPTIONS: { aspect: ExportAspect; label: string; w: number; h: number; use: string }[] = [
  { aspect: '16:9', label: 'Landscape', w: 22, h: 13, use: 'TV · YouTube' },
  { aspect: '9:16', label: 'Portrait', w: 13, h: 22, use: 'Reels · TikTok' },
  { aspect: '1:1', label: 'Square', w: 18, h: 18, use: 'Feed post' },
];

export function ExportModal({ onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const eventName = useStore((s) => s.eventName);
  const setEventName = useStore((s) => s.setEventName);
  const [rendering, setRendering] = useState(false);
  const [pct, setPct] = useState(0);
  const [statusText, setStatusText] = useState('Preparing…');

  const formatNote =
    settings.exportFmt === 'mp4'
      ? 'MP4 works in iMessage, social media, and most video apps. Some browsers fall back to WebM.'
      : 'WebM plays in any modern browser and VLC. Most space-efficient and fastest to render.';

  const start = async () => {
    setRendering(true);
    unlockAudio(); // ensure AudioContext is unlocked within this gesture for export audio
    const result = await doExport((p, text) => {
      setPct(p);
      setStatusText(text);
    });
    if (result === 'done') {
      setTimeout(onClose, 2000);
    }
  };

  const cancel = () => {
    if (rendering) cancelExport();
    onClose();
  };

  return (
    <div className="modal-backdrop active" onClick={(e) => e.target === e.currentTarget && cancel()}>
      <div className="modal">
        <h2>Export your slideshow</h2>
        <p>
          Camp Clips records the show in real time — a 10-minute slideshow takes about 10 minutes to export. Keep
          this tab open and the device awake.
        </p>
        {!rendering && (
          <div style={{ margin: '20px 0' }}>
            <label className="panel-label" style={{ marginBottom: 8 }}>
              Title
            </label>
            <input
              type="text"
              className="event-name-input"
              style={{ width: '100%', marginBottom: 6 }}
              placeholder="Name your slideshow"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
            <div className="panel-help" style={{ marginBottom: 16 }}>
              Names your download:{' '}
              <code>{(eventName.trim() || 'camp-clips').replace(/[^a-z0-9-_]/gi, '_')}.{settings.exportFmt}</code>
            </div>
            <label className="panel-label" style={{ marginBottom: 8 }}>
              Shape
            </label>
            <div className="field-row aspect-row" style={{ gap: 6, marginBottom: 6 }}>
              {ASPECT_OPTIONS.map((o) => (
                <button
                  key={o.aspect}
                  className={'btn aspect-btn' + (settings.exportAspect === o.aspect ? ' active' : '')}
                  onClick={() => updateSettings({ exportAspect: o.aspect })}
                  title={`${o.label} (${o.aspect}) — ${o.use}`}
                >
                  <span className="aspect-glyph" aria-hidden>
                    <span className="aspect-rect" style={{ width: o.w, height: o.h }} />
                  </span>
                  <span className="aspect-name">{o.label}</span>
                  <span className="aspect-use">{o.use}</span>
                </button>
              ))}
            </div>
            <div className="panel-help" style={{ marginBottom: 16 }}>
              Exports at{' '}
              <code>
                {(() => {
                  const [w, h] = exportDimensions(settings.exportAspect, settings.exportRes);
                  return `${w}×${h}`;
                })()}
              </code>{' '}
              ({settings.exportAspect}).
            </div>
            <label className="panel-label" style={{ marginBottom: 8 }}>
              Resolution
            </label>
            <div className="field-row" style={{ gap: 6, marginBottom: 16 }}>
              {RES_OPTIONS.map((o) => (
                <button
                  key={o.res}
                  className={'btn export-res-btn' + (settings.exportRes === o.res ? ' active' : '')}
                  onClick={() => updateSettings({ exportRes: o.res })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="panel-label" style={{ marginBottom: 8 }}>
              Format
            </label>
            <div className="field-row" style={{ gap: 6 }}>
              {(['webm', 'mp4'] as ExportFmt[]).map((fmt) => (
                <button
                  key={fmt}
                  className={'btn export-fmt-btn' + (settings.exportFmt === fmt ? ' active' : '')}
                  onClick={() => updateSettings({ exportFmt: fmt })}
                >
                  {fmt === 'webm' ? 'WebM · universal' : 'MP4 · social media'}
                </button>
              ))}
            </div>
            <div className="panel-help" style={{ marginTop: 10 }}>
              {formatNote}
            </div>
          </div>
        )}
        {rendering && (
          <div className="export-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: pct + '%' }} />
            </div>
            <div className="progress-text">{statusText}</div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
          {!rendering && (
            <button className="btn btn-primary" onClick={start}>
              Start Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
