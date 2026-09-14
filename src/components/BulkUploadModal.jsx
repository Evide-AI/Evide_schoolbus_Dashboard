import { useState } from 'react';
import Modal from './Modal';

// MVP: this is the upload UI only (as agreed) — it accepts a file and shows a
// preview affordance, but does not yet parse/commit rows. The parsing pipeline
// is a fast follow. Kept deliberately honest so a demo doesn't imply working
// import.
export default function BulkUploadModal({ onClose }) {
  const [fileName, setFileName] = useState(null);

  return (
    <Modal title="Upload student spreadsheet" onClose={onClose} width={520}>
      <p className="muted bulk-intro">
        Upload an .xlsx or .csv with your student roster. Import processing is coming soon —
        for now, add students individually from the roster.
      </p>

      <label className="bulk-drop" htmlFor="bulk-file">
        <div className="bulk-drop-icon">⬆</div>
        <div className="bulk-drop-text">
          {fileName ? <strong>{fileName}</strong> : 'Choose a spreadsheet file'}
        </div>
        <div className="muted bulk-drop-hint">.xlsx or .csv</div>
        <input
          id="bulk-file"
          type="file"
          accept=".xlsx,.csv"
          style={{ display: 'none' }}
          onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
        />
      </label>

      <div className="bulk-columns">
        <div className="bulk-columns-label muted">Expected columns</div>
        <code>Name, Admission Number, Pickup Lat, Pickup Lng, Drop Lat, Drop Lng, Parent Phone</code>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" disabled title="Import processing coming soon">
          Import
        </button>
      </div>
    </Modal>
  );
}
