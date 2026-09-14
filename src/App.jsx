import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import BusList from './pages/BusList';
import BusDetail from './pages/BusDetail';

// Simple in-app view state (list <-> detail). A single-screen MVP doesn't need
// a full router; this keeps it lightweight and avoids URL/auth edge cases.
function Dashboard() {
  const [openBusId, setOpenBusId] = useState(null);

  return (
    <Layout>
      {openBusId
        ? <BusDetail busId={openBusId} onBack={() => setOpenBusId(null)} />
        : <BusList onOpenBus={setOpenBusId} />}
    </Layout>
  );
}

function Gate() {
  const { session, managementUser, loading, profileError, signOut } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!session) return <Login />;

  // Signed in, but not linked to a management_users row (or a load error).
  if (!managementUser) {
    return (
      <div className="app-loading app-loading-error">
        <p>{profileError || 'Your account is not set up for the dashboard.'}</p>
        <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
