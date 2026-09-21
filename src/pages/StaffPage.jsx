import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ROLE_LABEL, formatPhone } from '../lib/staff';
import StaffFormModal from '../components/StaffFormModal';
import CredentialsModal from '../components/CredentialsModal';
import './StudentsPage.css';
import './StaffPage.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'driver', label: 'Drivers' },
  { id: 'conductor', label: 'Conductors' },
];

export default function StaffPage() {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [staff, setStaff] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [credentials, setCredentials] = useState(null); // { staff, password, isReset }

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    const [{ data: s, error: e1 }, { data: b, error: e2 }] = await Promise.all([
      supabase.from('drivers').select('id, full_name, phone, role, bus_id, is_active')
        .eq('school_id', schoolId).order('full_name'),
      supabase.from('buses').select('id, bus_number').eq('school_id', schoolId).eq('is_active', true).order('bus_number'),
    ]);
    if (e1 || e2) { setError((e1 || e2).message); setLoading(false); return; }
    setStaff(s || []);
    setBuses(b || []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const busName = useMemo(() => Object.fromEntries(buses.map((b) => [b.id, b.bus_number])), [buses]);

  const crewByBus = useMemo(() => {
    const m = {};
    for (const s of staff) if (s.bus_id && s.is_active) (m[s.bus_id] ||= []).push(s);
    return m;
  }, [staff]);

  const busesWithoutDriver = buses.filter((b) => !(crewByBus[b.id] || []).some((c) => c.role === 'driver'));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return staff.filter((s) =>
      (filter === 'all' || s.role === filter) &&
      (!q || s.full_name.toLowerCase().includes(q) || (qDigits && String(s.phone || '').includes(qDigits))));
  }, [staff, filter, query]);

  function handleSaved(row, password, isReset = false) {
    setAdding(false);
    setEditing(null);
    if (password) setCredentials({ staff: row, password, isReset });
    load();
  }

  const driverCount = staff.filter((s) => s.role === 'driver').length;
  const conductorCount = staff.length - driverCount;

  return (
    <div>
      <header className="page-head staff-head">
        <div>
          <h1>Drivers &amp; conductors</h1>
          <p className="muted">
            {driverCount} driver{driverCount === 1 ? '' : 's'}, {conductorCount} conductor{conductorCount === 1 ? '' : 's'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add driver or conductor</button>
      </header>

      {error && <div className="page-error">{error}</div>}

      {!loading && busesWithoutDriver.length > 0 && staff.length > 0 && (
        <div className="staff-notice">
          {busesWithoutDriver.length === 1
            ? <><strong>{busesWithoutDriver[0].bus_number}</strong> has no driver assigned.</>
            : <><strong>{busesWithoutDriver.length} buses</strong> have no driver: {busesWithoutDriver.map((b) => b.bus_number).join(', ')}.</>}
        </div>
      )}

      <div className="staff-toolbar">
        <div className="segmented segmented-compact" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id}
              className={`segmented-item ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search by name or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="muted loading-row">Loading…</div>
      ) : staff.length === 0 ? (
        <div className="empty-state card">
          <h3>No drivers or conductors yet</h3>
          <p className="muted">Add them here to give each one a login for the driver app.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add driver or conductor</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card"><h3>No one matches</h3></div>
      ) : (
        <div className="staff-table card">
          <div className="staff-row staff-row-head">
            <span>Name</span><span>Phone</span><span>Bus</span><span>Status</span><span></span>
          </div>
          {filtered.map((s) => (
            <div className={`staff-row ${s.is_active ? '' : 'is-inactive'}`} key={s.id}>
              <span className="staff-name-cell">
                <span className="roster-avatar"><span className="roster-avatar-initial">{(s.full_name[0] || '?').toUpperCase()}</span></span>
                <span className="staff-name-text">
                  <span className="roster-name">{s.full_name}</span>
                  <span className={`role-tag role-${s.role}`}>{ROLE_LABEL[s.role]}</span>
                </span>
              </span>
              <a className="staff-phone" href={`tel:${s.phone}`}>{formatPhone(s.phone)}</a>
              <span>
                {s.bus_id
                  ? <span className="bus-tag">{busName[s.bus_id] || 'Removed bus'}</span>
                  : <span className="bus-tag bus-tag-free">No bus</span>}
              </span>
              <span className={`status-dot ${s.is_active ? 'is-on' : ''}`}>{s.is_active ? 'Active' : 'Deactivated'}</span>
              <span className="students-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(s)}>Manage</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <StaffFormModal
          staff={editing}
          buses={buses}
          crewByBus={crewByBus}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={handleSaved}
          onRemoved={() => { setEditing(null); load(); }}
        />
      )}
      {credentials && (
        <CredentialsModal {...credentials} onClose={() => setCredentials(null)} />
      )}
    </div>
  );
}
