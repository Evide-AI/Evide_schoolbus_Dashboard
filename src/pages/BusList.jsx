import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import BusFormModal from '../components/BusFormModal';
import './BusList.css';

const STATUS_LABEL = {
  running: 'Running',
  not_running: 'Not running',
  maintenance: 'Maintenance',
};

export default function BusList({ onOpenBus }) {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [buses, setBuses] = useState([]);
  const [counts, setCounts] = useState({}); // bus_id -> student count
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);

    const { data: busData, error: busErr } = await supabase
      .from('buses')
      .select('id, bus_number, status, seat_capacity, is_active')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('bus_number');

    if (busErr) { setError(busErr.message); setLoading(false); return; }

    // Student counts per bus (one grouped query via rpc-free approach:
    // fetch bus_id for each active student, tally client-side — fine at MVP scale).
    const { data: studentRows, error: cntErr } = await supabase
      .from('students')
      .select('bus_id')
      .eq('school_id', schoolId);

    if (cntErr) { setError(cntErr.message); setLoading(false); return; }

    const tally = {};
    for (const row of studentRows || []) {
      if (row.bus_id) tally[row.bus_id] = (tally[row.bus_id] || 0) + 1;
    }

    setBuses(busData || []);
    setCounts(tally);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Fleet &amp; students</h1>
          <p className="muted">Manage buses, rosters, and parent alerts for your school.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add bus</button>
      </header>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="muted loading-row">Loading fleet…</div>
      ) : buses.length === 0 ? (
        <div className="empty-state card">
          <h3>No buses yet</h3>
          <p className="muted">Add your first bus to start building rosters and routes.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add bus</button>
        </div>
      ) : (
        <div className="bus-grid">
          {buses.map((bus) => (
            <button key={bus.id} className="bus-card card" onClick={() => onOpenBus(bus.id)}>
              <div className="bus-card-top">
                <span className="bus-number">{bus.bus_number}</span>
                <span className={`pill pill-${bus.status}`}>{STATUS_LABEL[bus.status]}</span>
              </div>
              <div className="bus-card-stats">
                <div>
                  <span className="stat-num">{counts[bus.id] || 0}</span>
                  <span className="stat-label muted">students</span>
                </div>
                <div>
                  <span className="stat-num">{bus.seat_capacity}</span>
                  <span className="stat-label muted">seats</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <BusFormModal
          schoolId={schoolId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}
