import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { useStore } from '../state/store';
import { isImageFile, isAudioFile, isVideoFile, fmtTime } from '../lib/utils';
import { toast } from '../state/toastStore';

interface Props {
  onShowGooglePhotos: () => void;
}

const GoogleDriveIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size * 1.12}
    height={size}
    viewBox="0 0 87.3 78"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.79 1.39-1.2 2.94-1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.56-.41-3.11-1.2-4.5z" fill="#ffba00" />
  </svg>
);

export function PhotoGrid({ onShowGooglePhotos }: Props) {
  // ONE ordered list now: photos and clips interleaved. The grid renders this in
  // order and a single Sortable reorders across both.
  const media = useStore((s) => s.media);
  const sections = useStore((s) => s.sections);
  const addPhotos = useStore((s) => s.addPhotos);
  const addVideos = useStore((s) => s.addVideos);
  const convertClip = useStore((s) => s.convertClip);
  const addSongs = useStore((s) => s.addSongs);
  const addSection = useStore((s) => s.addSection);
  const removeMedia = useStore((s) => s.removeMedia);
  const toggleMedia = useStore((s) => s.toggleMedia);
  const clearMedia = useStore((s) => s.clearMedia);
  const shuffleMedia = useStore((s) => s.shuffleMedia);
  const sortByDate = useStore((s) => s.sortByDate);
  const reorderMedia = useStore((s) => s.reorderMedia);

  const gridRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const clipsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    sortableRef.current = Sortable.create(gridRef.current, {
      animation: 180,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      // Action buttons must not start a drag (Sortable would otherwise swallow
      // their click). preventOnFilter:false lets the native click through.
      filter: '.convert-btn, .remove-btn, .section-btn, .photo-action-btn',
      preventOnFilter: false,
      onEnd: (evt) => {
        const { oldIndex, newIndex, from, item } = evt;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        // Revert Sortable's DOM mutation so React remains the source of truth,
        // then re-derive the order by index math and push it to the store.
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        const ids = useStore.getState().media.map((m) => m.id);
        const [moved] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, moved);
        reorderMedia(ids);
      },
    });
    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [reorderMedia]);

  const included = media.filter((m) => m.included).length;
  const sectionByPhoto = new Map(sections.map((s) => [s.beforePhotoId, s]));

  const handleClear = () => {
    if (!media.length) return;
    if (!confirm(`Clear all ${media.length} item${media.length === 1 ? '' : 's'}?`)) return;
    clearMedia();
  };

  const handleShuffle = () => {
    if (media.length < 2) {
      toast('Add more to shuffle.', 'info');
      return;
    }
    shuffleMedia();
    toast('Shuffled.', 'success');
  };

  const handleSortByDate = () => {
    if (media.length < 2) {
      toast('Add more to sort.', 'info');
      return;
    }
    sortByDate();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const images = files.filter(isImageFile);
    const audio = files.filter(isAudioFile);
    const video = files.filter(isVideoFile);
    if (images.length) addPhotos(images);
    if (audio.length) addSongs(audio);
    if (video.length) addVideos(video);
    if (!images.length && !audio.length && !video.length) {
      toast('Drop photos, video clips, or audio files to add them.', 'error');
    }
  };

  // Running photo number so photos read 1..N in order, regardless of clips
  // interleaved between them.
  let photoNum = 0;

  return (
    <main className="main-content">
      <div className="photos-toolbar">
        <div className="toolbar-title">Photos &amp; Clips</div>
        <button
          className="btn btn-ghost btn-icon"
          title="How to import from Google Drive"
          style={{ marginLeft: -6 }}
          onClick={onShowGooglePhotos}
        >
          <GoogleDriveIcon />
        </button>
        <div className="toolbar-info">
          {media.length
            ? `${included} of ${media.length} included · drag to reorder · click to toggle`
            : 'No photos yet'}
        </div>
        <button className="btn" title="Order by the date each item was taken" onClick={handleSortByDate}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          By Date
        </button>
        <button className="btn" title="Randomize order now" onClick={handleShuffle}>
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
        <button className="btn" title="Add video clips (MP4, MOV)" onClick={() => clipsInputRef.current?.click()}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Add Clips
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
        <input
          ref={clipsInputRef}
          type="file"
          className="file-input"
          accept="video/*,.mp4,.mov,.m4v,.webm"
          multiple
          onChange={(e) => {
            if (e.target.files) addVideos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="photos-area" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {!media.length && (
          <div className="empty-state" style={{ display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <h2>Add your camp photos</h2>
            <p>Drag photos or clips in, or pick them below. They stay in your browser — nothing uploads anywhere.</p>
            <div className="empty-actions">
              <button className="btn btn-primary btn-large import-btn" onClick={() => photosInputRef.current?.click()}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Photos
              </button>
              <button className="btn btn-large import-btn" onClick={() => folderInputRef.current?.click()}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                Folder
              </button>
              <button className="btn btn-large import-btn" onClick={onShowGooglePhotos}>
                <GoogleDriveIcon size={16} />
                Google Drive
              </button>
            </div>
          </div>
        )}

        <div ref={gridRef} className="photo-grid">
          {media.map((item) => {
            if (item.kind === 'clip') {
              const clip = item;
              const needsConvert = clip.status === 'needs-convert';
              const converting = clip.status === 'converting';
              const errored = clip.status === 'error';
              const pct = Math.round((clip.convertProgress ?? 0) * 100);
              return (
                <div
                  key={clip.id}
                  className={
                    'clip-card' +
                    (clip.included ? '' : ' excluded') +
                    (needsConvert || errored ? ' needs-convert' : '') +
                    (converting ? ' converting' : '')
                  }
                  data-id={clip.id}
                  onClick={(e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest('.remove-btn')) {
                      removeMedia(clip.id);
                      return;
                    }
                    if (t.closest('.convert-btn')) {
                      convertClip(clip.id);
                      return;
                    }
                    if (needsConvert || converting || errored) return; // not toggleable until playable
                    toggleMedia(clip.id);
                  }}
                >
                  {clip.posterUrl ? (
                    <img src={clip.posterUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="clip-placeholder">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                      <div className="clip-placeholder-name">{clip.name}</div>
                    </div>
                  )}

                  {/* Clip glyph — film strip reads without color (deuteranopia-safe),
                      distinguishing a clip tile from a photo tile at a glance. */}
                  {clip.status === 'ready' && (
                    <span className="clip-play-badge" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6 4 20 12 6 20 6 4" />
                      </svg>
                    </span>
                  )}

                  {clip.status === 'ready' && clip.naturalDuration > 0 && (
                    <span className="clip-duration-pill">{fmtTime(clip.naturalDuration)}</span>
                  )}

                  {/* HEVC / undecodable: guidance + opt-in on-device convert */}
                  {needsConvert && (
                    <div className="clip-convert-overlay">
                      <div className="clip-convert-msg">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>This clip’s format (likely iPhone HEVC) can’t play here yet.</span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm convert-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          convertClip(clip.id);
                        }}
                      >
                        Convert on device
                      </button>
                    </div>
                  )}

                  {converting && (
                    <div className="clip-convert-overlay">
                      <div className="clip-convert-progress">
                        <div className="clip-convert-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="clip-convert-pct">Converting… {pct}%</span>
                    </div>
                  )}

                  {errored && (
                    <div className="clip-convert-overlay">
                      <div className="clip-convert-msg">
                        <span>Conversion failed. Try converting it on your computer, then re-add.</span>
                      </div>
                      <button
                        className="btn btn-sm convert-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          convertClip(clip.id);
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="photo-actions">
                    <button
                      className="photo-action-btn remove-btn"
                      title="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMedia(clip.id);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            }

            // Photo card
            const photo = item;
            photoNum++;
            const index = photoNum;
            const section = sectionByPhoto.get(photo.id);
            return (
              <div
                key={photo.id}
                className={'photo-card' + (photo.included ? '' : ' excluded') + (photo.loadError ? ' load-error' : '')}
                data-id={photo.id}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('.remove-btn')) {
                    removeMedia(photo.id);
                    return;
                  }
                  if (t.closest('.section-btn')) {
                    if (sectionByPhoto.has(photo.id)) {
                      toast('This photo already has a section card. Edit it in Setup ▸ Section Cards.', 'info');
                    } else {
                      addSection(photo.id);
                      toast('Section card added — title it in Setup ▸ Section Cards.', 'success');
                    }
                    return;
                  }
                  toggleMedia(photo.id);
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
                <span className="photo-index">{index}</span>
                {section && (
                  <span className="photo-section-badge" title={`Section card: ${section.title || 'Untitled'}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="4" y1="12" x2="14" y2="12" />
                      <line x1="4" y1="17" x2="11" y2="17" />
                    </svg>
                    {section.title || 'Section'}
                  </span>
                )}
                <div className="photo-actions">
                  <button
                    className={'photo-action-btn section-btn' + (section ? ' active' : '')}
                    title={section ? 'Has a section card (edit in Setup)' : 'Add a section card before this photo'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="4" y1="12" x2="14" y2="12" />
                      <line x1="4" y1="17" x2="11" y2="17" />
                    </svg>
                  </button>
                  <button className="photo-action-btn remove-btn" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
