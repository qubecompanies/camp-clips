import { useEffect, useRef, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import { setPlaybackRefs, clearPlaybackRefs, stopPlayback, togglePause } from '../lib/playback';

const ASPECT_DIMS: Record<string, { aw: number; ah: number }> = {
  '16:9': { aw: 16, ah: 9 },
  '9:16': { aw: 9, ah: 16 },
  '1:1': { aw: 1, ah: 1 },
};

export function PlaybackOverlay() {
  const paused = useStore((s) => s.playback.paused);
  const active = useStore((s) => s.playback.active);
  const exportAspect = useStore((s) => s.settings.exportAspect);

  const overlayRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement>(null);
  const imgBRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textOverlayRef = useRef<HTMLDivElement>(null);
  const textTitleRef = useRef<HTMLHeadingElement>(null);
  const textSubtitleRef = useRef<HTMLParagraphElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      overlayRef.current &&
      progressRef.current &&
      imgARef.current &&
      imgBRef.current &&
      videoRef.current &&
      textOverlayRef.current &&
      textTitleRef.current &&
      textSubtitleRef.current &&
      captionRef.current
    ) {
      setPlaybackRefs({
        overlay: overlayRef.current,
        imgA: imgARef.current,
        imgB: imgBRef.current,
        video: videoRef.current,
        textOverlay: textOverlayRef.current,
        textOverlayTitle: textTitleRef.current,
        textOverlaySubtitle: textSubtitleRef.current,
        caption: captionRef.current,
        playbackProgress: progressRef.current,
      });
    }
    return () => clearPlaybackRefs();
  }, []);

  // Auto-hide the controls + mouse cursor during the show. Any mouse movement
  // wakes them; after ~2.5s of stillness they fade out again. Managed via a
  // class on the overlay (imperative, so it doesn't fight the 'active' class
  // that the playback engine toggles on the same node).
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!active || !overlay) return;
    let timer: number;
    const goIdle = () => overlay.classList.add('playback-idle');
    const wake = () => {
      overlay.classList.remove('playback-idle');
      window.clearTimeout(timer);
      timer = window.setTimeout(goIdle, 2500);
    };
    wake(); // start the idle countdown immediately
    overlay.addEventListener('mousemove', wake);
    return () => {
      window.clearTimeout(timer);
      overlay.removeEventListener('mousemove', wake);
      overlay.classList.remove('playback-idle');
    };
  }, [active]);

  return (
    <div className="playback-overlay" id="playbackOverlay" ref={overlayRef}>
      <div className="playback-progress" ref={progressRef} />
      {/* Stage is letterboxed to the chosen export aspect so the preview matches
          the exported video frame-for-frame. */}
      <div
        className="playback-stage"
        style={
          {
            '--aw': (ASPECT_DIMS[exportAspect] || ASPECT_DIMS['16:9']).aw,
            '--ah': (ASPECT_DIMS[exportAspect] || ASPECT_DIMS['16:9']).ah,
          } as CSSProperties
        }
      >
        <div className="playback-images">
          <img ref={imgARef} alt="" />
          <img ref={imgBRef} alt="" />
          <video ref={videoRef} className="playback-video" playsInline preload="auto" />
        </div>
        <div className="playback-text-overlay" ref={textOverlayRef}>
          <h1 ref={textTitleRef} />
          <p ref={textSubtitleRef} />
        </div>
        <div className="playback-caption" ref={captionRef} />
      </div>
      <div className="playback-controls">
        <button className="btn" onClick={togglePause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" onClick={stopPlayback}>
          Exit (Esc)
        </button>
      </div>
    </div>
  );
}
