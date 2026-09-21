import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import BusList from './pages/BusList';
import BusDetail from './pages/BusDetail';
import StudentsPage from './pages/StudentsPage';
import StaffPage from './pages/StaffPage';
import ErrorBoundary from './components/ErrorBoundary';

function Dashboard() {
  const [page, setPage] = useState('fleet');   // 'fleet' | 'students' | 'staff'
  const [openBusId, setOpenBusId] = useState(null);

  function navigate(target) {
    setOpenBusId(null); // leaving a bus detail when switching sections
    setPage(target);
  }

  let body;
  if (page === 'students') {
    body = <StudentsPage />;
  } else if (page === 'staff') {
    body = <StaffPage />;
  } else if (openBusId) {
    body = <BusDetail busId={openBusId} onBack={() => setOpenBusId(null)} />;
  } else {
    body = <BusList onOpenBus={setOpenBusId} />;
  }

  return (
    <Layout current={page} onNavigate={navigate}>
      <ErrorBoundary resetKey={`${page}:${openBusId || ''}`}>{body}</ErrorBoundary>
    </Layout>
  );
}

function Gate() {
  const { session, managementUser, loading, profileError, signOut } = useAuth();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!session) return <Login />;
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
