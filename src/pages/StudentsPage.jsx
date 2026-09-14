import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import StudentFormModal from '../components/StudentFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import './StudentsPage.css';

export default function StudentsPage() {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [students, setStudents] = useState([]);
  const [busNames, setBusNames] = useState({});
  const [photoUrls, setPhotoUrls] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);

    const [{ data: stu, error: e1 }, { data: buses, error: e2 }] = await Promise.all([
      supabase.from('students')
        .select('id, full_name, admission_number, bus_id, photo_path')
        .eq('school_id', schoolId).order('full_name'),
      supabase.from('buses').select('id, bus_number').eq('school_id', schoolId),
    ]);
    if (e1 || e2) { setError((e1 || e2).message); setLoading(false); return; }

    const names = {};
    for (const b of buses || []) names[b.id] = b.bus_number;

    // Signed URLs for photos
    const withPhotos = (stu || []).filter((s) => s.photo_path);
    const urls = {};
    if (withPhotos.length > 0) {
      const { data: signed } = await supabase.storage
        .from('student-photos')
        .createSignedUrls(withPhotos.map((s) => s.photo_path), 3600);
      if (signed) withPhotos.forEach((s, i) => { if (signed[i]?.signedUrl) urls[s.id] = signed[i].signedUrl; });
    }

    setStudents(stu || []);
    setBusNames(names);
    setPhotoUrls(urls);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    );
  }, [students, query]);

  async function doDelete(id) {
    const { error: delErr } = await supabase.from('students').delete().eq('id', id);
    if (delErr) { alert(delErr.message); return; }
    setConfirmDelete(null);
    load();
  }

  const unassignedCount = students.filter((s) => !s.bus_id).length;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Students</h1>
          <p className="muted">
            {students.length} total{unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add student</button>
      </header>

      {error && <div className="page-error">{error}</div>}

      <div className="students-search">
        <input
          type="text"
          placeholder="Search by name or admission number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="muted loading-row">Loading students…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <h3>{query ? 'No students match your search' : 'No students yet'}</h3>
          {!query && <p className="muted">Add students here, then assign them to buses.</p>}
        </div>
      ) : (
        <div className="students-table card">
          <div className="students-row students-row-head">
            <span>Student</span>
            <span>Admission no.</span>
            <span>Bus</span>
            <span></span>
          </div>
          {filtered.map((s) => (
            <div className="students-row" key={s.id}>
              <span className="students-name-cell">
                <span className="roster-avatar">
                  {photoUrls[s.id]
                    ? <img src={photoUrls[s.id]} alt={s.full_name} />
                    : <span className="roster-avatar-initial">{(s.full_name[0] || '?').toUpperCase()}</span>}
                </span>
                <span className="roster-name">{s.full_name}</span>
              </span>
              <span className="muted">{s.admission_number}</span>
              <span>
                {s.bus_id
                  ? <span className="bus-tag">{busNames[s.bus_id] || 'Unknown bus'}</span>
                  : <span className="bus-tag bus-tag-free">Unassigned</span>}
              </span>
              <span className="students-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditStudent(s)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <StudentFormModal schoolId={schoolId} busId={null}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load(); }} />
      )}
      {editStudent && (
        <StudentFormModal student={editStudent} schoolId={schoolId} busId={editStudent.bus_id}
          onClose={() => setEditStudent(null)}
          onSaved={() => { setEditStudent(null); load(); }} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Remove student"
          message={`Remove ${confirmDelete.full_name} from your school? This cannot be undone.`}
          confirmLabel="Remove student"
          tone="danger"
          onConfirm={() => doDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
