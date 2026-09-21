import { useState } from 'react';
import Modal from './Modal';
import { ROLE_LABEL, formatPhone } from '../lib/staff';

const APP_URL = import.meta.env.VITE_DRIVER_APP_URL || '';

// Shows a login once, right after it's created or reset. The password is not
// stored anywhere readable, so this is the only time the manager sees it.
export default function CredentialsModal({ staff, password, isReset = false, onClose }) {
  const [copied, setCopied] = useState(false);
  const role = ROLE_LABEL[staff.role] || 'Staff';

  const message =
    `Hi ${staff.full_name}, here is your Evide School Bus ${role.toLowerCase()} app login.\n\n` +
    `Phone: ${formatPhone(staff.phone)}\nPassword: ${password}` +
    (APP_URL ? `\n\nDownload the app: ${APP_URL}` : '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the login details:', message);
    }
  }

  const waNumber = String(staff.phone || '').replace(/\D/g, '');
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

  return (
    <Modal title={isReset ? 'New password set' : `${role} added`} onClose={onClose} width={460}>
      <p className="muted cred-intro">
        Share these login details with {staff.full_name}. The password is shown only once. If it's lost, reset it from their profile.
      </p>

      <div className="cred-card">
        <div className="cred-line">
          <span className="cred-label">Phone</span>
          <span className="cred-value">{formatPhone(staff.phone)}</span>
        </div>
        <div className="cred-line">
          <span className="cred-label">Password</span>
          <span className="cred-value cred-password">{password}</span>
        </div>
      </div>

      <div className="cred-actions">
        <a className="btn btn-whatsapp" href={waLink} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy details'}</button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
