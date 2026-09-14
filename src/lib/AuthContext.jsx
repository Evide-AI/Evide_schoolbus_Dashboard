import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [managementUser, setManagementUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  // Loads the management_users row for the signed-in auth user, plus their school.
  async function loadProfile(activeSession) {
    if (!activeSession) {
      setManagementUser(null);
      return;
    }
    const { data, error } = await supabase
      .from('management_users')
      .select('id, full_name, role, school_id, schools(id, name, latitude, longitude)')
      .eq('auth_user_id', activeSession.user.id)
      .maybeSingle();

    if (error) {
      setProfileError(error.message);
      setManagementUser(null);
    } else if (!data) {
      // Auth succeeded but this user isn't linked to a management_users row.
      setProfileError('This account is not set up as a management user. Contact your administrator.');
      setManagementUser(null);
    } else {
      setProfileError(null);
      setManagementUser(data);
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      await loadProfile(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      await loadProfile(session);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, managementUser, loading, profileError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
