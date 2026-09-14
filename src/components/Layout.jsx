import { useAuth } from '../lib/AuthContext';
import './Layout.css';

export default function Layout({ children }) {
  const { managementUser, signOut } = useAuth();
  const school = managementUser?.schools;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/evide-logo.png" alt="Evide" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-item active">
            <BusIcon /> Fleet &amp; students
          </div>
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-school">{school?.name || 'Your school'}</div>
          <div className="sidebar-user muted">{managementUser?.full_name}</div>
          <button className="btn btn-secondary btn-sm sidebar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

function BusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <circle cx="8" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
