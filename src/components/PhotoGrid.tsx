import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { useStore } from '../state/store';
import { isImageFile, isAudioFile } from '../lib/utils';
import { toast } from '../state/toastStore';

interface Props {
  onShowGooglePhotos: () => void;
}

const GooglePhotosIcon = () => (
  <svg className="icon" viewBox="0 0 64 64">
    <path d="M32 4 C20 4 16 16 16 28 L4 28 C4 16 16 4 32 4 Z" fill="#FBBC04" />
    <path d="M60 32 C60 20 48 16 36 16 L36 4 C48 4 60 16 60 32 Z" fill="#EA4335" />
    <path d="M32 60 C44 60 48 48 48 36 L60 36 C60 48 48 60 32 60 Z" fill="#4285F4" />
    <path d="M4 32 C4 44 16 48 28 48 L28 60 C16 60 4 48 4 32 Z" fill="#34A853" />
  </svg>
);

export function PhotoGrid({ onShowGooglePhotos }: Props) {
  const photos = useStore((s) => s.photos);
  const addPhotos = useStore((s) => s.addPhotos);
  const addSongs = useStore((s) => s.addSongs);
  const removePhoto = useStore((s) => s.removePhoto);
  const togglePhoto = useStore((s) => s.togglePhoto);
  const clearPhotos = useStore((s) => s.clearPhotos);
  const shufflePhotos = useStore((s) => s.shufflePhotos);
  const reorderPhotos = useStore((s) => s.reorderPhotos);

  const gridRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    sortableRef.current = Sortable.create(gridRef.current, {
      animation: 180,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        const { oldIndex, newIndex, from, item } = evt;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        // Revert Sortable's DOM mutation so React remains the source of truth,
        // then re-derive the order by index math and push it to the store.
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        const ids = useStore.getState().photos.map((p) => p.id);
        const [moved] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, moved);
        reorderPhotos(ids);
      },
    });
    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [reorderPhotos]);

  const included = photos.filter((p) => p.included).length;

  const handleClear = () => {
    if (!photos.length) return;
    if (!confirm(`Clear all ${photos.length} photos?`)) return;
    clearPhotos();
  };

  const handleShuffle = () => {
    if (photos.length < 2) {
      toast('Add more photos to shuffle.', 'info');
      return;
    }
    shufflePhotos();
    toast('Photos shuffled.', 'success');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const images = files.filter(isImageFile);
    const audio = files.filter(isAudioFile);
    if (images.length) addPhotos(images);
    if (audio.length) addSongs(audio);
    if (!images.length && !audio.length) toast('Drop photos or audio files to add them.', 'error');
  };

  return (
    <main className="main-content">
      <div className="photos-toolbar">
        <div className="toolbar-title">Photos</div>
        <button
          className="btn btn-ghost btn-icon"
          title="How to import from Google Photos"
          style={{ marginLeft: -6 }}
          onClick={onShowGooglePhotos}
        >
          <GooglePhotosIcon />
        </button>
        <div className="toolbar-info">
          {photos.length
            ? `${included} of ${photos.length} included · drag to reorder · click to toggle`
            : 'No photos yet'}
        </div>
        <button className="btn" title="Randomize photo order now" onClick={handleShuffle}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
          Shuffle
        </button>
        <button className="btn" onClick={handleClear}>
          Clear All
        </button>
        <button className="btn btn-primary" onClick={() => photosInputRef.current?.click()}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Photos
        </button>
        <input
          ref={photosInputRef}
          type="file"
          className="file-input"
          accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp"
          multiple
          onChange={(e) => {
            if (e.target.files) addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="file-input"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          multiple
          onChange={(e) => {
            if (e.target.files) addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="photos-area" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {!photos.length && (
          <div className="empty-state" style={{ display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <h2>Add your camp photos</h2>
            <p>Drop them here, or pick from this device. They stay in your browser — nothing uploads anywhere.</p>
            <div className="empty-actions">
              <button className="btn btn-primary btn-large" onClick={() => photosInputRef.current?.click()}>
                Select Photos
              </button>
              <button className="btn btn-large" onClick={() => folderInputRef.current?.click()}>
                Select Folder
              </button>
              <button className="btn btn-large" onClick={onShowGooglePhotos}>
                <GooglePhotosIcon />
                From Google Photos
              </button>
            </div>
          </div>
        )}
        <div ref={gridRef} className="photo-grid">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className={'photo-card' + (photo.included ? '' : ' excluded') + (photo.loadError ? ' load-error' : '')}
              data-id={photo.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.remove-btn')) {
                  removePhoto(photo.id);
                  return;
                }
                togglePhoto(photo.id);
              }}
            >
              <img src={photo.url} alt="" loading="lazy" />
              <div className="photo-error">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="photo-error-name">{photo.name}</div>
                <div className="photo-error-hint">Can't display this file</div>
              </div>
              <span className="photo-index">{index + 1}</span>
              <div className="photo-actions">
                <button className="photo-action-btn remove-btn" title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
