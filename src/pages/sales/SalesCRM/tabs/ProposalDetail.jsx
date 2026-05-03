import { useMemo, useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../../../lib/theme";
import { Badge, Btn, GlassCard, Ic } from "../../../../components/ui";
import { supabase, EDGE_FN_URL } from "../../../../lib/supabase";
import { generateProposalHtml, DEFAULT_PROPOSAL_CONFIG } from "../../../../lib/proposalTemplate";
import { fmtDate } from "../../../../lib/formatters";
import { cn as cnHelper } from "../SalesCRM.helpers";

// Proposals carry mixed timestamp shapes — sometimes ISO (closedAt,
// signedAt, history[].date), sometimes YYYY-MM-DD (p.date). fmtDate
// expects YYYY-MM-DD; this wrapper normalizes ISO inputs.
const fmtPropDate = (d) => {
  if (!d) return "";
  const s = typeof d === "string" ? d : "";
  return fmtDate(s.length > 10 ? s.slice(0, 10) : s);
};
import { propPubNames } from "./ProposalsTab";

// Proposal detail view — right pane of the Proposals tab. Renders when
// viewPropId is set. Owns its own action toolbar (sign, edit, decline,
// copy, cancel) but defers to parent callbacks for state changes that
// affect sibling tabs (signProposal, editProposal).
//
// Wave 3 Task 3.7 — adds a "Preview" toggle that renders the proposal
// through the same generateProposalHtml the wizard uses. Two consumers,
// one source of truth — the rep sees identical chrome before signing
// and during the wizard's review step.
export default function ProposalDetail({
  proposal: p,
  clients, clientsById, pubs, team, currentUser,
  dialog,
  updateProposal, insertProposal,
  signProposal, editProposal,
  setViewPropId,
}) {
  if (!p) return null;
  const cn = (id) => cnHelper(id, clientsById);
  const grouped = {};
  (p.lines || []).forEach(li => { if (!grouped[li.pubName]) grouped[li.pubName] = []; grouped[li.pubName].push(li); });
  const isSelfServe = p.source === "self_serve";

  // Wave 3 Task 3.7 — view mode toggle
  const [viewMode, setViewMode] = useState("summary"); // "summary" | "preview"

  // Live preview HTML — generated only when the rep flips to preview
  // mode (saves cycles on the default summary view).
  const previewHtml = useMemo(() => {
    if (viewMode !== "preview") return "";
    const client = (clients || []).find(c => c.id === p.clientId) || null;
    const salesperson = currentUser || (team || []).find(t => t.id === p.assignedTo) || (team || [])[0] || null;
    try {
      return generateProposalHtml({
        config: { ...DEFAULT_PROPOSAL_CONFIG, paymentTiming: p.paymentTiming },
        proposal: p,
        client,
        salesperson,
        pubs: pubs || [],
      });
    } catch (e) {
      return `<html><body style="font-family:sans-serif;padding:24px;color:#94a3b8"><strong>Preview unavailable</strong><br/><small>${String(e?.message ?? e)}</small></body></html>`;
    }
  }, [viewMode, p, clients, pubs, team, currentUser]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Wave 3 Task 3.7 — Summary / Preview toggle. Summary is the
          local hand-rolled card view; Preview renders the actual email
          HTML the wizard sends, sharing the renderer with Step7Review. */}
      <div style={{ display: "flex", gap: 4, alignSelf: "flex-start" }}>
        {[["summary", "Summary"], ["preview", "Preview"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            style={{
              padding: "5px 14px",
              borderRadius: Ri,
              border: `1px solid ${viewMode === key ? Z.ac : Z.bd}`,
              background: viewMode === key ? Z.ac + "15" : "transparent",
              color: viewMode === key ? Z.ac : Z.tm,
              cursor: "pointer",
              fontSize: FS.xs,
              fontWeight: FW.heavy,
              fontFamily: COND,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >{label}</button>
        ))}
      </div>

      {viewMode === "preview" && (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <iframe
            srcDoc={previewHtml}
            title={`Proposal preview — ${p.name}`}
            style={{ width: "100%", height: "70vh", border: "none", background: "#fff", borderRadius: R, display: "block" }}
          />
        </GlassCard>
      )}

      {viewMode === "summary" && <>
      {isSelfServe && (
        <div style={{ background: Z.ss, border: `1px solid ${Z.ac}`, borderRadius: R, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🛒</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac, textTransform: "uppercase", letterSpacing: 0.6 }}>Self-serve submission</div>
            <div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 2 }}>
              Intake email: <span style={{ fontWeight: FW.bold }}>{p.intakeEmail || "—"}</span>
              {p.awaitingReviewAt && <> · Submitted {new Date(p.awaitingReviewAt).toLocaleString()}</>}
            </div>
          </div>
        </div>
      )}
      {isSelfServe && (p.subtotal != null || p.markupApplied || p.discountApplied) && (
        <GlassCard>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Original self-serve pricing</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", fontSize: FS.sm, color: Z.tx }}>
            <span>Subtotal</span><span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${Number(p.subtotal || 0).toLocaleString()}</span>
            {p.markupApplied && <>
              <span style={{ color: Z.wa }}>Industry markup ({Number(p.markupPercent || 0)}%)</span>
              <span style={{ textAlign: "right", color: Z.wa, fontVariantNumeric: "tabular-nums" }}>+ ${Number(p.markupAmount || 0).toLocaleString()}</span>
            </>}
            {p.discountApplied && <>
              <span style={{ color: Z.go }}>Local-zip discount ({Number(p.discountPercent || 0)}%)</span>
              <span style={{ textAlign: "right", color: Z.go, fontVariantNumeric: "tabular-nums" }}>− ${Number(p.discountAmount || 0).toLocaleString()}</span>
            </>}
            <span style={{ fontWeight: FW.heavy, borderTop: `1px solid ${Z.bd}`, paddingTop: 4 }}>Total</span>
            <span style={{ textAlign: "right", fontWeight: FW.heavy, borderTop: `1px solid ${Z.bd}`, paddingTop: 4, fontVariantNumeric: "tabular-nums" }}>${Number(p.total || 0).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 8, fontFamily: COND }}>Read-only. Rep edits below override these line prices but don't recompute markup/discount.</div>
        </GlassCard>
      )}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{p.name}</h2>
          <div style={{ fontSize: FS.base, color: Z.tm }}>{cn(p.clientId)} · {p.term} · {p.date}</div>
          <div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 3 }}>{propPubNames(p)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.tx }}>${p.total.toLocaleString()}</div>
          <Badge status={p.status} />
          {p.closedAt && <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Closed: {fmtPropDate(p.closedAt)}</div>}
        </div>
      </div>
      {Object.entries(grouped).map(([pub, lines]) => (
        <GlassCard key={pub}>
          <h4 style={{ margin: "0 0 8px", fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{pub}</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {lines.map((li, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6, padding: "5px 8px", background: Z.bg, borderRadius: R }}>
                <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{li.issueLabel}</span>
                <span style={{ fontSize: FS.sm, color: Z.tm }}>{li.adSize}</span>
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${li.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      ))}
      <div style={{ background: Z.sa, borderRadius: R, padding: 12, border: `1px solid ${Z.bd}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Items</div><div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{p.lines.length}</div></div>
        <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Tier</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.term}</div></div>
        <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Contract</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.termMonths} months</div></div>
        <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>{p.payPlan ? "Monthly" : "Payment"}</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.payPlan ? `$${p.monthly?.toLocaleString()}/mo` : `$${p.total.toLocaleString()}`}</div></div>
      </div>
      {p.sentTo?.length > 0 && <div style={{ fontSize: FS.sm, color: Z.tm }}>Sent to: {p.sentTo.join(", ")}</div>}
      {p.renewalDate && <div style={{ fontSize: FS.sm, color: Z.wa }}>Renewal: {p.renewalDate}</div>}
      </>}

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {p.status === "Awaiting Review" && <>
          <Btn v="success" onClick={async () => {
            if (!await dialog.confirm("Send this self-serve submission to the advertiser as-is?")) return;
            // Mirror proposal-wizard's signature-row creation. Without this row,
            // StellarPress's ProposalStatusPage can't show a "View & Sign" link.
            const client = clients.find(c => c.id === p.clientId);
            const primaryContact = (client?.contacts || []).find(c => c.email) || {};
            const snapshot = { ...p, clientName: client?.name };
            const { error: sigErr } = await supabase.from("proposal_signatures").insert({
              proposal_id: p.id,
              signer_name: primaryContact.name || client?.name || p.intakeEmail || "",
              signer_email: primaryContact.email || p.intakeEmail || "",
              proposal_snapshot: snapshot,
            });
            if (sigErr) console.error("[send-as-is] signature insert error:", sigErr);
            await updateProposal(p.id, { status: "Sent", sentAt: new Date().toISOString() });
          }}><Ic.mail size={12} /> Send as-is</Btn>
          <Btn v="secondary" onClick={async () => {
            await updateProposal(p.id, { status: "Draft" });
            editProposal(p.id);
          }}><Ic.edit size={12} /> Edit & Send</Btn>
          <Btn v="ghost" onClick={async () => {
            const reason = await dialog.prompt("Decline this self-serve submission. Reason (visible to advertiser):");
            if (reason == null) return;
            await updateProposal(p.id, { status: "Declined", notes: reason || "" });
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const tok = session?.access_token;
              if (tok) {
                await fetch(`${EDGE_FN_URL}/self-serve-decline-email`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ proposal_id: p.id }),
                });
              }
            } catch (err) {
              console.warn("[decline-email] send failed:", err);
            }
            setViewPropId(null);
          }} style={{ color: Z.da }}>Decline</Btn>
        </>}
        {p.status === "Sent" && <Btn v="success" onClick={async () => { await signProposal(p.id); setViewPropId(null); }}>Client Signed → Contract</Btn>}
        {(p.status === "Sent" || p.status === "Draft") && <Btn v="secondary" onClick={() => editProposal(p.id)}><Ic.edit size={12} /> {p.status === "Draft" ? "Edit Draft" : "Edit & Resend"}</Btn>}
        {p.status === "Signed & Converted" && <span style={{ fontSize: FS.sm, color: Z.su, fontWeight: FW.bold }}>✓ Signed & Converted</span>}
        {(p.status === "Signed & Converted" || p.status === "Cancelled") && <Btn v="secondary" onClick={async () => {
          const today = new Date().toISOString().slice(0, 10);
          const futureLines = (p.lines || []).filter(l => !l.issueDate || l.issueDate >= today);
          if (futureLines.length === 0) { await dialog.alert("No future issues to copy — all issues have already published."); return; }
          const newTotal = futureLines.reduce((s, l) => s + (l.price || 0), 0);
          const copy = { ...p, name: p.name + " (Copy)", status: "Draft", lines: futureLines, total: newTotal, date: today, sentAt: null, signedAt: null, convertedAt: null, contractId: null };
          delete copy.id; delete copy.history;
          const result = await insertProposal(copy);
          if (result?.id) { await dialog.alert(`Copy created with ${futureLines.length} future items ($${newTotal.toLocaleString()}). ${(p.lines || []).length - futureLines.length} past issues removed.`); setViewPropId(result.id); }
        }}><Ic.file size={12} /> Create Copy</Btn>}
        {p.status !== "Signed & Converted" && p.status !== "Cancelled" && <Btn v="ghost" onClick={async () => { if (!await dialog.confirm("Cancel this proposal? It will be archived.")) return; await updateProposal(p.id, { status: "Cancelled" }); setViewPropId(null); }} style={{ color: Z.da }}>Cancel Proposal</Btn>}
        {p.status === "Cancelled" && <span style={{ fontSize: FS.sm, color: Z.da, fontWeight: FW.bold }}>Cancelled</span>}
      </div>

      {p.history?.length > 0 && <GlassCard>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>History</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(p.history || []).map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: i < p.history.length - 1 ? `1px solid ${Z.bd}15` : "none" }}>
              <span style={{ fontSize: FS.xs, color: Z.tm, minWidth: 90 }}>{fmtPropDate(h.date)}</span>
              <span style={{ fontSize: FS.sm, color: Z.tx }}>{h.detail || h.event}</span>
            </div>
          ))}
        </div>
      </GlassCard>}
    </div>
  );
}
