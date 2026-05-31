import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { useStore } from '../state/store';
import { fmtTime } from '../lib/utils';

export function SongList() {
  const songs = useStore((s) => s.songs);
  const removeSong = useStore((s) => s.removeSong);
  const reorderSongs = useStore((s) => s.reorderSongs);
  const listRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 180,
      handle: '.song-handle',
      onEnd: (evt) => {
        const { oldIndex, newIndex, from, item } = evt;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        const ids = useStore.getState().songs.map((s) => s.id);
        const [moved] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, moved);
        reorderSongs(ids);
      },
    });
    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [reorderSongs]);

  if (!songs.length) {
    return (
      <div className="panel-help" style={{ textAlign: 'center', padding: '20px 0' }}>
        No songs yet. Songs play continuously through the slideshow.
      </div>
    );
  }

  return (
    <div ref={listRef} className="song-list">
      {songs.map((song) => (
        <div key={song.id} className={'song-item' + (song.included ? '' : ' excluded')} data-id={song.id}>
          <span className="song-handle">
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </span>
          <div className="song-info">
            <div className="song-name">{song.name}</div>
            <div className="song-duration">{fmtTime(song.duration)}</div>
          </div>
          <button
            className="song-remove"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              removeSong(song.id);
            }}
          >
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
