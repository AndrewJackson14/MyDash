// /c/<slug>/proposals — list of proposals for the active client.
// Spec: client-portal-spec.md.md §5.5
//
// Filter chips: All / Awaiting Review / Sent / Signed / Declined.
// "Signed" maps to multiple statuses (Approved/Signed, Signed & Converted, Converted).
// "Declined" maps to (Declined, Cancelled, Expired).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtRelative } from "../lib/format";
import { ProposalBadge } from "../components/StatusBadge";

const FILTERS = [
  { key: "all",      label: "All",      statuses: null },
  { key: "review",   label: "Awaiting", statuses: ["Awaiting Review"] },
  { key: "sent",     label: "Sent",     statuses: ["Sent", "Under Review"] },
  { key: "signed",   label: "Signed",   statuses: ["Approved/Signed", "Signed & Converted", "Converted"] },
  { key: "declined", label: "Declined", statuses: ["Declined", "Cancelled", "Expired"] },
];

export default function ProposalsList() {
  const { slug } = useParams();
  const { activeClient } = usePortal();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    setItems(null);
    (async () => {
      let q = supabase
        .from("proposals")
        .select(`
          id, name, status, total, source,
          awaiting_review_at, sent_at, signed_at, converted_at, created_at,
          proposal_lines ( id, publication_id, pub_name )
        `)
        .eq("client_id", activeClient.clientId)
        .order("created_at", { ascending: false });
      const f = FILTERS.find((x) => x.key === filter);
      if (f?.statuses) q = q.in("status", f.statuses);
      const { data, error: e } = await q;
      if (cancelled) return;
      if (e) { setError(e.message); setItems([]); return; }
      setItems(data || []);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, filter]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Your proposals</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            style={chipStyle(filter === f.key)}
          >{f.label}</button>
        ))}
      </div>

      {items === null && <Loading />}
      {error && <ErrCard body={error} />}
      {items?.length === 0 && (
        <Empty hint={
          filter === "all"
            ? "You haven't submitted any proposals yet."
            : "No proposals match this filter."
        } />
      )}
      {items && items.map((p) => (
        <ProposalCard key={p.id} p={p} slug={slug} />
      ))}
    </div>
  );
}

function ProposalCard({ p, slug }) {
  const lines = p.proposal_lines || [];
  const pubs = useMemo(() => {
    const counts = {};
    lines.forEach((l) => {
      const k = l.pub_name || l.publication_id || "Other";
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [lines]);
  const stamp = p.signed_at || p.sent_at || p.awaiting_review_at || p.created_at;

  return (
    <Link to={`/c/${slug}/proposals/${p.id}`} style={{
      display: "block", textDecoration: "none", color: "inherit",
      background: "#fff", border: `1px solid ${C.rule}`,
      borderRadius: 8, padding: 16, marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
            {p.name || "Proposal"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
            {pubs.length === 0 ? "—"
              : pubs.length === 1 ? pubs[0][0]
              : `${pubs[0][0]} +${pubs.length - 1} more`}
            {" · "}
            {lines.length} line{lines.length === 1 ? "" : "s"}
            {" · "}{fmtRelative(stamp)}
          </div>
          <ProposalBadge value={p.status} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{fmtCurrency(p.total)}</div>
          <div style={{ fontSize: 11, color: C.ac, marginTop: 4, fontWeight: 600 }}>View →</div>
        </div>
      </div>
    </Link>
  );
}

function Loading() {
  return <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Loading…</div>;
}
function Empty({ hint }) {
  return (
    <div style={{
      padding: "32px 16px", textAlign: "center",
      background: "#fff", border: `1px dashed ${C.rule}`,
      borderRadius: 8, color: C.muted, fontSize: 13,
    }}>{hint}</div>
  );
}
function ErrCard({ body }) {
  return <div style={{
    padding: "12px 14px", background: "#FEF2F2",
    border: "1px solid #FECACA", borderRadius: 6,
    fontSize: 13, color: C.err, marginBottom: 12,
  }}>{body}</div>;
}

const chipStyle = (active) => ({
  fontSize: 12, fontWeight: 600,
  padding: "6px 12px", borderRadius: 999,
  border: `1px solid ${active ? C.ac : C.rule}`,
  background: active ? C.ac : "#fff",
  color: active ? "#fff" : C.muted,
  cursor: "pointer", fontFamily: "inherit",
});
