import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Modal from './Modal';

// Writes a notification row scoped to this bus. Parents of students on the bus
// (and the bus's driver) read it in-app; the backend's dispatch worker is what
// turns new rows into push notifications.
export default function NotifyModal({ busId, busNumber, schoolId, onClose }) {
  const { managementUser } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const { error: insErr } = await supabase.from('notifications').insert({
      school_id: schoolId,
      bus_id: busId,
      sender_type: 'management',
      sender_id: managementUser?.id || null,
      title: title.trim(),
      body: body.trim(),
      category: 'ANNOUNCEMENT',
    });

    if (insErr) {
      setError(insErr.message);
      setSending(false);
    } else {
      setSent(true);
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Modal title="Notification sent" onClose={onClose} width={440}>
        <p className="notify-sent">
          Your message to <strong>{busNumber}</strong> has been sent to parents and the driver.
        </p>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Notify ${busNumber}`} onClose={onClose} width={480}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}
        <p className="muted notify-intro">Sent to parents of students on this bus, and to the driver.</p>

        <div className="form-field">
          <label htmlFor="notify-title">Title</label>
          <input id="notify-title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Bus running 15 minutes late" required />
        </div>

        <div className="form-field">
          <label htmlFor="notify-body">Message</label>
          <textarea id="notify-body" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Write the details parents should know…" rows={4} required />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
