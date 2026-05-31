import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { setPlaybackRefs, clearPlaybackRefs, stopPlayback, togglePause } from '../lib/playback';

export function PlaybackOverlay() {
  const paused = useStore((s) => s.playback.paused);

  const overlayRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement>(null);
  const imgBRef = useRef<HTMLImageElement>(null);
  const textOverlayRef = useRef<HTMLDivElement>(null);
  const textTitleRef = useRef<HTMLHeadingElement>(null);
  const textSubtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (
      overlayRef.current &&
      progressRef.current &&
      imgARef.current &&
      imgBRef.current &&
      textOverlayRef.current &&
      textTitleRef.current &&
      textSubtitleRef.current
    ) {
      setPlaybackRefs({
        overlay: overlayRef.current,
        imgA: imgARef.current,
        imgB: imgBRef.current,
        textOverlay: textOverlayRef.current,
        textOverlayTitle: textTitleRef.current,
        textOverlaySubtitle: textSubtitleRef.current,
        playbackProgress: progressRef.current,
      });
    }
    return () => clearPlaybackRefs();
  }, []);

  return (
    <div className="playback-overlay" id="playbackOverlay" ref={overlayRef}>
      <div className="playback-progress" ref={progressRef} />
      <div className="playback-images">
        <img ref={imgARef} alt="" />
        <img ref={imgBRef} alt="" />
      </div>
      <div className="playback-text-overlay" ref={textOverlayRef}>
        <h1 ref={textTitleRef} />
        <p ref={textSubtitleRef} />
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
