import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { regenerateBusRoute } from '../lib/api';
import Modal from './Modal';

const PHOTO_BUCKET = 'student-photos';

// Create or edit a student on a given bus. Photo is optional. Coordinates are
// optional at creation but needed before the parent app can draw the route.
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

  // Photo state: existing path (edit), a newly chosen file, and a preview URL.
  const [existingPhotoPath, setExistingPhotoPath] = useState(student?.photo_path || null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef(null);

  // For an existing photo, fetch a short-lived signed URL to preview it.
  useEffect(() => {
    let active = true;
    if (existingPhotoPath && !photoFile && !removePhoto) {
      supabase.storage.from(PHOTO_BUCKET).createSignedUrl(existingPhotoPath, 600).then(({ data }) => {
        if (active && data?.signedUrl) setPhotoPreview(data.signedUrl);
      });
    }
    return () => { active = false; };
  }, [existingPhotoPath, photoFile, removePhoto]);

  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large. Please use one under 5 MB.');
      return;
    }
    setError(null);
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      let photoPath = existingPhotoPath;

      // Upload a newly chosen photo first, so we can store its path on the row.
      if (photoFile) {
        const ext = (photoFile.name.split('.').pop() || 'jpg').toLowerCase();
        const safeAdm = admissionNumber.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'student';
        const path = `${schoolId}/${safeAdm}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
        photoPath = path;
      } else if (removePhoto) {
        photoPath = null;
      }

      const payload = {
        full_name: fullName.trim(),
        admission_number: admissionNumber.trim(),
        pickup_lat: numOrNull(pickupLat),
        pickup_lng: numOrNull(pickupLng),
        drop_lat: numOrNull(dropLat),
        drop_lng: numOrNull(dropLng),
        photo_path: photoPath,
        bus_id: busId,
      };

      let err;
      if (isEdit) {
        ({ error: err } = await supabase.from('students').update(payload).eq('id', student.id));
      } else {
        ({ error: err } = await supabase.from('students').insert({ ...payload, school_id: schoolId }));
      }
      if (err) {
        throw new Error(err.code === '23505'
          ? 'A student with this admission number already exists in your school.'
          : err.message);
      }

      // Ask the backend to (re)generate this bus's route now that the roster
      // changed. Best-effort — if the backend is offline (outside 6am-7pm), the
      // save still succeeds; the route regenerates next time.
      if (busId) {
        regenerateBusRoute(busId); // fire-and-forget, don't block the UI
      }

      onSaved();
    } catch (ex) {
      setError(ex.message);
      setSaving(false);
    }
  }

  const initial = (fullName.trim()[0] || '?').toUpperCase();

  return (
    <Modal title={isEdit ? `Edit ${student.full_name}` : 'Add student'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="photo-field">
          <div className="photo-preview">
            {photoPreview
              ? <img src={photoPreview} alt="Student" />
              : <span className="photo-initial">{initial}</span>}
          </div>
          <div className="photo-actions">
            <div className="photo-label">Profile photo <span className="muted">(optional)</span></div>
            <div className="photo-buttons">
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}>
                {photoPreview ? 'Change photo' : 'Upload photo'}
              </button>
              {photoPreview && (
                <button type="button" className="btn btn-danger btn-sm" onClick={clearPhoto}>Remove</button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={onPickFile} />
          </div>
        </div>

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
