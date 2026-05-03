// portalContext — single source of truth for the portal app's
// auth + active-client + accessible-clients state. Every /c/<slug>/*
// page reads from here via usePortal().
//
// Design:
//   - Mount once inside RequireAuth (which itself wraps the whole
//     /c/<slug>/* tree), so the client list is fetched at most once
//     per portal session.
//   - The active client is derived from the URL slug, not from
//     localStorage — URL is the source of truth (per spec D13).
//   - localStorage stores "last visited slug" only as a redirect
//     hint after /setup/complete or /login.
import { createContext, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const PortalCtx = createContext(null);

export const ACTIVE_SLUG_KEY = "mydash:active_client_slug";

export function PortalProvider({ children }) {
  const { slug } = useParams();
  const [session,         setSession]         = useState(null);
  const [accessibleClients, setAccessibleClients] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);

  // Resolve session + load accessible clients
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(s);
      if (!s) { setLoading(false); return; }

      const { data, error: e } = await supabase
        .from("client_contacts")
        .select(`
          id, client_id, role, name, email,
          clients ( id, name, slug, status )
        `)
        .eq("auth_user_id", s.user.id)
        .is("portal_revoked_at", null)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (e) {
        setError(e.message || "Couldn't load your accounts.");
        setLoading(false);
        return;
      }
      // Flatten: one row per (contact, client) — UI groups by client.
      // Some contacts may have a NULL clients join if RLS hides; filter.
      const flat = (data || [])
        .filter((r) => r.clients?.id && r.clients?.slug)
        .map((r) => ({
          contactId:   r.id,
          contactRole: r.role,
          contactName: r.name,
          clientId:    r.clients.id,
          clientName:  r.clients.name,
          clientSlug:  r.clients.slug,
          clientStatus: r.clients.status,
        }));
      setAccessibleClients(flat);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => { cancelled = true; sub?.subscription?.unsubscribe?.(); };
  }, []);

  const activeClient = slug
    ? accessibleClients.find((c) => c.clientSlug === slug) || null
    : null;

  const value = {
    session,
    accessibleClients,
    activeClient,
    loading,
    error,
    signOut: async () => {
      try { localStorage.removeItem(ACTIVE_SLUG_KEY); } catch {}
      await supabase.auth.signOut();
    },
    setLastSlug: (s) => {
      try { localStorage.setItem(ACTIVE_SLUG_KEY, s); } catch {}
    },
  };

  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortal() {
  const ctx = useContext(PortalCtx);
  if (!ctx) throw new Error("usePortal must be used inside <PortalProvider>");
  return ctx;
}
