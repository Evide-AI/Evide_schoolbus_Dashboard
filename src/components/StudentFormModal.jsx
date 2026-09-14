import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

// Create or edit a student on a given bus. Coordinates are optional at creation
// (a dot in the roster shows whether they've been set), but needed before the
// parent app can draw that child's route.
export default function StudentFormModal({ busId, schoolId, student, onClose, onSaved }) {
  const isEdit = Boolean(student);
  const [fullName, setFullName] = useState(student?.full_name || '');
  const [admissionNumber, setAdmissionNumber] = useState(student?.admission_number || '');
  const [pickupLat, setPickupLat] = useState(student?.pickup_lat ?? '');
  const [pickupLng, setPickupLng] = useState(student?.pickup_lng ?? '');
  const [dropLat, setDropLat] = useState(student?.drop_lat ?? '');
  const [dropLng, setDropLng] = useState(student?.drop_lng ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      full_name: fullName.trim(),
      admission_number: admissionNumber.trim(),
      pickup_lat: numOrNull(pickupLat),
      pickup_lng: numOrNull(pickupLng),
      drop_lat: numOrNull(dropLat),
      drop_lng: numOrNull(dropLng),
      bus_id: busId,
    };

    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from('students').update(payload).eq('id', student.id));
    } else {
      ({ error: err } = await supabase.from('students').insert({ ...payload, school_id: schoolId }));
    }

    if (err) {
      // Friendlier message for the common duplicate-admission-number case.
      setError(err.code === '23505'
        ? 'A student with this admission number already exists in your school.'
        : err.message);
      setSaving(false);
    } else {
      onSaved();
    }
  }

  return (
    <Modal title={isEdit ? `Edit ${student.full_name}` : 'Add student'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="admission_number">Admission number</label>
            <input id="admission_number" value={admissionNumber}
              onChange={(e) => setAdmissionNumber(e.target.value)} required />
          </div>
        </div>

        <div className="coord-group">
          <div className="coord-group-label">Pickup location</div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pickup_lat">Latitude</label>
              <input id="pickup_lat" value={pickupLat} onChange={(e) => setPickupLat(e.target.value)}
                placeholder="e.g. 10.9512" inputMode="decimal" />
            </div>
            <div className="form-field">
              <label htmlFor="pickup_lng">Longitude</label>
              <input id="pickup_lng" value={pickupLng} onChange={(e) => setPickupLng(e.target.value)}
                placeholder="e.g. 76.0211" inputMode="decimal" />
            </div>
          </div>
        </div>

        <div className="coord-group">
          <div className="coord-group-label">Drop location</div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="drop_lat">Latitude</label>
              <input id="drop_lat" value={dropLat} onChange={(e) => setDropLat(e.target.value)}
                placeholder="e.g. 10.9650" inputMode="decimal" />
            </div>
            <div className="form-field">
              <label htmlFor="drop_lng">Longitude</label>
              <input id="drop_lng" value={dropLng} onChange={(e) => setDropLng(e.target.value)}
                placeholder="e.g. 76.0400" inputMode="decimal" />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add student'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
