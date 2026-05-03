// portalContext — single source of truth for the portal app's
// auth + active-client + accessible-clients state. Every /c/<slug>/*
// page reads from here via usePortal().
//
// Two paths:
//   1. Customer mode (default) — load every client_contacts row keyed
//      to auth.uid(); accessibleClients is the flattened result.
//   2. Staff support view (URL ?staff_view=1) — verify the auth user
//      via current_user_is_staff() RPC; if true, fetch the single
//      client by URL slug directly (existing has_permission RLS
//      grants this) and set isStaffView=true. UI flips to read-only.
//      If verification fails, fall through to normal mode.
//
// The active client is always derived from the URL slug, not local-
// storage (D13). localStorage just hints last-visited so /login can
// redirect post-magic-link.
import { createContext, useContext, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const PortalCtx = createContext(null);

export const ACTIVE_SLUG_KEY = "mydash:active_client_slug";

export function PortalProvider({ children }) {
  const { slug }     = useParams();
  const [params]     = useSearchParams();
  const wantStaffView = params.get("staff_view") === "1";

  const [session,           setSession]           = useState(null);
  const [accessibleClients, setAccessibleClients] = useState([]);
  const [isStaffView,       setIsStaffView]       = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(s);
      if (!s) { setLoading(false); return; }

      // Staff support view path: verify staff role, then load just
      // the URL-slug client directly via existing staff RLS.
      if (wantStaffView && slug) {
        const { data: isStaff } = await supabase.rpc("current_user_is_staff");
        if (cancelled) return;
        if (isStaff === true) {
          const { data: client } = await supabase
            .from("clients")
            .select("id, name, slug, status")
            .eq("slug", slug)
            .maybeSingle();
          if (cancelled) return;
          if (client?.id) {
            setAccessibleClients([{
              contactId:    null,
              contactRole:  "staff_view",
              contactName:  s.user?.email || "Staff",
              clientId:     client.id,
              clientName:   client.name,
              clientSlug:   client.slug,
              clientStatus: client.status,
            }]);
            setIsStaffView(true);
            setLoading(false);
            return;
          }
        }
        // Staff verification failed or client not found — fall through
        // to normal customer-mode load.
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, wantStaffView]);

  const activeClient = slug
    ? accessibleClients.find((c) => c.clientSlug === slug) || null
    : null;

  const value = {
    session,
    accessibleClients,
    activeClient,
    isStaffView,
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
