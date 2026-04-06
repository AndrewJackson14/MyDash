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
    // and token refreshes before getSession resolves
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event, session?.user?.email);
        setSession(session);
        if (session?.user) {
          setUser(session.user);
          await fetchTeamMember(session.user.id);
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
      console.error('Auth session error:', err);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTeamMember = async (authId) => {
    try {
      // Try direct match
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('auth_id', authId)
        .single();

      if (data) {
        setTeamMember(data);
      } else {
        // Fallback: get all and match manually
        const all = await supabase.from('team_members').select('*');
        const match = all.data?.find(t => String(t.auth_id) === String(authId));
        if (match) setTeamMember(match);
      }
    } catch (err) {
      console.error('fetchTeamMember error:', err);
    }
    setLoading(false);
  };

  // Failsafe: if auth check takes more than 4 seconds, stop loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('Auth timeout — loading app');
        setLoading(false);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [loading]);

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
