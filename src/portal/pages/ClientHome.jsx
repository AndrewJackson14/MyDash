// /c/<slug>/home — client dashboard.
// Spec: client-portal-spec.md.md §5.4
//
// Reads (RLS-gated to user_can_access_client(client_id)):
//   - clients row (name, status)
//   - proposals filtered by status for action-needed counts
//   - invoices filtered to open/overdue counts
//   - ad_projects active count
//   - get_client_activity(client_id, 10)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtRelative } from "../lib/format";

const PROPOSAL_ACTION_STATUSES = ["Sent", "Awaiting Review"];
const INVOICE_OPEN_STATUSES    = ["sent", "overdue", "partially_paid"];

export default function ClientHome() {
  const { activeClient, accessibleClients } = usePortal();
  const [counts,   setCounts]   = useState({ openProposals: 0, openInvoices: 0, activeProjects: 0 });
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const me      = accessibleClients.find((c) => c.clientId === activeClient?.clientId);
  const myFirst = (me?.contactName || "").split(" ")[0];

  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const cid = activeClient.clientId;
      const [
        { count: openProposals },
        { count: openInvoices },
        { count: activeProjects },
        { data: feed },
      ] = await Promise.all([
        supabase.from("proposals")
          .select("id", { count: "exact", head: true })
          .eq("client_id", cid)
          .in("status", PROPOSAL_ACTION_STATUSES),
        supabase.from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("client_id", cid)
          .in("status", INVOICE_OPEN_STATUSES),
        supabase.from("ad_projects")
          .select("id", { count: "exact", head: true })
          .eq("client_id", cid)
          .neq("status", "completed"),
        supabase.rpc("get_client_activity", { p_client_id: cid, p_limit: 10 }),
      ]);
      if (cancelled) return;
      setCounts({
        openProposals: openProposals || 0,
        openInvoices:  openInvoices  || 0,
        activeProjects: activeProjects || 0,
      });
      setActivity(feed || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId]);

  if (!activeClient) return null;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        {myFirst ? `Welcome back, ${myFirst}` : "Welcome back"}
      </h1>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
        {activeClient.clientName}
      </div>

      <Section title="Open items">
        <div style={statGridStyle}>
          <StatTile
            label="Proposals to review"
            value={counts.openProposals}
            href={`/c/${activeClient.clientSlug}/proposals`}
            cta="View proposals →"
          />
          <StatTile
            label="Open invoices"
            value={counts.openInvoices}
            href={`/c/${activeClient.clientSlug}/invoices`}
            cta="View invoices →"
          />
          <StatTile
            label="Active ad projects"
            value={counts.activeProjects}
            href={`/c/${activeClient.clientSlug}/ad-projects`}
            cta="View projects →"
          />
        </div>
      </Section>

      <Section title="Recent activity">
        {loading ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : activity.length === 0 ? (
          <Empty hint="You'll see your proposals, invoices, and ad projects here as they move." />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {activity.map((e) => (
              <ActivityRow key={`${e.event_type}-${e.context_id}-${e.event_at}`} ev={e} slug={activeClient.clientSlug} />
            ))}
          </ul>
        )}
        {!loading && activity.length > 0 && (
          <Link to={`/c/${activeClient.clientSlug}/activity`}
            style={{ display: "inline-block", marginTop: 12, color: C.ac, fontSize: 13, fontWeight: 600 }}
          >View all activity →</Link>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: C.cap, marginBottom: 12, fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatTile({ label, value, href, cta }) {
  return (
    <Link to={href} style={{
      display: "block", textDecoration: "none",
      background: "#fff", border: `1px solid ${C.rule}`,
      borderRadius: 8, padding: 16,
      color: C.ink,
    }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, marginTop: 8 }}>{cta}</div>
    </Link>
  );
}

function ActivityRow({ ev, slug }) {
  const href = ev.context_type === "proposal"   ? `/c/${slug}/proposals/${ev.context_id}`
            : ev.context_type === "ad_project" ? `/c/${slug}/ad-projects/${ev.context_id}`
            : ev.context_type === "invoice"    ? `/c/${slug}/invoices/${ev.context_id}`
            : null;
  const amt = ev.detail?.total ?? ev.detail?.amount;
  const Inner = (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: "#fff", border: `1px solid ${C.rule}`,
      borderRadius: 8, marginBottom: 8,
    }}>
      <div aria-hidden style={iconStyle(ev.event_type)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ev.title}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{fmtRelative(ev.event_at)}</div>
      </div>
      {amt != null && (
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, flexShrink: 0 }}>
          {fmtCurrency(amt)}
        </div>
      )}
    </div>
  );
  return <li>{href ? <Link to={href} style={{ textDecoration: "none", color: "inherit" }}>{Inner}</Link> : Inner}</li>;
}

function iconStyle(eventType) {
  const map = {
    proposal_submitted: C.cap,
    proposal_sent:      C.ac,
    proposal_signed:    C.ok,
    proposal_converted: C.ok,
    ad_project_created: C.ac,
    invoice_issued:     C.warn,
    invoice_paid:       C.ok,
  };
  return {
    width: 8, height: 8, borderRadius: 4,
    background: map[eventType] || C.muted,
    flexShrink: 0,
  };
}

function Empty({ hint }) {
  return (
    <div style={{
      padding: "24px 16px", textAlign: "center",
      background: "#fff", border: `1px dashed ${C.rule}`,
      borderRadius: 8, color: C.muted, fontSize: 13,
    }}>{hint}</div>
  );
}

const statGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};
