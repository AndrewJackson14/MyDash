// ChargeCardModal — in-the-field credit-card capture.
//
// Flow:
//   1. Rep taps "Charge Card" on a client → modal opens
//   2. Picks amount + description, optional save-to-client checkbox
//   3. Backend creates a PaymentIntent (stripe-card create_charge_intent)
//   4. Stripe Elements card form renders — iOS Safari shows
//      "Scan Credit Card" above the keyboard when the rep taps the
//      card-number field, so a tap of the camera at the customer's
//      card autofills the digits, expiry, and (sometimes) name. Same
//      story on Android Chrome via Google Autofill. Zero extra SDK,
//      zero PCI scope (the input lives in Stripe's iframe).
//   5. confirmPayment → on success, post back to record_mobile_charge
//      so the payments row + saved-card-on-client land immediately
//      (the webhook is the source of truth, this is for UX latency).
//
// Important: card scan ONLY works because Stripe Elements puts
// autocomplete="cc-number" on the inner input. If we ever swapped to
// a custom card form we'd lose the system scan affordance.
import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from "@stripe/react-stripe-js";
import { supabase, EDGE_FN_URL, SUPABASE_ANON_KEY } from "../../lib/supabase";
import { Ic } from "../../components/ui";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, fmtMoneyFull } from "./mobileTokens";

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

export default function ChargeCardModal({ client, sale, onClose, onSuccess }) {
  // Two-step: (1) collect amount + intent, (2) Stripe Elements card form.
  const [step, setStep] = useState("setup"); // setup | pay | done
  const [amount, setAmount] = useState(sale?.amount ? String(sale.amount) : "");
  const [description, setDescription] = useState(sale?.name ? `${sale.name} — ${client.name}` : "");
  const [saveCard, setSaveCard] = useState(true);
  const [creating, setCreating] = useState(false);
  const [intent, setIntent] = useState(null); // { client_secret, intent_id }
  const [error, setError] = useState(null);

  const amountCents = Math.round((parseFloat(amount || "0") || 0) * 100);
  const canCreateIntent = amountCents >= 50 && description.trim().length > 0 && !creating;

  if (!STRIPE_PK) {
    return <Backdrop onClose={onClose}>
      <Sheet>
        <Header title="Card capture unavailable" onClose={onClose} />
        <div style={{ padding: "12px 18px 24px", color: TOKENS.muted, fontSize: 14, lineHeight: 1.5 }}>
          VITE_STRIPE_PUBLIC_KEY isn't set in this build's env. Add it to GitHub repo Secrets and redeploy.
        </div>
      </Sheet>
    </Backdrop>;
  }

  const createIntent = async () => {
    setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${EDGE_FN_URL}/stripe-card`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: "create_charge_intent",
          client_id: client.id,
          amount_cents: amountCents,
          description: description.trim(),
          save_card: saveCard,
          sale_id: sale?.id || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.client_secret) throw new Error(json.error || `Stripe error (${res.status})`);
      setIntent(json);
      setStep("pay");
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setCreating(false);
    }
  };

  return <Backdrop onClose={onClose}>
    <Sheet>
      <Header
        title={step === "setup" ? "Charge card" : step === "pay" ? `Pay ${fmtMoneyFull(amountCents / 100)}` : "Paid"}
        onClose={onClose}
      />

      {step === "setup" && <div style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <ClientPill client={client} />

        <Field label="Amount (USD)">
          <input
            type="number"
            inputMode="decimal"
            min="0.50"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={inputStyle}
            autoFocus
          />
        </Field>

        <Field label="What's this for?">
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Half-page ad — November issue"
            style={inputStyle}
          />
        </Field>

        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", background: SURFACE.alt, borderRadius: 10,
          cursor: "pointer",
        }}>
          <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} style={{ marginTop: 3, accentColor: ACCENT, width: 18, height: 18 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Save card to client for renewals</div>
            <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>
              Lets you charge again with one tap. Card details encrypted by Stripe — never touches MyDash.
            </div>
          </div>
        </label>

        {error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>{error}</div>}

        <button
          onClick={createIntent}
          disabled={!canCreateIntent}
          style={{
            ...primaryBtnStyle,
            background: canCreateIntent ? ACCENT : TOKENS.rule,
            color: canCreateIntent ? "#FFFFFF" : TOKENS.muted,
          }}
        >{creating ? "Preparing…" : `Continue · ${fmtMoneyFull((amountCents / 100) || 0)}`}</button>

        <div style={{ fontSize: 11, color: TOKENS.muted, textAlign: "center", marginTop: 4 }}>
          On the next screen, tap the card number field — your camera can scan the card directly.
        </div>
      </div>}

      {step === "pay" && intent && <Elements stripe={stripePromise} options={{ clientSecret: intent.client_secret, appearance: stripeAppearance }}>
        <PaymentForm
          client={client}
          amountCents={amountCents}
          description={description}
          saveCard={saveCard}
          intentId={intent.intent_id}
          onBack={() => setStep("setup")}
          onSuccess={(payload) => {
            setStep("done");
            onSuccess?.(payload);
          }}
        />
      </Elements>}

      {step === "done" && <div style={{ padding: "32px 18px 32px", textAlign: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32, margin: "0 auto 16px",
          background: TOKENS.good, color: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Ic.check size={36} color="#FFFFFF" /></div>
        <div style={{ fontSize: 22, fontWeight: 800, color: INK, marginBottom: 6 }}>{fmtMoneyFull(amountCents / 100)} charged</div>
        <div style={{ fontSize: 14, color: TOKENS.muted, lineHeight: 1.5, marginBottom: 24 }}>
          Receipt is on its way to {client.billing_email || (client.contacts?.[0]?.email) || "the customer"}.
          {saveCard && <><br />Card saved to {client.name} for next time.</>}
        </div>
        <button onClick={onClose} style={primaryBtnStyle}>Done</button>
      </div>}
    </Sheet>
  </Backdrop>;
}

// ── Stripe Elements form ──────────────────────────────────────
function PaymentForm({ client, amountCents, description, saveCard, intentId, onBack, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      // We handle success in-app rather than redirecting to a return URL.
      redirect: "if_required",
    });

    if (confirmErr) {
      setError(confirmErr.message || "Payment failed");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // Belt-and-suspenders: tell our backend immediately so the
      // payments row + saved-card-on-client appear without waiting
      // on the webhook.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        await fetch(`${EDGE_FN_URL}/stripe-card`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${token || SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: "record_mobile_charge",
            client_id: client.id,
            intent_id: intentId,
          }),
        });
      } catch (_e) { /* webhook still wins; UI doesn't block */ }
      onSuccess({ amount: amountCents / 100, intentId });
      return;
    }

    setError(`Unexpected status: ${paymentIntent?.status || "unknown"}`);
    setSubmitting(false);
  };

  return <form onSubmit={submit} style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
    <ClientPill client={client} />
    <div style={{
      padding: "10px 12px", background: SURFACE.alt, borderRadius: 10,
      fontSize: 13, color: TOKENS.muted, lineHeight: 1.4,
    }}>
      <strong style={{ color: INK }}>Tip:</strong> tap the card-number field below. iOS shows "Scan Credit Card" above the keyboard — point your camera at the card to autofill.
    </div>

    <div style={{ background: SURFACE.elevated, border: `1px solid ${TOKENS.rule}`, borderRadius: 10, padding: "8px 8px 4px" }}>
      <PaymentElement options={{ layout: "tabs" }} />
    </div>

    {error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>{error}</div>}

    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={onBack} disabled={submitting} style={{
        ...primaryBtnStyle,
        flex: 1,
        background: "transparent",
        color: TOKENS.muted,
        border: `1px solid ${TOKENS.rule}`,
      }}>Back</button>
      <button type="submit" disabled={!stripe || submitting} style={{
        ...primaryBtnStyle,
        flex: 2,
        background: submitting ? TOKENS.rule : ACCENT,
        color: submitting ? TOKENS.muted : "#FFFFFF",
      }}>{submitting ? "Charging…" : `Pay ${fmtMoneyFull(amountCents / 100)}`}</button>
    </div>
  </form>;
}

// ── UI bits ─────────────────────────────────────────────────────
function Backdrop({ children, onClose }) {
  return <div style={{
    position: "fixed", inset: 0, zIndex: 100,
    display: "flex", flexDirection: "column",
    background: "rgba(0,0,0,0.55)",
  }}>
    <div onClick={onClose} style={{ flex: 1 }} />
    {children}
  </div>;
}

function Sheet({ children }) {
  return <div style={{
    background: SURFACE.elevated,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: "env(safe-area-inset-bottom)",
    maxHeight: "92vh", overflowY: "auto",
    animation: "slideUp 0.2s ease-out",
  }}>
    <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "12px auto 4px" }} />
    {children}
  </div>;
}

function Header({ title, onClose }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px 4px" }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>{title}</div>
    <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600, padding: 4 }}>Close</button>
  </div>;
}

function ClientPill({ client }) {
  const card = client.card_last4 ? `${(client.card_brand || "card")} ····${client.card_last4}` : null;
  return <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", background: SURFACE.alt, borderRadius: 10,
  }}>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>Charging</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 2 }}>{client.name}</div>
    </div>
    {card && <div style={{ fontSize: 12, color: TOKENS.muted, fontWeight: 600 }}>{card}</div>}
  </div>;
}

function Field({ label, children }) {
  return <div>
    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
    {children}
  </div>;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", minHeight: 48,
  fontSize: 16, color: INK,
  background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
  borderRadius: 10, outline: "none",
  fontFamily: "inherit",
};

const primaryBtnStyle = {
  width: "100%", padding: "14px", minHeight: 52,
  background: ACCENT, color: "#FFFFFF",
  border: "none", borderRadius: 10,
  fontSize: 16, fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const stripeAppearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#0C447C",
    colorText: "#1A1A1A",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSizeBase: "16px",
    spacingUnit: "4px",
    borderRadius: "8px",
  },
};
