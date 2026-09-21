import { useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { staffAction, normalizePhone, localDigits, ROLE_LABEL } from '../lib/staff';

// Create or edit a driver / conductor.
// onSaved(staffRow, password?) — password is set when a login was created or reset.
export default function StaffFormModal({ staff, buses, crewByBus, onClose, onSaved, onRemoved }) {
  const isEdit = Boolean(staff);
  const [fullName, setFullName] = useState(staff?.full_name || '');
  const [phone, setPhone] = useState(localDigits(staff?.phone));
  const [role, setRole] = useState(staff?.role || 'driver');
  const [busId, setBusId] = useState(staff?.bus_id || '');
  const [passwordMode, setPasswordMode] = useState('auto'); // auto | custom
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'reset' | 'deactivate' | 'remove'

  const phoneOk = normalizePhone(phone) !== null;
  const others = (crewByBus[busId] || []).filter((c) => c.id !== staff?.id);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phoneOk) { setError('Enter a valid 10-digit mobile number.'); return; }
    if (!isEdit && passwordMode === 'custom' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const { staff: row } = await staffAction('update', {
          id: staff.id, full_name: fullName, phone, role, bus_id: busId || null,
        });
        onSaved(row);
      } else {
        const res = await staffAction('create', {
          full_name: fullName, phone, role, bus_id: busId || null,
          ...(passwordMode === 'custom' ? { password } : {}),
        });
        onSaved(res.staff, res.password);
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
        const { password: pw } = await staffAction('reset_password', { id: staff.id });
        onSaved(staff, pw, true);
      } else if (action === 'deactivate' || action === 'activate') {
        const { staff: row } = await staffAction('set_active', { id: staff.id, active: action === 'activate' });
        onSaved(row);
      } else if (action === 'remove') {
        await staffAction('remove', { id: staff.id });
        onRemoved();
      }
    } catch (ex) {
      setError(ex.message);
      setSaving(false);
    }
  }

  const roleLabel = ROLE_LABEL[role].toLowerCase();

  if (confirm) {
    const copy = {
      reset: {
        title: 'Reset password',
        message: `Create a new password for ${staff.full_name}? Their old password will stop working.`,
        label: 'Reset password', tone: 'default',
      },
      deactivate: {
        title: 'Deactivate account',
        message: `${staff.full_name} won't be able to sign in to the app. You can turn it back on any time.`,
        label: 'Deactivate', tone: 'danger',
      },
      activate: {
        title: 'Activate account',
        message: `Let ${staff.full_name} sign in to the app again with their existing password?`,
        label: 'Activate', tone: 'default',
      },
      remove: {
        title: 'Remove permanently',
        message: `Delete ${staff.full_name} and their login? This can't be undone. If you might need them again, deactivate instead.`,
        label: 'Remove', tone: 'danger',
      },
    }[confirm];
    return (
      <ConfirmDialog title={copy.title} message={copy.message} confirmLabel={copy.label} tone={copy.tone}
        onConfirm={runConfirmed} onCancel={() => setConfirm(null)} />
    );
  }

  return (
    <Modal title={isEdit ? `Edit ${staff.full_name}` : 'Add driver or conductor'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-field">
          <span className="field-label">Role</span>
          <div className="segmented" role="radiogroup" aria-label="Role">
            {['driver', 'conductor'].map((r) => (
              <button type="button" key={r} role="radio" aria-checked={role === r}
                className={`segmented-item ${role === r ? 'is-on' : ''}`} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="staff_name">Full name</label>
          <input id="staff_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
        </div>

        <div className="form-field">
          <label htmlFor="staff_phone">Mobile number</label>
          <div className="phone-input">
            <span className="phone-prefix">+91</span>
            <input id="staff_phone" value={phone} onChange={(e) => setPhone(e.target.value)} required
              inputMode="tel" autoComplete="off" placeholder="10-digit number" />
          </div>
          <p className="muted form-hint">
            {isEdit ? 'This is their login. Changing it changes the number they sign in with.' : `The ${roleLabel} signs in to the app with this number.`}
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="staff_bus">Bus</label>
          <select id="staff_bus" value={busId} onChange={(e) => setBusId(e.target.value)}>
            <option value="">Not assigned yet</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.bus_number}</option>)}
          </select>
          {others.length > 0 && (
            <p className="muted form-hint">
              Already on this bus: {others.map((c) => `${c.full_name} (${ROLE_LABEL[c.role].toLowerCase()})`).join(', ')}
            </p>
          )}
        </div>

        {!isEdit && (
          <div className="form-field">
            <span className="field-label">Password</span>
            <div className="segmented" role="radiogroup" aria-label="Password">
              <button type="button" role="radio" aria-checked={passwordMode === 'auto'}
                className={`segmented-item ${passwordMode === 'auto' ? 'is-on' : ''}`} onClick={() => setPasswordMode('auto')}>
                Create one for me
              </button>
              <button type="button" role="radio" aria-checked={passwordMode === 'custom'}
                className={`segmented-item ${passwordMode === 'custom' ? 'is-on' : ''}`} onClick={() => setPasswordMode('custom')}>
                I'll set it
              </button>
            </div>
            {passwordMode === 'custom' && (
              <input style={{ marginTop: '0.6rem' }} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" aria-label="Password" />
            )}
          </div>
        )}

        {isEdit && (
          <div className="account-box">
            <div className="account-box-head">
              <span>Login</span>
              <span className={`status-dot ${staff.is_active ? 'is-on' : ''}`}>{staff.is_active ? 'Active' : 'Deactivated'}</span>
            </div>
            <div className="account-box-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setConfirm('reset')}>
                Reset password
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving}
                onClick={() => setConfirm(staff.is_active ? 'deactivate' : 'activate')}>
                {staff.is_active ? 'Deactivate' : 'Activate'}
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${roleLabel}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
