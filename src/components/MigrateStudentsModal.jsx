import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

// Move students off `fromBus` onto another bus. Coordinates are preserved —
// only bus_id changes, since the child's home hasn't moved, just their bus.
export default function MigrateStudentsModal({ fromBus, schoolId, onClose, onDone }) {
  const [students, setStudents] = useState([]);
  const [otherBuses, setOtherBuses] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [targetBusId, setTargetBusId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: stu, error: e1 }, { data: buses, error: e2 }] = await Promise.all([
        supabase.from('students').select('id, full_name, admission_number')
          .eq('bus_id', fromBus.id).order('full_name'),
        supabase.from('buses').select('id, bus_number, seat_capacity')
          .eq('school_id', schoolId).eq('is_active', true).neq('id', fromBus.id).order('bus_number'),
      ]);
      if (e1 || e2) { setError((e1 || e2).message); setLoading(false); return; }

      setStudents(stu || []);
      setOtherBuses(buses || []);
      // Default to selecting everyone (matches the common "move all" case).
      setSelected(new Set((stu || []).map((s) => s.id)));
      setLoading(false);
    })();
  }, [fromBus.id, schoolId]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))
    );
  }

  async function migrate() {
    if (!targetBusId) { setError('Choose a destination bus.'); return; }
    if (selected.size === 0) { setError('Select at least one student to move.'); return; }

    setSaving(true);
    setError(null);
    const ids = [...selected];
    const { error: updErr } = await supabase
      .from('students')
      .update({ bus_id: targetBusId })
      .in('id', ids);

    if (updErr) {
      setError(updErr.message);
      setSaving(false);
    } else {
      onDone(ids.length);
    }
  }

  const allSelected = students.length > 0 && selected.size === students.length;

  return (
    <Modal title={`Move students from ${fromBus.bus_number}`} onClose={onClose} width={520}>
      {loading ? (
        <p className="muted">Loading students…</p>
      ) : students.length === 0 ? (
        <p className="muted">This bus has no students to move.</p>
      ) : otherBuses.length === 0 ? (
        <p className="muted">There are no other active buses to move students to. Add another bus first.</p>
      ) : (
        <>
          {error && <div className="form-error">{error}</div>}

          <div className="form-field">
            <label htmlFor="target-bus">Move to</label>
            <select id="target-bus" value={targetBusId} onChange={(e) => setTargetBusId(e.target.value)}>
              <option value="">Choose a bus…</option>
              {otherBuses.map((b) => (
                <option key={b.id} value={b.id}>{b.bus_number} ({b.seat_capacity} seats)</option>
              ))}
            </select>
          </div>

          <div className="migrate-list-head">
            <span className="muted">{selected.size} of {students.length} selected</span>
            <button type="button" className="linklike" onClick={toggleAll}>
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="migrate-list">
            {students.map((s) => (
              <label key={s.id} className="migrate-row">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="migrate-name">{s.full_name}</span>
                <span className="muted">{s.admission_number}</span>
              </label>
            ))}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={migrate} disabled={saving}>
              {saving ? 'Moving…' : `Move ${selected.size} student${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
