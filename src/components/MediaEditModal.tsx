import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { fmtTime } from '../lib/utils';
import type { Clip, Photo } from '../state/types';

// Shared per-item edit modal. Photos get a rotate control (the rare EXIF-miss
// fix, roadmap #4); clips get a trim scrubber + audio mute toggle (Phase 5).
// Driven entirely by the store's `editingId` so any tile can open it.
export function MediaEditModal() {
  const editingId = useStore((s) => s.editingId);
  const item = useStore((s) => s.media.find((m) => m.id === s.editingId) ?? null);
  const closeEditor = useStore((s) => s.closeEditor);

  // Close on Escape, regardless of which sub-editor is showing.
  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingId, closeEditor]);

  if (!editingId || !item) return null;

  return (
    <div className="modal-backdrop active" onClick={(e) => e.target === e.currentTarget && closeEditor()}>
      <div className="modal media-edit-modal">
        {item.kind === 'photo' ? (
          <PhotoEditor photo={item} onClose={closeEditor} />
        ) : (
          <ClipEditor clip={item} onClose={closeEditor} />
        )}
      </div>
    </div>
  );
}

function PhotoEditor({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const rotatePhoto = useStore((s) => s.rotatePhoto);
  const [busy, setBusy] = useState(false);

  const rotate = async (turns: number) => {
    if (busy) return;
    setBusy(true);
    await rotatePhoto(photo.id, turns);
    setBusy(false);
  };

  return (
    <>
      <h2>Edit photo</h2>
      <p>Rotate a photo that came in sideways. Each tap turns it a quarter turn.</p>
      <div className="media-edit-preview">
        <img src={photo.url} alt={photo.name} className={busy ? 'is-busy' : ''} />
      </div>
      <div className="media-edit-controls">
        <button className="btn" onClick={() => rotate(-1)} disabled={busy} title="Rotate left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Rotate left
        </button>
        <button className="btn" onClick={() => rotate(1)} disabled={busy} title="Rotate right">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Rotate right
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose} disabled={busy}>
          Done
        </button>
      </div>
    </>
  );
}

function ClipEditor({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const setClipTrim = useStore((s) => s.setClipTrim);
  const setClipMuted = useStore((s) => s.setClipMuted);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const dur = clip.naturalDuration || 0;
  // Local handle positions for smooth dragging; committed to the store on release
  // so we don't re-render the whole grid on every pointer move.
  const [inP, setInP] = useState(clip.inPoint);
  const [outP, setOutP] = useState(clip.outPoint);
  const dragging = useRef<null | 'in' | 'out'>(null);
  const previewing = useRef(false);

  // Keep local state in sync if the store value changes underneath us.
  useEffect(() => {
    setInP(clip.inPoint);
    setOutP(clip.outPoint);
  }, [clip.inPoint, clip.outPoint]);

  const fracToTime = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || dur <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * dur;
  };

  const onPointerDown = (which: 'in' | 'out') => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = which;
    previewing.current = false;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const t = fracToTime(e.clientX);
    const v = videoRef.current;
    if (dragging.current === 'in') {
      const next = Math.min(t, outP - 0.3);
      setInP(Math.max(0, next));
      if (v) v.currentTime = Math.max(0, next);
    } else {
      const next = Math.max(t, inP + 0.3);
      setOutP(Math.min(dur, next));
      if (v) v.currentTime = Math.min(dur, next);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragging.current = null;
    setClipTrim(clip.id, inP, outP); // commit
  };

  // Preview the trimmed range: seek to in-point, play, stop at out-point.
  const previewTrim = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused && previewing.current) {
      v.pause();
      previewing.current = false;
      return;
    }
    v.muted = clip.muted;
    v.currentTime = inP;
    previewing.current = true;
    v.play().catch(() => {});
  };

  // Stop preview playback at the out-point.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (previewing.current && v.currentTime >= outP) {
        v.pause();
        previewing.current = false;
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [outP]);

  const pct = (t: number) => (dur > 0 ? (t / dur) * 100 : 0);

  return (
    <>
      <h2>Trim clip</h2>
      <p>Drag the handles to set where this clip starts and ends. Photos around it flex to fit.</p>

      <div className="media-edit-preview">
        <video ref={videoRef} src={clip.src} playsInline preload="metadata" className="clip-edit-video" />
        <button className="clip-preview-btn" onClick={previewTrim} title="Preview the trimmed range">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
          Preview
        </button>
      </div>

      <div
        className="trim-track"
        ref={trackRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {clip.posterUrl && <img src={clip.posterUrl} alt="" className="trim-track-poster" />}
        {/* The dimmed wings are the trimmed-away portions; the clear band is kept. */}
        <div className="trim-cut trim-cut-left" style={{ width: `${pct(inP)}%` }} />
        <div className="trim-cut trim-cut-right" style={{ width: `${100 - pct(outP)}%` }} />
        <div className="trim-band" style={{ left: `${pct(inP)}%`, right: `${100 - pct(outP)}%` }} />
        <div
          className="trim-handle trim-handle-in"
          style={{ left: `${pct(inP)}%` }}
          onPointerDown={onPointerDown('in')}
          role="slider"
          aria-label="Clip start"
          aria-valuemin={0}
          aria-valuemax={dur}
          aria-valuenow={inP}
        >
          <span className="trim-handle-grip" aria-hidden />
        </div>
        <div
          className="trim-handle trim-handle-out"
          style={{ left: `${pct(outP)}%` }}
          onPointerDown={onPointerDown('out')}
          role="slider"
          aria-label="Clip end"
          aria-valuemin={0}
          aria-valuemax={dur}
          aria-valuenow={outP}
        >
          <span className="trim-handle-grip" aria-hidden />
        </div>
      </div>

      <div className="trim-readout">
        <span>Start <strong>{fmtTime(inP)}</strong></span>
        <span>Length <strong>{fmtTime(Math.max(0, outP - inP))}</strong></span>
        <span>End <strong>{fmtTime(outP)}</strong></span>
      </div>

      <div className="media-edit-controls">
        <button
          className={'btn clip-mute-toggle' + (clip.muted ? '' : ' active')}
          onClick={() => setClipMuted(clip.id, !clip.muted)}
          title={clip.muted ? 'Clip audio is muted — tap to play its sound' : 'Clip audio plays (music ducks) — tap to mute'}
        >
          {clip.muted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
          {clip.muted ? 'Audio muted' : 'Audio on'}
        </button>
      </div>

      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
}
