// Business details — read-only v1. Edits route to "contact your sales rep".
// Spec §5.9 (Business details tab).
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { C } from "../../lib/portalUi";

export default function BusinessTab({ clientId }) {
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data: c, error: e } = await supabase
        .from("clients")
        .select(`
          name, status, category, industries, website_url,
          billing_email, billing_address, billing_address2,
          billing_city, billing_state, billing_zip,
          address_street, address_unit, address_city, address_state, zip
        `)
        .eq("id", clientId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !c) { setError(e?.message || "Couldn't load."); return; }
      setData(c);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (error) return <ErrCard body={error} />;
  if (!data) return <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>;

  const physicalAddr = [
    [data.address_street, data.address_unit].filter(Boolean).join(" "),
    [data.address_city, data.address_state, data.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
  const billingAddr = [
    [data.billing_address, data.billing_address2].filter(Boolean).join(" "),
    [data.billing_city, data.billing_state, data.billing_zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");

  return (
    <div style={cardStyle}>
      <Field label="Business name" value={data.name} />
      <Field label="Industries"    value={(data.industries || []).join(", ") || "—"} />
      {data.category && <Field label="Category" value={data.category} />}
      <Field label="Website"       value={data.website_url ? (
        <a href={data.website_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ac }}>
          {data.website_url}
        </a>
      ) : "—"} />
      <Field label="Physical address" value={physicalAddr || "—"} />
      <Field label="Billing email"    value={data.billing_email || "—"} />
      <Field label="Billing address"  value={billingAddr || "—"} />

      <div style={{ marginTop: 20, padding: 12,
        background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 6,
        fontSize: 12, color: C.muted, lineHeight: 1.5,
      }}>
        To update business details, contact your sales rep.
        Self-service editing lands in v2.
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${C.rule}`, display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ width: 140, fontSize: 12, color: C.muted, fontWeight: 600, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink, flex: 1, minWidth: 200 }}>{value}</div>
    </div>
  );
}

function ErrCard({ body }) {
  return (
    <div style={{
      padding: 16, background: "#FEF2F2",
      border: "1px solid #FECACA", borderRadius: 8,
      color: C.err, fontSize: 13,
    }}>{body}</div>
  );
}

const cardStyle = {
  background: "#fff", border: `1px solid ${C.rule}`,
  borderRadius: 8, padding: "0 16px 16px",
};
