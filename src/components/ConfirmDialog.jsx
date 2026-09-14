import Modal from './Modal';

// A styled confirm dialog to replace the browser's default confirm().
// `tone` controls the accent of the primary action (danger = red).
// `extraAction` optionally renders a secondary highlighted button (used to
// offer "Migrate students" from a blocked bus-deletion).
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  confirmDisabled = false,
  extraAction, // { label, onClick } | null
}) {
  return (
    <Modal title={title} onClose={onCancel} width={440}>
      <div className="confirm-body">
        <div className={`confirm-icon confirm-icon-${tone}`}>
          {tone === 'danger' ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          )}
        </div>
        <p className="confirm-message">{message}</p>
      </div>

      {extraAction && (
        <button className="btn confirm-extra" onClick={extraAction.onClick}>
          {extraAction.label}
        </button>
      )}

      <div className="form-actions confirm-actions">
        <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        <button
          className={`btn ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
