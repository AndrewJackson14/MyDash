// ============================================================
// Step 7 — Review & Send
//
// Two-column layout: validation summary + line breakdown on the
// left, send actions + live preview on the right. The Send button
// is hard-gated on validateStep7. Mirrors the existing
// sendProposalEmail flow (signature → template → Gmail).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Z, FS, FW, COND, Ri, R, CARD, INV } from "../../../lib/theme";
import { Btn } from "../../ui/Primitives";
import Ic from "../../ui/Icons";
import { generateProposalHtml, DEFAULT_PROPOSAL_CONFIG } from "../../../lib/proposalTemplate";
import { COMPANY } from "../../../constants";
import {
  serializeStateToProposalRow,
  selectAutoTermLabel,
  selectMonthSpan,
  selectPropLineItems,
  selectPTotal,
  selectPMonthly,
} from "../useProposalWizard";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>}
  </div>
);

export default function Step7Review({
  state, actions, ctx, clients, pubs, today,
  team, currentUser, validation, finalValidation,
  sendStatusMsg,
}) {
  const lines    = selectPropLineItems(state, ctx);
  const total    = selectPTotal(state, ctx);
  const monthly  = selectPMonthly(state, ctx);
  const monthSpan = selectMonthSpan(state, ctx.issueMap);
  const term     = selectAutoTermLabel(state);
  const client   = clients.find(c => c.id === state.clientId);
  const errors   = finalValidation?.errors || [];
  const canSend  = errors.length === 0;

  // Default-fill recipients + message once when arriving on this step.
  const initRef = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (initRef.done) return;
    if (!client) return;
    initRef.done = true;
    const contactEmails = (client.contacts || []).filter(c => c.email).map(c => c.email);
    if (state.emailRecipients.length === 0 && contactEmails.length > 0) {
      actions.setEmailRecipients(contactEmails);
    }
    if (!state.emailMessage) {
      const firstName = client.contacts?.[0]?.name || "";
      actions.setEmailMessage(
        `Dear ${firstName},\n\nPlease find the attached proposal.\n\nTotal: $${total.toLocaleString()}\n\nBest,\n${currentUser?.name || COMPANY.sales.name}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  // Live preview HTML
  const previewHtml = useMemo(() => {
    if (!client) return "";
    try {
      const teamMember = currentUser
        || (team || []).find(t => t.id === currentUser?.id)
        || (team || [])[0]
        || { name: COMPANY.sales.name, email: COMPANY.sales.email, phone: COMPANY.sales.phone };
      const proposalRow = serializeStateToProposalRow(state, ctx, "Sent", today);
      return generateProposalHtml({
        config: { ...DEFAULT_PROPOSAL_CONFIG, paymentTiming: state.payTiming },
        proposal: proposalRow,
        client,
        salesperson: teamMember,
        pubs: pubs || [],
        introText: state.emailMessage,
        signLink: "https://mydash.media/sign/preview",
      });
    } catch (e) {
      return `<html><body style="font-family:sans-serif;padding:24px;color:#94a3b8"><strong>Preview unavailable</strong><br/><small>${String(e?.message ?? e)}</small></body></html>`;
    }
  }, [state, client, currentUser, team, pubs, today, ctx]);


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StepHeader
        title="Review & send"
        subtitle="One last check — then off to the client."
      />

      {/* Two-column layout — 1/3 summary, 2/3 send + preview */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 2fr",
        gap: 16,
        minHeight: 0,
      }}>
        {/* LEFT — Summary + validation */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* Validation banner */}
          <div style={{
            padding: 12, borderRadius: R,
            background: canSend ? Z.go + "10" : Z.da + "10",
            border: `1px solid ${canSend ? Z.go : Z.da}40`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {canSend
                ? <Ic.check size={16} color={Z.go} />
                : <span style={{ fontSize: 16, color: Z.da, fontWeight: 900 }}>⚠</span>}
              <span style={{
                fontSize: FS.base, fontWeight: FW.heavy,
                color: canSend ? Z.go : Z.da, fontFamily: COND,
              }}>
                {canSend
                  ? "Everything checks out. Ready to send."
                  : `${errors.length} item${errors.length === 1 ? "" : "s"} need${errors.length === 1 ? "s" : ""} attention before sending`}
              </span>
            </div>
            {!canSend && (
              <ul style={{ margin: 0, paddingLeft: 22, fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>
                {errors.map((e, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <span>Step {e.step}: {e.msg}</span>
                    <button
                      onClick={() => actions.gotoStep(e.step)}
                      style={{
                        marginLeft: 8,
                        background: "none", border: "none",
                        color: "var(--action)", cursor: "pointer",
                        fontFamily: COND, fontSize: FS.sm,
                      }}
                    >Fix →</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Summary card */}
          <div style={{
            background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
            padding: CARD.pad,
            display: "flex", flexDirection: "column", gap: 10,
            fontFamily: COND,
          }}>
            <Row label="Client" value={client?.name || "—"} />
            <Row label="Proposal" value={state.proposalName} />
            <Row label="Pricing tier" value={`${term} (${monthSpan} mo span)`} />
            <Row
              label={`Lines · ${lines.length}`}
              value={
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  {lines.map((li, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: FS.sm, color: Z.tx }}>
                      <span style={{ color: Z.tm }}>{li.pubName}</span>
                      <span>{li.adSize}</span>
                      <span style={{ color: Z.tm }}>{li.issueLabel || (li.flightStartDate ? `${li.flightStartDate} → ${li.flightEndDate}` : "")}</span>
                      <span style={{ fontWeight: FW.heavy }}>${(li.price || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              }
            />
            <Row
              label="Payment"
              value={
                state.payTiming === "monthly"
                  ? `Monthly · ${monthSpan}mo × $${monthly.toLocaleString()} · auto-charge ${state.chargeDay === 1 ? "1st" : "15th"}`
                  : state.payTiming === "lump_sum"
                    ? `Lump sum · $${total.toLocaleString()} upfront`
                    : "Per issue"
              }
            />
            <Row
              label="Art source"
              value={
                state.artSource === "we_design"
                  ? `We Design · brief ${[state.brief.headline, state.brief.style, state.brief.colors].every(v => v?.trim()) ? "complete" : "incomplete"} · ${state.referenceAssets.length} reference photo${state.referenceAssets.length === 1 ? "" : "s"}`
                  : "Camera Ready"
              }
            />
            <div style={{
              borderTop: `1px solid ${Z.bd}`, paddingTop: 10,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>
                ${total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — Send actions + preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{
            background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
            padding: CARD.pad,
            display: "flex", flexDirection: "column", gap: 10, fontFamily: COND,
          }}>
            <div style={{
              fontSize: 11, fontWeight: FW.heavy, color: Z.td,
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>Recipients</div>
            <RecipientPicker
              client={client}
              recipients={state.emailRecipients}
              onToggle={actions.toggleRecipient}
              onSet={actions.setEmailRecipients}
            />

            <div style={{
              fontSize: 11, fontWeight: FW.heavy, color: Z.td,
              letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4,
            }}>Message</div>
            <textarea
              value={state.emailMessage}
              onChange={e => actions.setEmailMessage(e.target.value)}
              rows={5}
              style={{
                background: "rgba(128,128,128,0.10)",
                border: "1px solid rgba(128,128,128,0.20)",
                borderRadius: Ri,
                padding: "10px 14px",
                color: Z.tx, fontSize: FS.base, fontFamily: COND,
                outline: "none", resize: "vertical", minHeight: 100,
              }}
            />

            {sendStatusMsg && (
              <div style={{
                fontSize: FS.sm, color: sendStatusMsg.tone === "error" ? Z.da : Z.wa,
                fontFamily: COND, padding: "6px 10px",
                background: (sendStatusMsg.tone === "error" ? Z.da : Z.wa) + "10",
                border: `1px solid ${(sendStatusMsg.tone === "error" ? Z.da : Z.wa)}40`,
                borderRadius: Ri,
              }}>{sendStatusMsg.msg}</div>
            )}

            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>
              Use the <strong>Send Now</strong> button at the bottom of the wizard to send. Click <strong>Save Draft</strong> to save without sending.
            </div>
          </div>

          {/* Preview iframe — clamped to a viewport-relative max so it
              never overflows the wizard modal even when the proposal
              renders a long table. iframe scrolls internally. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 0, maxHeight: "calc(100vh - 320px)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{
                fontSize: 11, fontWeight: FW.heavy, color: Z.td,
                letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
              }}>Preview · what the client sees</span>
              <span style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>updates as you type</span>
            </div>
            <iframe
              title="Proposal preview"
              srcDoc={previewHtml}
              sandbox=""
              style={{
                flex: 1, width: "100%",
                border: `1px solid ${Z.bd}`, borderRadius: Ri,
                background: "#FFFFFF", minHeight: 0,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: 14,
      fontFamily: COND, alignItems: "start",
    }}>
      <span style={{
        fontSize: 10, fontWeight: FW.heavy, color: Z.td,
        letterSpacing: 0.5, textTransform: "uppercase",
        paddingTop: 2,
      }}>{label}</span>
      <div style={{ fontSize: FS.base, color: Z.tx, textAlign: "right" }}>
        {value}
      </div>
    </div>
  );
}

function RecipientPicker({ client, recipients, onToggle, onSet }) {
  const [manual, setManual] = useState("");
  const contacts = (client?.contacts || []).filter(c => c.email);
  const addManual = () => {
    const v = manual.trim();
    if (v && v.includes("@") && !recipients.includes(v)) {
      onSet([...recipients, v]);
      setManual("");
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {contacts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {contacts.map(c => {
            const active = recipients.includes(c.email);
            return (
              <button
                key={c.email}
                onClick={() => onToggle(c.email)}
                style={{
                  display: "flex", flexDirection: "column", gap: 1,
                  padding: "6px 12px", borderRadius: Ri,
                  border: `1px solid ${active ? Z.go : Z.bd}`,
                  background: active ? Z.go : "transparent",
                  color: active ? INV.light : Z.tx,
                  cursor: "pointer", fontFamily: COND,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold }}>{c.name}</span>
                <span style={{ fontSize: FS.xs, color: active ? INV.light + "b3" : Z.tm }}>{c.email}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
          placeholder="Add email address…"
          style={{
            flex: 1,
            background: "rgba(128,128,128,0.10)",
            border: "1px solid rgba(128,128,128,0.20)",
            borderRadius: Ri, padding: "8px 12px",
            color: Z.tx, fontSize: FS.sm, fontFamily: COND,
            outline: "none",
          }}
        />
        <Btn sm v="secondary" onClick={addManual}>Add</Btn>
      </div>

      {recipients.filter(e => !contacts.some(c => c.email === e)).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {recipients.filter(e => !contacts.some(c => c.email === e)).map(e => (
            <span key={e} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: Ri,
              background: Z.go + "20", color: Z.go,
              fontSize: FS.xs, fontWeight: FW.bold, fontFamily: COND,
            }}>
              {e}
              <button
                onClick={() => onSet(recipients.filter(x => x !== e))}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: Z.go, fontSize: 12, fontWeight: 900, padding: 0,
                }}
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
