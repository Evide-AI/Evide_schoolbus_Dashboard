import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { timeAgo } from '../lib/parents';
import './StudentsPage.css';
import './StaffPage.css';
import './MessagesPage.css';

const MAX_LEN = 500;

export default function MessagesPage() {
  const { managementUser } = useAuth();
  const schoolId = managementUser?.school_id;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  const [history, setHistory] = useState([]);
  const [parentCount, setParentCount] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const [sentRes, parentsRes] = await Promise.all([
      supabase.from('notifications')
        .select('id, title, body, category, sender_type, sender_name, bus_id, created_at')
        .eq('school_id', schoolId).neq('category', 'ATTENDANCE')
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('parent_users').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    ]);
    setHistory(sentRes.data || []);
    setParentCount(parentsRes.count ?? null);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  async function send(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Add a short heading.'); return; }
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('notifications').insert({
      school_id: schoolId,
      category: 'MESSAGE',
      title: title.trim(),
      body: body.trim(),
      sender_type: 'management',
      sender_name: managementUser?.school?.name || 'School office',
    });
    if (err) {
      setError(err.message);
      setSending(false);
      return;
    }
    setTitle('');
    setBody('');
    setSent(`Sent to every parent${parentCount ? ` (${parentCount})` : ''}.`);
    setSending(false);
    setTimeout(() => setSent(null), 5000);
    load();
  }

  return (
    <div>
      <header className="page-head staff-head">
        <div>
          <h1>Messages</h1>
          <p className="muted">Send a notice to every parent in your school.</p>
        </div>
      </header>

      {error && <div className="page-error">{error}</div>}

      <section className="compose card">
        <form onSubmit={send}>
          <div className="form-field">
            <label htmlFor="msg_title">Heading</label>
            <input id="msg_title" value={title} maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. School closed tomorrow" />
          </div>
          <div className="form-field">
            <label htmlFor="msg_body">Message (optional)</label>
            <textarea id="msg_body" rows={3} value={body} maxLength={MAX_LEN}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add the details parents need." />
            <p className="muted form-hint">{MAX_LEN - body.length} characters left</p>
          </div>
          <div className="compose-foot">
            <p className="muted compose-reach">
              Goes to {parentCount === null ? 'every parent' : `${parentCount} parent${parentCount === 1 ? '' : 's'}`} as
              a phone notification and in the app.
            </p>
            <button type="submit" className="btn btn-primary" disabled={sending || !title.trim()}>
              {sending ? 'Sending…' : 'Send to all parents'}
            </button>
          </div>
          {sent && <p className="compose-sent">{sent}</p>}
        </form>
      </section>

      <h2 className="section-title">Sent recently</h2>
      {loading ? (
        <div className="muted loading-row">Loading…</div>
      ) : history.length === 0 ? (
        <div className="empty-state card">
          <h3>Nothing sent yet</h3>
          <p className="muted">Messages you send appear here, newest first.</p>
        </div>
      ) : (
        <div className="card msg-list">
          {history.map((m) => (
            <div className="msg-row" key={m.id}>
              <div className="msg-main">
                <span className="msg-title">{m.title}</span>
                {m.body && <span className="muted msg-body">{m.body}</span>}
              </div>
              <div className="msg-meta">
                <span className={`msg-tag ${m.sender_type === 'driver' ? 'msg-tag-driver' : ''}`}>
                  {m.sender_type === 'driver' ? 'Bus staff' : m.sender_type === 'system' ? 'Automatic' : 'Office'}
                </span>
                <span className="muted">{timeAgo(m.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
