interface Props {
  onClose: () => void;
}

export function GooglePhotosModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2>Importing from Google Photos</h2>
        <p>
          Google removed direct API access for shared albums in March 2025, so there's no "paste a link" option.
          But this manual workflow takes about 3 minutes and works every time:
        </p>
        <ol className="how-to-list">
          <li>
            Have all leaders share their camp photos to <strong>a single shared Google Photos album</strong> during
            the week.
          </li>
          <li>
            On your computer, open <code>photos.google.com</code> and open the shared album.
          </li>
          <li>
            Hover the first photo and click the <strong>checkmark</strong>, then scroll to the last photo and{' '}
            <strong>Shift+click</strong> its checkmark to select everything in between.
          </li>
          <li>
            Click the <strong>⋮ menu</strong> (top right) → <strong>Download all</strong>. Google delivers a ZIP
            file.
          </li>
          <li>
            <strong>Unzip</strong> the file on your computer.
          </li>
          <li>
            Back in Camp Clips, click <strong>"Select Folder"</strong> and pick the unzipped folder. Every photo
            loads at once.
          </li>
        </ol>
        <p className="panel-help" style={{ marginTop: 14 }}>
          <strong style={{ color: 'var(--accent)' }}>Phone tip:</strong> on iPhone/Android the Google Photos app can
          also export an album to Files / Drive — from there, use "Select Photos" or sync the folder to your computer
          first.
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
