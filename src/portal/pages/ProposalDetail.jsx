// /c/<slug>/proposals/<proposal_id> — single proposal detail.
// Spec: client-portal-spec.md.md §5.6
//
// Read-only in v1. The status-aware action area shows:
//   - Sent → "View & Sign" (links to mydash.media/sign/<access_token>)
//   - Signed/Converted → "View ad project" (deferred to ad-projects detail)
//   - Cancelled/Declined → cancellation reason if present in notes
//
// Per-pub theming applies via the dominant pub's color (publications.color
// fallback if theme_config is empty per spec §6.1 + Phase D7 user-action).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtDate } from "../lib/format";
import { ProposalBadge } from "../components/StatusBadge";

// Staff app domain for the existing /sign/<access_token> flow.
const STAFF_BASE = "https://mydash.media";

export default function ProposalDetail() {
  const { slug, id } = useParams();
  const { activeClient } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId || !id) return;
    let cancelled = false;
    (async () => {
      const { data: p, error: e } = await supabase
        .from("proposals")
        .select(`
          id, client_id, name, status, total, subtotal,
          markup_applied, markup_percent, markup_amount,
          discount_applied, discount_percent, discount_amount,
          notes, brief_instructions, source,
          awaiting_review_at, sent_at, signed_at, converted_at, created_at,
          proposal_lines ( id, publication_id, pub_name, ad_size, price, flight_start_date, flight_end_date, sort_order ),
          proposal_signatures ( id, access_token, signed, signer_email, signer_name )
        `)
        .eq("id", id)
        .eq("client_id", activeClient.clientId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !p) {
        setError(e?.message || "Proposal not found.");
        return;
      }
      // Resolve dominant pub for theming
      const counts = {};
      (p.proposal_lines || []).forEach((l) => {
        const k = l.publication_id;
        if (k) counts[k] = (counts[k] || 0) + 1;
      });
      const dominantPubId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      let theme = null;
      if (dominantPubId) {
        const { data: pub } = await supabase
          .from("publications")
          .select("id, name, color, logo_url, theme_config")
          .eq("id", dominantPubId)
          .maybeSingle();
        theme = pub || null;
      }
      if (cancelled) return;
      setData({ proposal: p, theme });
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, id]);

  if (error) return <ErrCard body={error} backHref={`/c/${slug}/proposals`} />;
  if (!data) return <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Loading…</div>;
  const { proposal, theme } = data;
  const lines = (proposal.proposal_lines || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sig = proposal.proposal_signatures?.[0];

  const themeColor = theme?.theme_config?.primary_color || theme?.color || C.ac;

  return (
    <div>
      <Link to={`/c/${slug}/proposals`} style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>
        ← Proposals
      </Link>

      <div style={{
        background: "#fff", border: `1px solid ${C.rule}`,
        borderRadius: 8, marginTop: 12, overflow: "hidden",
      }}>
        <div style={{
          height: 4, background: themeColor,
        }} />
        <div style={{ padding: 16, borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <ProposalBadge value={proposal.status} />
            {theme?.name && (
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                {theme.name}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{proposal.name || "Proposal"}</h1>
          <div style={{ fontSize: 12, color: C.muted }}>
            Submitted {fmtDate(proposal.awaiting_review_at || proposal.created_at)}
            {proposal.signed_at && <> · Signed {fmtDate(proposal.signed_at)}</>}
          </div>
        </div>

        {/* Action area */}
        <ActionArea proposal={proposal} sig={sig} slug={slug} />

        {/* Line items */}
        <div style={{ padding: 16, borderTop: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.cap, letterSpacing: 1, marginBottom: 12 }}>
            LINE ITEMS
          </div>
          {lines.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No line items.</div>
          ) : (
            <div>
              {lines.map((l) => (
                <div key={l.id} style={{
                  display: "flex", alignItems: "flex-start",
                  padding: "10px 0", borderTop: `1px solid ${C.rule}`,
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                      {l.ad_size || "Ad"} · {l.pub_name || l.publication_id}
                    </div>
                    {(l.flight_start_date || l.flight_end_date) && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {fmtDate(l.flight_start_date)}{l.flight_end_date ? ` → ${fmtDate(l.flight_end_date)}` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, flexShrink: 0 }}>
                    {fmtCurrency(l.price)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ padding: 16, background: C.bg }}>
          <Totals p={proposal} />
        </div>

        {/* Brief instructions / customer-visible notes */}
        {(proposal.brief_instructions || proposal.notes) && (
          <div style={{ padding: 16, borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.cap, letterSpacing: 1, marginBottom: 8 }}>
              {proposal.brief_instructions ? "CREATIVE NOTES" : "NOTES"}
            </div>
            <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {proposal.brief_instructions || proposal.notes}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionArea({ proposal, sig, slug }) {
  // Sent → external sign link
  if (proposal.status === "Sent" && sig?.access_token && !sig.signed) {
    return (
      <div style={{ padding: 16 }}>
        <a
          href={`${STAFF_BASE}/sign/${sig.access_token}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: "block", textAlign: "center",
            background: C.ok, color: "#fff",
            padding: "12px 16px",
            borderRadius: 6, fontSize: 14, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ✓ View & Sign Proposal
        </a>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>
          Opens the secure signing page.
        </div>
      </div>
    );
  }
  if (proposal.status === "Approved/Signed" || proposal.status === "Signed & Converted" || proposal.status === "Converted") {
    return (
      <div style={{ padding: 16 }}>
        <Link to={`/c/${slug}/ad-projects`} style={{
          display: "block", textAlign: "center",
          background: "#fff", color: C.ac,
          border: `1px solid ${C.rule}`,
          padding: "12px 16px",
          borderRadius: 6, fontSize: 14, fontWeight: 700,
          textDecoration: "none",
        }}>
          View ad projects →
        </Link>
      </div>
    );
  }
  if (proposal.status === "Cancelled" || proposal.status === "Declined") {
    return (
      <div style={{ padding: 16, background: "#FEF2F2", color: "#991B1B", fontSize: 13 }}>
        This proposal was {proposal.status.toLowerCase()}.{proposal.notes ? <> Reason: {proposal.notes}</> : ""}
      </div>
    );
  }
  return null;
}

function Totals({ p }) {
  return (
    <div style={{ fontSize: 13 }}>
      <Row label="Subtotal" value={fmtCurrency(p.subtotal || 0)} />
      {p.markup_applied && p.markup_amount > 0 && (
        <Row label={`Markup${p.markup_percent ? ` (${p.markup_percent}%)` : ""}`} value={fmtCurrency(p.markup_amount)} />
      )}
      {p.discount_applied && p.discount_amount > 0 && (
        <Row label={`Discount${p.discount_percent ? ` (${p.discount_percent}%)` : ""}`} value={`–${fmtCurrency(p.discount_amount)}`} />
      )}
      <div style={{ height: 1, background: C.rule, margin: "8px 0" }} />
      <Row label={<strong>Total</strong>} value={<strong>{fmtCurrency(p.total)}</strong>} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: C.ink }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ErrCard({ body, backHref }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{
        padding: 16, background: "#FEF2F2",
        border: "1px solid #FECACA", borderRadius: 8,
        color: C.err, fontSize: 13,
      }}>{body}</div>
      <Link to={backHref} style={{ color: C.ac, fontSize: 13, marginTop: 12, display: "inline-block" }}>
        ← Back
      </Link>
    </div>
  );
}
