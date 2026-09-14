import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import BusFormModal from '../components/BusFormModal';
import StudentFormModal from '../components/StudentFormModal';
import BulkUploadModal from '../components/BulkUploadModal';
import NotifyModal from '../components/NotifyModal';
import './BusDetail.css';

const STATUS_LABEL = {
  running: 'Running',
  not_running: 'Not running',
  maintenance: 'Maintenance',
};

// Local YYYY-MM-DD, so "today" matches the user's day, not UTC.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BusDetail({ busId, onBack }) {
  const [bus, setBus] = useState(null);
  const [students, setStudents] = useState([]);
  const [presentCount, setPresentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editBus, setEditBus] = useState(false);
  const [addStudent, setAddStudent] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [notify, setNotify] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: busData, error: busErr } = await supabase
      .from('buses')
      .select('id, bus_number, status, seat_capacity, gt06_device_imei, school_id')
      .eq('id', busId)
      .maybeSingle();
    if (busErr || !busData) { setError(busErr?.message || 'Bus not found'); setLoading(false); return; }

    const { data: studentData, error: stuErr } = await supabase
      .from('students')
      .select('id, full_name, admission_number, pickup_lat, pickup_lng, drop_lat, drop_lng')
      .eq('bus_id', busId)
      .order('full_name');
    if (stuErr) { setError(stuErr.message); setLoading(false); return; }

    // Attendance count for today (present = true rows in attendance table).
    const { count, error: attErr } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('bus_id', busId)
      .eq('date', todayStr())
      .eq('present', true);
    if (attErr) { setError(attErr.message); setLoading(false); return; }

    setBus(busData);
    setStudents(studentData || []);
    setPresentCount(count || 0);
    setLoading(false);
  }, [busId]);

  useEffect(() => { load(); }, [load]);

  async function deleteStudent(id) {
    if (!confirm('Remove this student from the roster? This cannot be undone.')) return;
    const { error: delErr } = await supabase.from('students').delete().eq('id', id);
    if (delErr) { alert(delErr.message); return; }
    load();
  }

  async function deleteBus() {
    // Block deletion while students are still assigned — protects real data.
    if (students.length > 0) {
      alert(
        `This bus still has ${students.length} student${students.length === 1 ? '' : 's'} assigned. ` +
        'Move or remove them first, then delete the bus.'
      );
      return;
    }
    if (!confirm(`Delete ${bus.bus_number}? This cannot be undone.`)) return;
    const { error: delErr } = await supabase.from('buses').delete().eq('id', bus.id);
    if (delErr) { alert(delErr.message); return; }
    onBack();
  }

  if (loading) return <div className="muted loading-row">Loading bus…</div>;
  if (error) return (
    <div>
      <button className="btn btn-secondary btn-sm back-btn" onClick={onBack}>← Back to fleet</button>
      <div className="page-error">{error}</div>
    </div>
  );

  return (
    <div>
      <button className="btn btn-secondary btn-sm back-btn" onClick={onBack}>← Back to fleet</button>

      <header className="detail-head">
        <div className="detail-head-main">
          <h1>{bus.bus_number}</h1>
          <span className={`pill pill-${bus.status}`}>{STATUS_LABEL[bus.status]}</span>
        </div>
        <div className="detail-head-actions">
          <button className="btn btn-secondary" onClick={() => setNotify(true)}>Send notification</button>
          <button className="btn btn-secondary" onClick={() => setEditBus(true)}>Edit bus</button>
          <button className="btn btn-danger" onClick={deleteBus}>Delete bus</button>
        </div>
      </header>

      <div className="detail-stats">
        <div className="detail-stat card">
          <span className="stat-num">{students.length}</span>
          <span className="stat-label muted">students on roster</span>
        </div>
        <div className="detail-stat card">
          <span className="stat-num">{presentCount}<span className="stat-of">/{students.length}</span></span>
          <span className="stat-label muted">present today</span>
        </div>
        <div className="detail-stat card">
          <span className="stat-num">{bus.seat_capacity}</span>
          <span className="stat-label muted">seat capacity</span>
        </div>
      </div>

      <div className="roster-head">
        <h2>Roster</h2>
        <div className="roster-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setBulk(true)}>Upload spreadsheet</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddStudent(true)}>+ Add student</button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="empty-state card">
          <h3>No students on this bus</h3>
          <p className="muted">Add students individually or upload a spreadsheet.</p>
        </div>
      ) : (
        <div className="roster-table card">
          <div className="roster-row roster-row-head">
            <span>Name</span>
            <span>Admission no.</span>
            <span>Pickup set</span>
            <span>Drop set</span>
            <span></span>
          </div>
          {students.map((s) => (
            <div className="roster-row" key={s.id}>
              <span className="roster-name">{s.full_name}</span>
              <span className="muted">{s.admission_number}</span>
              <span>{s.pickup_lat != null ? <Dot ok /> : <Dot />}</span>
              <span>{s.drop_lat != null ? <Dot ok /> : <Dot />}</span>
              <span className="roster-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditStudent(s)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteStudent(s.id)}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editBus && (
        <BusFormModal bus={bus} schoolId={bus.school_id}
          onClose={() => setEditBus(false)}
          onSaved={() => { setEditBus(false); load(); }} />
      )}
      {addStudent && (
        <StudentFormModal busId={busId} schoolId={bus.school_id}
          onClose={() => setAddStudent(false)}
          onSaved={() => { setAddStudent(false); load(); }} />
      )}
      {editStudent && (
        <StudentFormModal student={editStudent} busId={busId} schoolId={bus.school_id}
          onClose={() => setEditStudent(null)}
          onSaved={() => { setEditStudent(null); load(); }} />
      )}
      {bulk && <BulkUploadModal onClose={() => setBulk(false)} />}
      {notify && (
        <NotifyModal busId={busId} busNumber={bus.bus_number} schoolId={bus.school_id}
          onClose={() => setNotify(false)} />
      )}
    </div>
  );
}

function Dot({ ok }) {
  return <span className={`set-dot ${ok ? 'set-dot-ok' : ''}`} title={ok ? 'Set' : 'Not set'} />;
}
