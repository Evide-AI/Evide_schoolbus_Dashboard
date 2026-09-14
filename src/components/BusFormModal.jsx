import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

// Handles both create (no `bus` prop) and edit (bus provided).
export default function BusFormModal({ schoolId, bus, onClose, onSaved }) {
  const isEdit = Boolean(bus);
  const [busNumber, setBusNumber] = useState(bus?.bus_number || '');
  const [imei, setImei] = useState(bus?.gt06_device_imei || '');
  const [capacity, setCapacity] = useState(bus?.seat_capacity ?? 40);
  const [status, setStatus] = useState(bus?.status || 'not_running');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      bus_number: busNumber.trim(),
      gt06_device_imei: imei.trim() || null,
      seat_capacity: Number(capacity),
      status,
    };

    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from('buses').update(payload).eq('id', bus.id));
    } else {
      ({ error: err } = await supabase.from('buses').insert({ ...payload, school_id: schoolId }));
    }

    if (err) {
      setError(err.message);
      setSaving(false);
    } else {
      onSaved();
    }
  }

  return (
    <Modal title={isEdit ? `Edit ${bus.bus_number}` : 'Add bus'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-field">
          <label htmlFor="bus_number">Bus name or number</label>
          <input id="bus_number" value={busNumber} onChange={(e) => setBusNumber(e.target.value)}
            placeholder="e.g. Bus 7" required />
        </div>

        <div className="form-field">
          <label htmlFor="imei">GPS device IMEI <span className="muted">(optional)</span></label>
          <input id="imei" value={imei} onChange={(e) => setImei(e.target.value)}
            placeholder="Device IMEI for live tracking" />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="capacity">Seat capacity</label>
            <input id="capacity" type="number" min="1" value={capacity}
              onChange={(e) => setCapacity(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="running">Running</option>
              <option value="not_running">Not running</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add bus'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
