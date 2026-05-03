// /c/<slug>/ad-projects — list. Spec §5.7. Read-only in v1.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtRelative } from "../lib/format";
import { ProjectBadge } from "../components/StatusBadge";

const FILTERS = [
  { key: "active",    label: "In progress", exclude: ["completed"] },
  { key: "completed", label: "Completed",   only: ["completed"] },
  { key: "all",       label: "All",         exclude: null },
];

export default function AdProjectsList() {
  const { slug } = useParams();
  const { activeClient } = usePortal();
  const [filter, setFilter] = useState("active");
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    setItems(null);
    (async () => {
      let q = supabase.from("ad_projects")
        .select("id, status, ad_size, publication_id, brief_headline, created_at, updated_at, source_proposal_id")
        .eq("client_id", activeClient.clientId)
        .order("created_at", { ascending: false });
      const f = FILTERS.find((x) => x.key === filter);
      if (f?.exclude) q = q.not("status", "in", `(${f.exclude.join(",")})`);
      if (f?.only)    q = q.in("status", f.only);
      const { data } = await q;
      if (cancelled) return;
      setItems(data || []);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, filter]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Your ad projects</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            style={chipStyle(filter === f.key)}
          >{f.label}</button>
        ))}
      </div>

      {items === null ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Loading…</div>
      ) : items.length === 0 ? (
        <Empty hint={
          filter === "active"
            ? "No active projects. Once a proposal is signed and converted, your ad project will appear here."
            : "No projects in this view."
        } />
      ) : items.map((ap) => (
        <Link to={`/c/${slug}/ad-projects/${ap.id}`} key={ap.id} style={{
          display: "block", textDecoration: "none", color: "inherit",
          background: "#fff", border: `1px solid ${C.rule}`,
          borderRadius: 8, padding: 14, marginBottom: 10,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                {ap.brief_headline || ap.ad_size || "Ad project"}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                {ap.publication_id || "—"} · updated {fmtRelative(ap.updated_at || ap.created_at)}
              </div>
              <ProjectBadge value={ap.status} />
            </div>
            <div style={{ fontSize: 11, color: C.ac, fontWeight: 600, alignSelf: "center" }}>View →</div>
          </div>
        </Link>
      ))}
    </div>
  );
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

const chipStyle = (active) => ({
  fontSize: 12, fontWeight: 600,
  padding: "6px 12px", borderRadius: 999,
  border: `1px solid ${active ? C.ac : C.rule}`,
  background: active ? C.ac : "#fff",
  color: active ? "#fff" : C.muted,
  cursor: "pointer", fontFamily: "inherit",
});
