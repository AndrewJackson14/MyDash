// ============================================================
// Step 5 — Payment Terms
//
// Payment timing (per issue / monthly / lump sum) with conditional
// charge-day picker for monthly. Delivery report cadence + recipient
// only show when the proposal carries at least one digital line.
// ============================================================

import { Z, FS, FW, COND, Ri, R, CARD, INV } from "../../../lib/theme";
import { Sel, Inp } from "../../ui/Primitives";
import {
  selectPropLineItems,
  selectPTotal,
  selectPMonthly,
  selectMonthSpan,
} from "../useProposalWizard";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>}
  </div>
);

const PILL_PAD = "10px 16px";

function TimingCard({ active, title, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: PILL_PAD,
        borderRadius: Ri,
        border: `1px solid ${active ? Z.ac : Z.bd}`,
        background: active ? Z.ac + "12" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: COND,
        display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      <div style={{
        fontSize: FS.base,
        fontWeight: active ? FW.heavy : FW.bold,
        color: active ? Z.ac : Z.tx,
      }}>{title}</div>
      {sub && (
        <div style={{ fontSize: FS.xs, color: Z.tm }}>{sub}</div>
      )}
    </button>
  );
}

function ChargeDayPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>Auto-charge on the</span>
      {[1, 15].map(d => {
        const active = value === d;
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            style={{
              padding: "5px 14px", borderRadius: Ri,
              border: `1px solid ${active ? Z.ac : Z.bd}`,
              background: active ? Z.ac + "12" : "transparent",
              cursor: "pointer",
              fontSize: FS.xs, fontWeight: active ? FW.heavy : FW.bold,
              color: active ? Z.ac : Z.tm, fontFamily: COND,
            }}
          >{d === 1 ? "1st" : "15th"}</button>
        );
      })}
      <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>of each month</span>
    </div>
  );
}

const CADENCE_LABELS = {
  weekly:        "Weekly",
  monthly:       "Monthly",
  end_of_flight: "End of flight only",
  annual:        "Annual (12mo+)",
};

export default function Step5PaymentTerms({ state, actions, ctx, clients, validation }) {
  const errors = validation?.errors || {};
  const total    = selectPTotal(state, ctx);
  const monthly  = selectPMonthly(state, ctx);
  const monthSpan = selectMonthSpan(state, ctx.issueMap);
  const lines    = selectPropLineItems(state, ctx);

  const client = clients.find(c => c.id === state.clientId);
  // Pull every email we know about for this client: contacts, primary
  // billing email, and any cc addresses the client config carries.
  // Dedupe so the datalist isn't noisy.
  const emailSuggestions = (() => {
    const out = [];
    const seen = new Set();
    const push = (email, label) => {
      const e = (email || "").trim();
      if (!e || seen.has(e.toLowerCase())) return;
      seen.add(e.toLowerCase());
      out.push({ email: e, label: label || e });
    };
    (client?.contacts || []).forEach(c => { if (c.email) push(c.email, `${c.name || "Contact"} <${c.email}>`); });
    if (client?.billingEmail) push(client.billingEmail, `Billing: ${client.billingEmail}`);
    (client?.billingCcEmails || []).forEach(e => { if (e) push(e, `CC: ${e}`); });
    return out;
  })();

  const hasDigital = state.digitalLines.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      <StepHeader
        title="Payment terms"
        subtitle={`${lines.length} line${lines.length === 1 ? "" : "s"} · $${total.toLocaleString()} total`}
      />

      {/* Payment Timing */}
      <div style={{
        background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
        padding: CARD.pad,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
        }}>Payment Timing</div>
        <div style={{ display: "flex", gap: 8 }}>
          <TimingCard
            active={state.payTiming === "per_issue"}
            title="Per Issue"
            sub="Pay before each issue"
            onClick={() => actions.setPayTiming("per_issue")}
          />
          <TimingCard
            active={state.payTiming === "monthly"}
            title="Monthly"
            sub={monthSpan > 1 ? `${monthSpan}mo × $${monthly.toLocaleString()}` : `$${monthly.toLocaleString()}/mo`}
            onClick={() => actions.setPayTiming("monthly")}
          />
          <TimingCard
            active={state.payTiming === "lump_sum"}
            title="Lump Sum"
            sub={`$${total.toLocaleString()} upfront`}
            onClick={() => actions.setPayTiming("lump_sum")}
          />
        </div>
        {errors.payTiming && (
          <div style={{ fontSize: 11, color: Z.da, fontFamily: COND }}>{errors.payTiming}</div>
        )}

        {state.payTiming === "monthly" && (
          <ChargeDayPicker value={state.chargeDay} onChange={actions.setChargeDay} />
        )}

        {state.payTiming === "per_issue" && (
          <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
            Client receives an invoice before each issue publishes.
          </div>
        )}
        {state.payTiming === "lump_sum" && (
          <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
            Full payment of ${total.toLocaleString()} is due before the first issue.
          </div>
        )}
      </div>

      {/* Delivery Reports — only when digital lines present */}
      {hasDigital && (
        <div style={{
          background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
          padding: CARD.pad,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: FW.heavy, color: Z.td,
            letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
          }}>Delivery Reports</div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CADENCE_LABELS).map(([v, l]) => {
              const active = state.deliveryCadence === v;
              return (
                <button
                  key={v}
                  onClick={() => actions.setDeliveryCadence(v)}
                  style={{
                    padding: "6px 14px", borderRadius: 999,
                    border: `1px solid ${active ? Z.go : Z.bd}`,
                    background: active ? Z.go : "transparent",
                    cursor: "pointer",
                    fontSize: FS.sm, fontWeight: active ? FW.bold : FW.normal,
                    color: active ? INV.light : Z.tm, fontFamily: COND,
                  }}
                >{l}</button>
              );
            })}
          </div>
          {errors.deliveryCadence && (
            <div style={{ fontSize: 11, color: Z.da, fontFamily: COND }}>{errors.deliveryCadence}</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND }}>Send To</label>
            <input
              type="email"
              list="delivery-email-options"
              value={state.deliveryContactId || ""}
              onChange={e => actions.setDeliveryContact(e.target.value || null)}
              placeholder={emailSuggestions[0]?.email || "name@example.com (leave blank to skip email)"}
              style={{
                background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
                padding: "8px 10px", color: Z.tx, fontSize: FS.sm, fontFamily: COND,
                outline: "none",
              }}
            />
            <datalist id="delivery-email-options">
              {emailSuggestions.map(s => (
                <option key={s.email} value={s.email}>{s.label}</option>
              ))}
            </datalist>
            {emailSuggestions.length === 0 && (
              <div style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>
                No saved emails for this client. Enter any address or leave blank to post reports to the client profile only.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
