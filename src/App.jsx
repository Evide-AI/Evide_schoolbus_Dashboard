import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import BusList from './pages/BusList';
import BusDetail from './pages/BusDetail';
import StudentsPage from './pages/StudentsPage';
import StaffPage from './pages/StaffPage';
import ParentsPage from './pages/ParentsPage';
import MessagesPage from './pages/MessagesPage';
import ErrorBoundary from './components/ErrorBoundary';
import { supabase } from './lib/supabase';

function Dashboard() {
  const [page, setPage] = useState('fleet');   // 'fleet' | 'students' | 'staff' | 'parents' | 'messages'
  const [openBusId, setOpenBusId] = useState(null);

  // Count of parents waiting for a password reset, shown as a badge on the
  // Parents tab so the office notices without opening the page.
  const [pendingRequests, setPendingRequests] = useState(0);

  const loadPending = useCallback(async () => {
    const { count } = await supabase
      .from('password_reset_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingRequests(count || 0);
  }, []);

  useEffect(() => {
    loadPending();
    const timer = setInterval(loadPending, 120000); // every 2 minutes
    return () => clearInterval(timer);
  }, [loadPending, page]);

  function navigate(target) {
    setOpenBusId(null); // leaving a bus detail when switching sections
    setPage(target);
  }

  let body;
  if (page === 'students') {
    body = <StudentsPage />;
  } else if (page === 'staff') {
    body = <StaffPage />;
  } else if (page === 'parents') {
    body = <ParentsPage />;
  } else if (page === 'messages') {
    body = <MessagesPage />;
  } else if (openBusId) {
    body = <BusDetail busId={openBusId} onBack={() => setOpenBusId(null)} />;
  } else {
    body = <BusList onOpenBus={setOpenBusId} />;
  }

  return (
    <Layout current={page} onNavigate={navigate} pendingRequests={pendingRequests}>
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