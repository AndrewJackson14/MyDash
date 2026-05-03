// /c/<slug>/ad-projects/<id> — read-only detail v1. Spec §5.7.
// Creative upload + revision flow is v2.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtDate } from "../lib/format";
import { ProjectBadge } from "../components/StatusBadge";

export default function AdProjectDetail() {
  const { slug, id } = useParams();
  const { activeClient } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId || !id) return;
    let cancelled = false;
    (async () => {
      const { data: ap, error: e } = await supabase
        .from("ad_projects")
        .select(`
          id, status, ad_size, publication_id, art_source,
          brief_headline, brief_style, brief_colors, brief_instructions,
          source_proposal_id, source_contract_id,
          created_at, updated_at, approved_at,
          designer_signoff_at, salesperson_signoff_at
        `)
        .eq("id", id)
        .eq("client_id", activeClient.clientId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !ap) { setError(e?.message || "Project not found."); return; }
      setData(ap);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, id]);

  if (error) {
    return (
      <div>
        <Link to={`/c/${slug}/ad-projects`} style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>← Ad projects</Link>
        <div style={{
          marginTop: 12, padding: 16, background: "#FEF2F2",
          border: "1px solid #FECACA", borderRadius: 8,
          color: C.err, fontSize: 13,
        }}>{error}</div>
      </div>
    );
  }
  if (!data) return <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <Link to={`/c/${slug}/ad-projects`} style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>
        ← Ad projects
      </Link>

      <div style={{
        background: "#fff", border: `1px solid ${C.rule}`,
        borderRadius: 8, marginTop: 12, padding: 16,
      }}>
        <ProjectBadge value={data.status} />
        <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 8, marginBottom: 4 }}>
          {data.brief_headline || data.ad_size || "Ad project"}
        </h1>
        <div style={{ fontSize: 12, color: C.muted }}>
          {data.publication_id || "—"} · {data.ad_size || "—"}
          {data.approved_at && <> · Approved {fmtDate(data.approved_at)}</>}
        </div>

        {(data.brief_style || data.brief_colors || data.brief_instructions) && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.cap, letterSpacing: 1, marginBottom: 8 }}>BRIEF</div>
            {data.brief_style       && <Field label="Style"        value={data.brief_style} />}
            {data.brief_colors      && <Field label="Colors"       value={data.brief_colors} />}
            {data.brief_instructions && <Field label="Instructions" value={data.brief_instructions} />}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.rule}`, fontSize: 12, color: C.muted }}>
          Creative uploads, proof review, and revision requests land in v2.
          For now your sales rep handles those handoffs by email.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}
