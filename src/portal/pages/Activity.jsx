// /c/<slug>/activity — full activity feed. Spec §5.10.
//
// Filter chips toggle which event_type prefixes show. Server returns
// up to p_limit=100 events; we filter client-side because the function
// uses UNION ALL across many small selects (cheap to over-fetch and
// trim in JS than to pass dynamic filters into the SQL).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtRelative } from "../lib/format";

const FILTERS = [
  { key: "all",        label: "All",         match: () => true },
  { key: "proposals",  label: "Proposals",   match: (e) => e.context_type === "proposal" },
  { key: "ad_projects", label: "Ad projects", match: (e) => e.context_type === "ad_project" },
  { key: "invoices",   label: "Invoices",    match: (e) => e.context_type === "invoice" },
];

export default function Activity() {
  const { slug } = useParams();
  const { activeClient } = usePortal();
  const [filter, setFilter] = useState("all");
  const [feed, setFeed] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_client_activity", {
        p_client_id: activeClient.clientId, p_limit: 100,
      });
      if (cancelled) return;
      setFeed(data || []);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId]);

  const visible = useMemo(() => {
    if (!feed) return null;
    const f = FILTERS.find((x) => x.key === filter);
    return f ? feed.filter(f.match) : feed;
  }, [feed, filter]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Activity</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            style={chipStyle(filter === f.key)}
          >{f.label}</button>
        ))}
      </div>

      {visible === null ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{
          padding: "32px 16px", textAlign: "center",
          background: "#fff", border: `1px dashed ${C.rule}`,
          borderRadius: 8, color: C.muted, fontSize: 13,
        }}>No events to show.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((e) => (
            <Row key={`${e.event_type}-${e.context_id}-${e.event_at}`} ev={e} slug={slug} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ ev, slug }) {
  const href = ev.context_type === "proposal"   ? `/c/${slug}/proposals/${ev.context_id}`
            : ev.context_type === "ad_project" ? `/c/${slug}/ad-projects/${ev.context_id}`
            : ev.context_type === "invoice"    ? `/c/${slug}/invoices/${ev.context_id}`
            : null;
  const amt = ev.detail?.total ?? ev.detail?.amount;
  const inner = (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: "#fff", border: `1px solid ${C.rule}`,
      borderRadius: 8, marginBottom: 8,
    }}>
      <div aria-hidden style={{
        width: 8, height: 8, borderRadius: 4,
        background: dot(ev.event_type),
        flexShrink: 0,
      }} />
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
  return <li>{href ? <Link to={href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link> : inner}</li>;
}

function dot(type) {
  return ({
    proposal_submitted: C.cap,
    proposal_sent:      C.ac,
    proposal_signed:    C.ok,
    proposal_converted: C.ok,
    ad_project_created: C.ac,
    invoice_issued:     C.warn,
    invoice_paid:       C.ok,
  })[type] || C.muted;
}

const chipStyle = (active) => ({
  fontSize: 12, fontWeight: 600,
  padding: "6px 12px", borderRadius: 999,
  border: `1px solid ${active ? C.ac : C.rule}`,
  background: active ? C.ac : "#fff",
  color: active ? "#fff" : C.muted,
  cursor: "pointer", fontFamily: "inherit",
});
