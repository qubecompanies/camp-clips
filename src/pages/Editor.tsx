import { useState, useEffect } from 'react';
import { useStore } from '../state/store';
import { AppHeader } from '../components/AppHeader';
import { Sidebar } from '../components/Sidebar';
import { PhotoGrid } from '../components/PhotoGrid';
import { PlaybackOverlay } from '../components/PlaybackOverlay';
import { ExportModal } from '../components/ExportModal';
import { GooglePhotosModal } from '../components/GooglePhotosModal';
import { Toast } from '../components/Toast';
import { startPlayback, stopPlayback, togglePause } from '../lib/playback';
import { unlockAudio } from '../lib/audioContext';

export default function Editor() {
  const [showExport, setShowExport] = useState(false);
  const [showGooglePhotos, setShowGooglePhotos] = useState(false);

  // Keyboard shortcuts while playing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!useStore.getState().playback.active) return;
      if (e.key === 'Escape') stopPlayback();
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handlePlay = () => {
    // CRITICAL: unlock iOS audio context synchronously within this user gesture,
    // BEFORE startPlayback() runs requestFullscreen or any async work.
    unlockAudio();
    startPlayback();
  };

  const handleExport = () => {
    if (!useStore.getState().photos.some((p) => p.included)) return;
    setShowExport(true);
  };

  return (
    <>
      <AppHeader onPlay={handlePlay} onExport={handleExport} />
      <div className="app-body">
        <Sidebar onShowGooglePhotos={() => setShowGooglePhotos(true)} />
        <PhotoGrid onShowGooglePhotos={() => setShowGooglePhotos(true)} />
      </div>
      <PlaybackOverlay />
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showGooglePhotos && <GooglePhotosModal onClose={() => setShowGooglePhotos(false)} />}
      <Toast />
    </>
  );
}
