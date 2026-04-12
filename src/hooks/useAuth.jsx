import { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { supabase, isOnline } from '../lib/supabase';

// ============================================================
// Auth Context
// ============================================================
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);       // Supabase auth user
  const [teamMember, setTeamMember] = useState(null); // Team member record
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOnline()) {
      // Offline mode: use default user
      setTeamMember({
        id: 'tm1',
        name: 'Hayley Mattson',
        role: 'Publisher',
        email: 'hayley@13stars.media',
        permissions: ['admin'],
        assigned_pubs: ['all'],
      });
      setLoading(false);
      return;
    }

    // Listen for auth changes FIRST — this catches OAuth redirects
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Clear URL hash after auth processes it (prevents 403 on refresh)
        if (window.location.hash && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        setSession(session);
        if (session?.user) {
          setUser(session.user);
          // Don't await — let team member load in background while app renders
          fetchTeamMember(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setTeamMember(null);
          setLoading(false);
        }
      }
    );

    // Then check for existing session in storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        fetchTeamMember(session.user.id);
      } else {
        // No stored session — but give onAuthStateChange a moment
        // to process any OAuth redirect tokens in the URL
        setTimeout(() => {
          setUser(currentUser => {
            if (!currentUser) setLoading(false);
            return currentUser;
          });
        }, 500);
      }
    }).catch((err) => {
      console.error('[auth] getSession error:', err);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTeamMember = async (authId) => {
    try {
      // Fetch all team members (fast, small table) and match client-side
      const { data, error } = await supabase
        .from('team_members')
        .select('*');

      if (error) {
        console.error('[auth] fetchTeamMember query error:', error);
        setLoading(false);
        return;
      }
      let match = (data || []).find(t => t.auth_id === authId || String(t.auth_id) === String(authId));
      if (!match && user?.email) {
        // Fallback: match by email and auto-link auth_id
        match = (data || []).find(t => t.email === user.email);
        if (match && !match.auth_id) {
          await supabase.from('team_members').update({ auth_id: authId }).eq('id', match.id);
          match.auth_id = authId;
          console.log('Auto-linked auth_id for', user.email);
        }
      }
      if (match) {
        setTeamMember(match);
      } else {
        console.warn('No team member found for auth_id:', authId, 'or email:', user?.email);
      }
    } catch (err) {
      console.error('fetchTeamMember error:', err);
    }
    setLoading(false);
  };

  // Failsafe: hard cutoff — never show spinner for more than 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('[auth] Hard timeout — forcing login screen');
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Auth methods
  const signInWithGoogle = async () => {
    if (!isOnline()) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
      },
    });
    if (error) console.error('Sign in error:', error);
  };

  const signInWithEmail = async (email, password) => {
    if (!isOnline()) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!isOnline()) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setTeamMember(null);
  };

  // Permission checks
  const hasPermission = useCallback((perm) => {
    if (!teamMember) return false;
    return teamMember.permissions?.includes('admin') || teamMember.permissions?.includes(perm);
  }, [teamMember]);

  const isAdmin = useCallback(() => hasPermission('admin'), [hasPermission]);
  const canSell = useCallback(() => hasPermission('sales') || hasPermission('clients'), [hasPermission]);
  const canEdit = useCallback(() => hasPermission('editorial') || hasPermission('stories'), [hasPermission]);
  const canFlatplan = useCallback(() => hasPermission('flatplan') || hasPermission('editorial'), [hasPermission]);

  const value = useMemo(() => ({
    session,
    user,
    teamMember,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signOut,
    hasPermission,
    isAdmin,
    canSell,
    canEdit,
    canFlatplan,
    isOnline: isOnline(),
  }), [session, user, teamMember, loading, hasPermission, isAdmin, canSell, canEdit, canFlatplan]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
