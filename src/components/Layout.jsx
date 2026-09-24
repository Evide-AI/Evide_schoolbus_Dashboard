import { useAuth } from '../lib/AuthContext';
import './Layout.css';

export default function Layout({ current, onNavigate, pendingRequests = 0, children }) {
  const { managementUser, signOut } = useAuth();
  const school = managementUser?.schools;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/evide-logo.png" alt="Evide" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${current === 'fleet' ? 'active' : ''}`}
            onClick={() => onNavigate('fleet')}
          >
            <BusIcon /> <span className="nav-long">Fleet &amp; students</span><span className="nav-short">Fleet</span>
          </button>
          <button
            className={`sidebar-nav-item ${current === 'students' ? 'active' : ''}`}
            onClick={() => onNavigate('students')}
          >
            <UsersIcon /> Students
          </button>
          <button
            className={`sidebar-nav-item ${current === 'staff' ? 'active' : ''}`}
            onClick={() => onNavigate('staff')}
          >
            <WheelIcon /> <span className="nav-long">Drivers &amp; conductors</span><span className="nav-short">Drivers</span>
          </button>
          <button
            className={`sidebar-nav-item ${current === 'parents' ? 'active' : ''}`}
            onClick={() => onNavigate('parents')}
          >
            <ParentIcon /> Parents
            {pendingRequests > 0 && <span className="nav-badge">{pendingRequests}</span>}
          </button>
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

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function WheelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M3.5 10.5l6.4 1M20.5 10.5l-6.4 1M12 14.2V21" />
    </svg>
  );
}

function ParentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1.4A4.6 4.6 0 018 14h2a4.6 4.6 0 014.5 4.6V20" />
      <path d="M16.5 11.5a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8M20.5 20v-1.2a3.6 3.6 0 00-3-3.5" />
    </svg>
  );
}
