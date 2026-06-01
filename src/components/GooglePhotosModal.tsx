interface Props {
  onClose: () => void;
}

export function GooglePhotosModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2>Importing from Google Drive</h2>
        <p>
          Camp Clips works with photos already on your device, so the trick is getting your Drive folder downloaded
          first. It takes about two minutes:
        </p>
        <ol className="how-to-list">
          <li>
            Have leaders drop their camp photos into <strong>one shared Google Drive folder</strong> during the week.
          </li>
          <li>
            On your computer, open <code>drive.google.com</code> and find that folder.
          </li>
          <li>
            <strong>Right-click the folder</strong> → <strong>Download</strong>. Drive zips it up for you.
          </li>
          <li>
            <strong>Unzip</strong> the downloaded file.
          </li>
          <li>
            Back here, click <strong>"Folder"</strong> and pick the unzipped folder — every photo loads at once.
          </li>
        </ol>
        <p className="panel-help" style={{ marginTop: 14 }}>
          <strong style={{ color: 'var(--accent)' }}>Phone tip:</strong> in the Google Drive app you can select photos
          and "Make available offline" or save them to Files, then use <strong>"Photos"</strong> to pick them — or sync
          the folder to your computer first.
        </p>
        <p className="panel-help" style={{ marginTop: 10 }}>
          A direct "paste a Drive link" import is on the roadmap. For now this manual route keeps everything in your
          browser — nothing uploads anywhere.
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
