// ClientDetail — Spec 056 §5.2 client drill-in.
//
// MVP shape: hero card with name + status, action row (call / email
// / log / nav), brief intel summary (computed inline since we don't
// have generate-client-intel deployed), interactions timeline (from
// client.comms[]), recent contracts, open opportunities.
import { useMemo } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtRelative, fmtMoneyFull } from "../mobileTokens";

export default function ClientDetail({ clientId, appData, currentUser, jurisdiction, navTo }) {
  const clients = appData.clients || [];
  const sales = appData.sales || [];
  const contracts = appData.contracts || [];
  const client = clients.find(c => c.id === clientId);

  if (!client) {
    return <>
      <MobileHeader title="Client not found" onBack={() => navTo("/mobile/clients")} />
      <div style={{ padding: 24, textAlign: "center", color: TOKENS.muted }}>This client may have been removed or you don't have access.</div>
    </>;
  }

  const primaryContact = (client.contacts || [])[0];
  const callHref = primaryContact?.phone ? `tel:${primaryContact.phone.replace(/[^0-9+]/g, "")}` : null;
  const emailHref = primaryContact?.email ? `mailto:${primaryContact.email}` : null;
  const navHref = client.billingAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent([client.billingAddress, client.billingCity, client.billingState, client.billingZip].filter(Boolean).join(", "))}`
    : null;

  const myOpps = sales.filter(s => s.clientId === clientId && s.status !== "Closed" && s.status !== "Lost");
  const closedSales = sales.filter(s => s.clientId === clientId && s.status === "Closed");
  const totalSpend = closedSales.reduce((sum, s) => sum + (s.amount || 0), 0);
  const lastSale = closedSales.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const myContracts = contracts.filter(c => c.clientId === clientId);

  const comms = (Array.isArray(client.comms) ? client.comms : [])
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 8);

  // Auto-intel one-liner (subset of what generate-client-intel will
  // produce in v2 — but useful even without LLM):
  const intel = useMemo(() => {
    const parts = [];
    if (closedSales.length > 0) parts.push(`${closedSales.length} closed deal${closedSales.length === 1 ? "" : "s"} · ${fmtMoneyFull(totalSpend)} lifetime`);
    if (lastSale?.date) parts.push(`Last ad ${fmtRelative(lastSale.date)}`);
    if (myOpps.length > 0) parts.push(`${myOpps.length} open opportunity${myOpps.length === 1 ? "" : "s"}`);
    if (client.status === "Renewal") parts.push("Renewal status — push hard");
    if (client.status === "Lapsed") parts.push("Lapsed — re-engage");
    return parts.join(" · ");
  }, [closedSales, totalSpend, lastSale, myOpps, client.status]);

  return <>
    <MobileHeader title={client.name} sub={client.status || ""} onBack={() => navTo("/mobile/clients")} />

    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Action row — primary outbound actions, in thumb reach */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <ActionButton href={callHref} label="Call" icon="📞" disabled={!callHref} />
        <ActionButton href={emailHref} label="Email" icon="✉️" disabled={!emailHref} />
        <ActionButton onClick={() => alert("Capture stub — full modal coming next iteration")} label="Log" icon="📝" />
        <ActionButton href={navHref} target="_blank" label="Nav" icon="🧭" disabled={!navHref} />
      </div>

      {/* Intel one-liner */}
      {intel && <div style={{ ...CARD, padding: "12px 14px", background: SURFACE.soft }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Intel</div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: INK }}>{intel}</div>
      </div>}

      {/* Open opportunities */}
      {myOpps.length > 0 && <Section title={`Open opportunities (${myOpps.length})`}>
        {myOpps.map(s => <div key={s.id} style={{ ...CARD, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{s.status}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtMoneyFull(s.amount || 0)}</div>
          </div>
          <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>
            {s.nextAction?.label || "No next action"}
            {s.nextActionDate && ` · ${s.nextActionDate.slice(5)}`}
          </div>
        </div>)}
      </Section>}

      {/* Comms timeline */}
      {comms.length > 0 && <Section title="Recent activity">
        {comms.map(c => <div key={c.id} style={{ ...CARD, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 0.4 }}>{c.type || "Note"}</span>
            <span style={{ fontSize: 11, color: TOKENS.muted }}>{fmtRelative(c.date)}</span>
          </div>
          <div style={{ fontSize: 14, color: INK, lineHeight: 1.4 }}>{c.note || c.text || "(no detail)"}</div>
        </div>)}
      </Section>}

      {/* Contracts */}
      {myContracts.length > 0 && <Section title={`Contracts (${myContracts.length})`}>
        {myContracts.slice(0, 5).map(c => <div key={c.id} style={{ ...CARD, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name || "Contract"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{fmtMoneyFull(c.totalValue || 0)}</div>
          </div>
          <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>
            {(c.startDate || "?")} → {(c.endDate || "?")} · {c.status}
          </div>
        </div>)}
      </Section>}

    </div>
  </>;
}

function ActionButton({ href, target, onClick, label, icon, disabled }) {
  const baseStyle = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 4, padding: "10px 4px", minHeight: 64,
    background: disabled ? SURFACE.alt : SURFACE.elevated,
    color: disabled ? TOKENS.muted : INK,
    border: `1px solid ${TOKENS.rule}`, borderRadius: 10,
    fontSize: 12, fontWeight: 600,
    textDecoration: "none", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
  if (disabled || !href) {
    return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={baseStyle}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>;
  }
  return <a href={href} target={target} style={baseStyle}>
    <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
    <span>{label}</span>
  </a>;
}

function Section({ title, children }) {
  return <div>
    <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", padding: "0 4px 6px" }}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
  </div>;
}
