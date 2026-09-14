import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import BusFormModal from '../components/BusFormModal';
import StudentFormModal from '../components/StudentFormModal';
import BulkUploadModal from '../components/BulkUploadModal';
import NotifyModal from '../components/NotifyModal';
import ConfirmDialog from '../components/ConfirmDialog';
import MigrateStudentsModal from '../components/MigrateStudentsModal';
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
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(null); // student obj
  const [confirmDeleteBus, setConfirmDeleteBus] = useState(false);
  const [migrate, setMigrate] = useState(false);

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

  async function doDeleteStudent(id) {
    const { error: delErr } = await supabase.from('students').delete().eq('id', id);
    if (delErr) { alert(delErr.message); return; }
    setConfirmDeleteStudent(null);
    load();
  }

  async function doDeleteBus() {
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
          <button className="btn btn-secondary" onClick={() => setNotify(true)}>
            <BellIcon /> Send notification
          </button>
          {students.length > 0 && (
            <button className="btn btn-secondary" onClick={() => setMigrate(true)}>
              <MoveIcon /> Move students
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setEditBus(true)}>
            <EditIcon /> Edit bus
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDeleteBus(true)}>
            <TrashIcon /> Delete bus
          </button>
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
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteStudent(s)}>Remove</button>
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

      {confirmDeleteStudent && (
        <ConfirmDialog
          title="Remove student"
          message={`Remove ${confirmDeleteStudent.full_name} from the roster? This cannot be undone.`}
          confirmLabel="Remove student"
          tone="danger"
          onConfirm={() => doDeleteStudent(confirmDeleteStudent.id)}
          onCancel={() => setConfirmDeleteStudent(null)}
        />
      )}

      {confirmDeleteBus && (
        students.length > 0 ? (
          <ConfirmDialog
            title="Can't delete this bus yet"
            message={`${bus.bus_number} still has ${students.length} student${students.length === 1 ? '' : 's'} assigned. Move them to another bus first, then you can delete it.`}
            confirmLabel="Delete bus"
            tone="danger"
            confirmDisabled
            extraAction={{
              label: `Move ${students.length} student${students.length === 1 ? '' : 's'} to another bus`,
              onClick: () => { setConfirmDeleteBus(false); setMigrate(true); },
            }}
            onCancel={() => setConfirmDeleteBus(false)}
          />
        ) : (
          <ConfirmDialog
            title="Delete bus"
            message={`Delete ${bus.bus_number}? This cannot be undone.`}
            confirmLabel="Delete bus"
            tone="danger"
            onConfirm={doDeleteBus}
            onCancel={() => setConfirmDeleteBus(false)}
          />
        )
      )}

      {migrate && (
        <MigrateStudentsModal
          fromBus={bus}
          schoolId={bus.school_id}
          onClose={() => setMigrate(false)}
          onDone={(count) => { setMigrate(false); load(); }}
        />
      )}
    </div>
  );
}

function Dot({ ok }) {
  return <span className={`set-dot ${ok ? 'set-dot-ok' : ''}`} title={ok ? 'Set' : 'Not set'} />;
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  );
}
function MoveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M5 9l-3 3 3 3M2 12h13M19 15l3-3-3-3M22 12H9" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </svg>
  );
}
