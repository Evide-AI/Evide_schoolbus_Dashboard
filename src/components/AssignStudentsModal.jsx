import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

// Search all of the school's students and assign selected ones to `bus`.
// Students already on another bus get reassigned (their bus_id is updated).
export default function AssignStudentsModal({ bus, schoolId, onClose, onDone }) {
  const [allStudents, setAllStudents] = useState([]);
  const [busNames, setBusNames] = useState({}); // bus_id -> bus_number
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: stu, error: e1 }, { data: buses, error: e2 }] = await Promise.all([
        supabase.from('students')
          .select('id, full_name, admission_number, bus_id')
          .eq('school_id', schoolId).order('full_name'),
        supabase.from('buses').select('id, bus_number').eq('school_id', schoolId),
      ]);
      if (e1 || e2) { setError((e1 || e2).message); setLoading(false); return; }
      setAllStudents(stu || []);
      const names = {};
      for (const b of buses || []) names[b.id] = b.bus_number;
      setBusNames(names);
      setLoading(false);
    })();
  }, [schoolId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Exclude students already on THIS bus — nothing to assign there.
    const assignable = allStudents.filter((s) => s.bus_id !== bus.id);
    if (!q) return assignable;
    return assignable.filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    );
  }, [allStudents, query, bus.id]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function assign() {
    if (selected.size === 0) { setError('Select at least one student to assign.'); return; }
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('students')
      .update({ bus_id: bus.id })
      .in('id', [...selected]);
    if (updErr) { setError(updErr.message); setSaving(false); }
    else onDone(selected.size);
  }

  return (
    <Modal title={`Assign students to ${bus.bus_number}`} onClose={onClose} width={540}>
      {error && <div className="form-error">{error}</div>}

      <div className="form-field">
        <input
          type="text"
          placeholder="Search by name or admission number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {loading ? (
        <p className="muted">Loading students…</p>
      ) : filtered.length === 0 ? (
        <p className="muted assign-empty">
          {query ? 'No students match your search.' : 'No other students to assign.'}
        </p>
      ) : (
        <>
          <div className="migrate-list-head">
            <span className="muted">{selected.size} selected</span>
          </div>
          <div className="migrate-list">
            {filtered.map((s) => (
              <label key={s.id} className="migrate-row">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="migrate-name">{s.full_name}</span>
                <span className="muted assign-adm">{s.admission_number}</span>
                <span className="assign-current">
                  {s.bus_id
                    ? <span className="assign-tag">on {busNames[s.bus_id] || 'another bus'}</span>
                    : <span className="assign-tag assign-tag-free">Unassigned</span>}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={assign}
          disabled={saving || selected.size === 0}>
          {saving ? 'Assigning…' : `Assign ${selected.size || ''}`.trim()}
        </button>
      </div>
    </Modal>
  );
}
