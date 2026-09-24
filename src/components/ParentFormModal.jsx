import { useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { parentAction, localDigits } from '../lib/parents';

// Create or edit a parent, including which children they can track.
export default function ParentFormModal({ parent, students, onClose, onSaved, onRemoved }) {
  const isEdit = Boolean(parent);
  const [fullName, setFullName] = useState(parent?.full_name || '');
  const [phone, setPhone] = useState(localDigits(parent?.phone));
  const [email, setEmail] = useState(parent?.email || '');
  const [studentIds, setStudentIds] = useState(parent?.student_ids || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const phoneOk = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));

  function toggleStudent(id) {
    setStudentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phoneOk) { setError('Enter a valid 10-digit mobile number.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await parentAction('update', {
          id: parent.id, full_name: fullName, phone, student_ids: studentIds,
        });
        onSaved();
      } else {
        const res = await parentAction('create', {
          full_name: fullName, phone, student_ids: studentIds,
          ...(email.trim() ? { email: email.trim() } : {}),
        });
        onSaved(res.parent, res.password);
      }
    } catch (ex) {
      setError(ex.message);
      setSaving(false);
    }
  }

  async function runConfirmed() {
    const action = confirm;
    setConfirm(null);
    setSaving(true);
    setError(null);
    try {
      if (action === 'reset') {
        const res = await parentAction('reset_password', { id: parent.id });
        onSaved({ ...parent, ...res.parent }, res.password, true);
      } else if (action === 'remove') {
        await parentAction('remove', { id: parent.id });
        onRemoved();
      } else {
        await parentAction('set_active', { id: parent.id, active: action === 'activate' });
        onSaved();
      }
    } catch (ex) {
      setError(ex.message);
      setSaving(false);
    }
  }

  if (confirm) {
    const copy = {
      reset: {
        title: 'Reset password',
        message: `Create a new password for ${parent.full_name}? Their old one stops working immediately.`,
        label: 'Reset password', tone: 'default',
      },
      deactivate: {
        title: 'Deactivate account',
        message: `${parent.full_name} won't be able to sign in to the parent app. You can turn it back on any time.`,
        label: 'Deactivate', tone: 'danger',
      },
      activate: {
        title: 'Activate account',
        message: `Let ${parent.full_name} sign in again with their existing password?`,
        label: 'Activate', tone: 'default',
      },
      remove: {
        title: 'Remove parent',
        message: `Delete ${parent.full_name}, their login and their child links? This can't be undone.`,
        label: 'Remove', tone: 'danger',
      },
    }[confirm];
    return (
      <ConfirmDialog title={copy.title} message={copy.message} confirmLabel={copy.label}
        tone={copy.tone} onConfirm={runConfirmed} onCancel={() => setConfirm(null)} />
    );
  }

  return (
    <Modal title={isEdit ? `Edit ${parent.full_name}` : 'Add parent'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-field">
          <label htmlFor="parent_name">Parent name</label>
          <input id="parent_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
        </div>

        <div className="form-field">
          <label htmlFor="parent_phone">Mobile number</label>
          <div className="phone-input">
            <span className="phone-prefix">+91</span>
            <input id="parent_phone" value={phone} onChange={(e) => setPhone(e.target.value)} required
              inputMode="tel" autoComplete="off" placeholder="10-digit number" />
          </div>
        </div>

        {!isEdit && (
          <div className="form-field">
            <label htmlFor="parent_email">Email for sign-in (optional)</label>
            <input id="parent_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="off" placeholder="Leave blank to use their phone number" />
            <p className="muted form-hint">
              If left blank, the parent signs in with their mobile number instead.
            </p>
          </div>
        )}

        <div className="form-field">
          <span className="field-label">Children they can track</span>
          {students.length === 0 ? (
            <p className="muted form-hint">Add students first, then link them here.</p>
          ) : (
            <div className="child-picker">
              {students.map((s) => (
                <label key={s.id} className={`child-option ${studentIds.includes(s.id) ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  <span className="child-option-name">{s.full_name}</span>
                  <span className="muted child-option-adm">{s.admission_number}</span>
                </label>
              ))}
            </div>
          )}
          {studentIds.length === 0 && (
            <p className="muted form-hint">
              Without a child linked, the parent app will show nothing to track.
            </p>
          )}
        </div>

        {isEdit && (
          <div className="account-box">
            <div className="account-box-head">
              <span>Login</span>
              <span className={`status-dot ${parent.is_active ? 'is-on' : ''}`}>
                {parent.is_active ? 'Active' : 'Deactivated'}
              </span>
            </div>
            <div className="account-box-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setConfirm('reset')}>
                Reset password
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving}
                onClick={() => setConfirm(parent.is_active ? 'deactivate' : 'activate')}>
                {parent.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={() => setConfirm('remove')}>
                Remove
              </button>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add parent'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
