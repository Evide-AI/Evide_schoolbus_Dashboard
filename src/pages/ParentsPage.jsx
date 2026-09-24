import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { parentAction, formatPhone, timeAgo } from '../lib/parents';
import ParentFormModal from '../components/ParentFormModal';
import CredentialsModal from '../components/CredentialsModal';
import './StudentsPage.css';
import './StaffPage.css';
import './ParentsPage.css';

export default function ParentsPage() {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [busyRequest, setBusyRequest] = useState(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ parents: list }, studentsRes, requestsRes] = await Promise.all([
        parentAction('list'),
        supabase.from('students').select('id, full_name, admission_number')
          .eq('school_id', schoolId).order('full_name'),
        supabase.from('password_reset_requests')
          .select('id, identifier, contact_phone, parent_user_id, created_at')
          .eq('status', 'pending').order('created_at', { ascending: false }),
      ]);
      setParents(list || []);
      setStudents(studentsRes.data || []);
      setRequests(requestsRes.data || []);
    } catch (ex) {
      setError(ex.message);
    }
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const parentById = useMemo(
    () => Object.fromEntries(parents.map((p) => [p.id, p])), [parents]);
  const studentName = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.full_name])), [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return parents.filter((p) =>
      !q ||
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (digits && String(p.phone || '').includes(digits)));
  }, [parents, query]);

  function handleSaved(parent, password, isReset = false) {
    setAdding(false);
    setEditing(null);
    if (password && parent) setCredentials({ staff: { ...parent, role: 'parent' }, password, isReset });
    load();
  }

  // Reset straight from a request, so the school doesn't have to find the
  // parent in the list first.
  async function resetFromRequest(request) {
    const parent = parentById[request.parent_user_id];
    if (!parent) return;
    setBusyRequest(request.id);
    setError(null);
    try {
      const res = await parentAction('reset_password', { id: parent.id });
      setCredentials({
        staff: { ...parent, role: 'parent', phone: request.contact_phone || parent.phone },
        password: res.password,
        isReset: true,
      });
      load();
    } catch (ex) {
      setError(ex.message);
    }
    setBusyRequest(null);
  }

  async function dismissRequest(id) {
    setBusyRequest(id);
    try {
      await parentAction('dismiss_request', { id });
      load();
    } catch (ex) {
      setError(ex.message);
    }
    setBusyRequest(null);
  }

  return (
    <div>
      <header className="page-head staff-head">
        <div>
          <h1>Parents</h1>
          <p className="muted">{parents.length} parent{parents.length === 1 ? '' : 's'} with app access</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add parent</button>
      </header>

      {error && <div className="page-error">{error}</div>}

      {requests.length > 0 && (
        <section className="request-panel card">
          <div className="request-panel-head">
            <span className="request-badge">{requests.length}</span>
            <div>
              <h2>Password requests</h2>
              <p className="muted">
                These parents asked for a new password from the app. Reset it, then send it on WhatsApp.
              </p>
            </div>
          </div>
          {requests.map((r) => {
            const parent = parentById[r.parent_user_id];
            return (
              <div className="request-row" key={r.id}>
                <div className="request-main">
                  <span className="request-name">{parent?.full_name || r.identifier}</span>
                  <span className="muted request-meta">
                    {formatPhone(r.contact_phone)} · asked {timeAgo(r.created_at)}
                  </span>
                </div>
                <div className="request-actions">
                  <button className="btn btn-secondary btn-sm" disabled={busyRequest === r.id}
                    onClick={() => dismissRequest(r.id)}>
                    Dismiss
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={busyRequest === r.id || !parent}
                    onClick={() => resetFromRequest(r)}>
                    {busyRequest === r.id ? 'Working…' : 'Reset password'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="staff-toolbar">
        <input type="text" placeholder="Search by name, phone or email…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="muted loading-row">Loading…</div>
      ) : parents.length === 0 ? (
        <div className="empty-state card">
          <h3>No parents yet</h3>
          <p className="muted">Add a parent, link their children, and share the login they'll use in the app.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add parent</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card"><h3>No one matches</h3></div>
      ) : (
        <div className="staff-table card">
          <div className="staff-row parent-row staff-row-head">
            <span>Parent</span><span>Phone</span><span>Children</span><span>Status</span><span></span>
          </div>
          {filtered.map((p) => (
            <div className={`staff-row parent-row ${p.is_active ? '' : 'is-inactive'}`} key={p.id}>
              <span className="staff-name-cell">
                <span className="roster-avatar">
                  <span className="roster-avatar-initial">{(p.full_name?.[0] || '?').toUpperCase()}</span>
                </span>
                <span className="staff-name-text">
                  <span className="roster-name">{p.full_name}</span>
                </span>
              </span>
              <a className="staff-phone" href={`tel:${p.phone}`}>{formatPhone(p.phone)}</a>
              <span className="parent-children">
                {p.student_ids.length === 0
                  ? <span className="bus-tag bus-tag-free">No child linked</span>
                  : p.student_ids.map((id) => (
                      <span className="bus-tag" key={id}>{studentName[id] || 'Removed'}</span>
                    ))}
              </span>
              <span className={`status-dot ${p.is_active ? 'is-on' : ''}`}>
                {p.is_active ? 'Active' : 'Deactivated'}
              </span>
              <span className="students-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(p)}>Manage</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <ParentFormModal
          parent={editing}
          students={students}
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
