import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import BusFormModal from '../components/BusFormModal';
import './BusList.css';

const STATUS_LABEL = {
  running: 'Running',
  not_running: 'Not running',
  maintenance: 'Maintenance',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BusList({ onOpenBus }) {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [buses, setBuses] = useState([]);
  const [counts, setCounts] = useState({});        // bus_id -> student count
  const [presentByBus, setPresentByBus] = useState({}); // bus_id -> present today
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

    const { data: studentRows, error: cntErr } = await supabase
      .from('students')
      .select('bus_id')
      .eq('school_id', schoolId);
    if (cntErr) { setError(cntErr.message); setLoading(false); return; }

    const tally = {};
    for (const row of studentRows || []) {
      if (row.bus_id) tally[row.bus_id] = (tally[row.bus_id] || 0) + 1;
    }

    // Present-today per bus (join through this school's buses).
    const busIds = (busData || []).map((b) => b.id);
    const present = {};
    if (busIds.length > 0) {
      const { data: attRows } = await supabase
        .from('attendance')
        .select('bus_id')
        .in('bus_id', busIds)
        .eq('date', todayStr())
        .eq('present', true);
      for (const r of attRows || []) {
        present[r.bus_id] = (present[r.bus_id] || 0) + 1;
      }
    }

    setBuses(busData || []);
    setCounts(tally);
    setPresentByBus(present);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  // Fleet-level summary numbers.
  const totalBuses = buses.length;
  const runningCount = buses.filter((b) => b.status === 'running').length;
  const totalStudents = Object.values(counts).reduce((a, b) => a + b, 0);
  const presentToday = Object.values(presentByBus).reduce((a, b) => a + b, 0);

  const chartData = buses.map((b) => ({
    name: b.bus_number,
    students: counts[b.id] || 0,
    status: b.status,
  }));

  const statusColor = { running: '#F5BD2A', not_running: '#C0392B', maintenance: '#8a6d1e' };

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

      {!loading && totalBuses > 0 && (
        <div className="summary-strip">
          <div className="summary-cards">
            <SummaryCard icon={<BusIcon />} value={totalBuses} label="Buses" tone="accent" />
            <SummaryCard icon={<SignalIcon />} value={runningCount} label="Running now" tone="signal" />
            <SummaryCard icon={<UsersIcon />} value={totalStudents} label="Students" tone="ink" />
            <SummaryCard icon={<CheckIcon />} value={presentToday} label="Present today" tone="go" />
          </div>
          <div className="summary-chart card">
            <div className="summary-chart-head">
              <span>Students per bus</span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8791a6' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(13,109,237,0.05)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e3e7ec', fontSize: 12 }}
                />
                <Bar dataKey="students" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={statusColor[entry.status] || '#0D6DED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading ? (
        <div className="muted loading-row">Loading fleet…</div>
      ) : buses.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon"><BusIcon /></div>
          <h3>No buses yet</h3>
          <p className="muted">Add your first bus to start building rosters and routes.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add bus</button>
        </div>
      ) : (
        <div className="bus-grid">
          {buses.map((bus) => {
            const count = counts[bus.id] || 0;
            const fill = Math.min(100, Math.round((count / (bus.seat_capacity || 1)) * 100));
            return (
              <button key={bus.id} className="bus-card card" onClick={() => onOpenBus(bus.id)}>
                <div className="bus-card-top">
                  <div className="bus-card-id">
                    <span className="bus-card-icon"><BusIcon /></span>
                    <span className="bus-number">{bus.bus_number}</span>
                  </div>
                  <span className={`pill pill-${bus.status}`}>{STATUS_LABEL[bus.status]}</span>
                </div>

                <div className="bus-card-stats">
                  <div>
                    <span className="stat-num">{count}</span>
                    <span className="stat-label muted">students</span>
                  </div>
                  <div>
                    <span className="stat-num">{presentByBus[bus.id] || 0}</span>
                    <span className="stat-label muted">present</span>
                  </div>
                  <div>
                    <span className="stat-num">{bus.seat_capacity}</span>
                    <span className="stat-label muted">seats</span>
                  </div>
                </div>

                <div className="capacity-bar" title={`${fill}% full`}>
                  <div className="capacity-fill" style={{ width: `${fill}%` }} />
                </div>
              </button>
            );
          })}
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

function SummaryCard({ icon, value, label, tone }) {
  return (
    <div className={`summary-card card summary-${tone}`}>
      <span className="summary-icon">{icon}</span>
      <div className="summary-text">
        <span className="summary-value">{value}</span>
        <span className="summary-label">{label}</span>
      </div>
    </div>
  );
}

function BusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <circle cx="8" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20v-6M6 20v-3M18 20v-9M12 4a4 4 0 014 4" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  );
}
