// Overview tab — per-pub subscriber stats, renewals due, circulation-
// by-publication breakdown, and the printer mailing workflow steps.
// No functional change from the pre-split Circulation.jsx.
import { useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";
import { Btn, GlassCard, GlassStat } from "../../components/ui";
import { fmtDate } from "../../lib/formatters";
import { pnFor, todayIso } from "./constants";

export default function CirculationOverview({
  pubs,
  subscribers,
  dropLocationPubs,
  mailingLists,
  onOpenExport,
}) {
  const pn = pnFor(pubs);
  const today = todayIso();
  const subs = subscribers || [];
  const locPubs = dropLocationPubs || [];

  const activeDigital = subs.filter(s => s.type === "digital" && s.status === "active");
  const expiringNext30 = subs.filter(s =>
    s.status === "active" && s.renewalDate &&
    s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) &&
    s.renewalDate >= today
  );

  // Per-pub subscriber counts — O(pubs × subs). Memoize so typing in a
  // modal doesn't re-scan the full subscriber list on every keystroke.
  const pubSubCounts = useMemo(() => {
    const printByPub = new Map();
    const digitalByPub = new Map();
    for (const s of subs) {
      if (s.status !== "active") continue;
      const m = s.type === "print" ? printByPub : s.type === "digital" ? digitalByPub : null;
      if (m) m.set(s.publicationId, (m.get(s.publicationId) || 0) + 1);
    }
    const dropsByPub = new Map();
    for (const lp of locPubs) {
      dropsByPub.set(lp.publicationId, (dropsByPub.get(lp.publicationId) || 0) + (lp.quantity || 0));
    }
    return pubs.map(p => ({
      pub: p,
      print: printByPub.get(p.id) || 0,
      digital: digitalByPub.get(p.id) || 0,
      drops: dropsByPub.get(p.id) || 0,
    }));
  }, [pubs, subs, locPubs]);

  const activePubs = pubs.filter(p => subs.some(s => s.publicationId === p.id && s.status === "active"));
  const renewalsByPub = activePubs.map(p => ({
    pub: p,
    count: subs.filter(s => s.publicationId === p.id && s.status === "active" && s.renewalDate &&
      s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) &&
      s.renewalDate >= today).length,
  }));
  const totalRenewals = renewalsByPub.reduce((s, r) => s + r.count, 0);
  const lastExport = (mailingLists || []).slice().sort((a, b) => (b.exportedAt || "").localeCompare(a.exportedAt || ""))[0];

  return <>
    {/* Per-publication subscriber stats */}
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(activePubs.length + (activeDigital.length > 0 ? 1 : 0), 5)}, 1fr)`, gap: 12 }}>
      {activePubs.map(p => {
        const ct = subs.filter(s => s.publicationId === p.id && s.type === "print" && s.status === "active").length;
        return <GlassStat key={p.id} label={pn(p.id)} value={ct.toLocaleString()} sub="Print subscribers" color={Z.tm} />;
      })}
      {activeDigital.length > 0 && <GlassStat label="Digital (All)" value={activeDigital.length.toLocaleString()} sub="Newsletter subscribers" />}
    </div>

    {/* Renewals due */}
    {totalRenewals > 0
      ? <GlassCard style={{ borderLeft: `3px solid ${Z.wa}` }}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 10 }}>Renewals Due — Next 30 Days</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(renewalsByPub.length, 5)}, 1fr)`, gap: 10 }}>
            {renewalsByPub.map(r => <div key={r.pub.id} style={{ textAlign: "center", padding: 10, background: Z.bg, borderRadius: R }}>
              <div style={{ fontSize: 22, fontWeight: FW.black, color: r.count > 0 ? Z.wa : Z.su, fontFamily: DISPLAY }}>{r.count}</div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx }}>{pn(r.pub.id)}</div>
            </div>)}
          </div>
        </GlassCard>
      : <GlassCard><div style={{ padding: 10, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.bold }}>No renewals due in the next 30 days</div></GlassCard>
    }

    {/* Per-publication breakdown */}
    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Circulation by Publication</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pubSubCounts.filter(p => p.print + p.digital + p.drops > 0).map(p => {
          const total = p.print + p.drops;
          return <div key={p.pub.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr 90px 90px 90px 90px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
            <div style={{ width: 10, height: 10, borderRadius: Ri, background: Z.tm }} />
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{pn(p.pub.id)}</div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.print}</div><div style={{ fontSize: FS.micro, color: Z.td }}>PRINT</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.digital}</div><div style={{ fontSize: FS.micro, color: Z.td }}>DIGITAL</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.drops}</div><div style={{ fontSize: FS.micro, color: Z.td }}>DROPS</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>{total.toLocaleString()}</div><div style={{ fontSize: FS.micro, color: Z.td }}>TOTAL PRINT</div></div>
          </div>;
        })}
      </div>
    </GlassCard>

    {/* Renewals list */}
    {expiringNext30.length > 0 && <GlassCard>
      <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 8 }}>Subscribers Expiring Soon</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {expiringNext30.slice(0, 8).map(s => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", background: Z.bg, borderRadius: R, fontSize: FS.base }}>
          <span style={{ fontWeight: FW.semi, color: Z.tx }}>{s.firstName} {s.lastName}</span>
          <span style={{ color: Z.tm }}>{pn(s.publicationId)}</span>
          <span style={{ color: Z.wa, fontWeight: FW.bold }}>Renews {fmtDate(s.renewalDate)}</span>
        </div>)}
      </div>
    </GlassCard>}

    {/* Printer Mailing Workflow (Sec 5.4) */}
    <GlassCard>
      <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 12 }}>Printer Mailing Workflow</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { step: 1, label: "Filter subscribers", desc: "Select publication and status, choose columns", action: "Open Export", onClick: onOpenExport },
          { step: 2, label: "Download list", desc: "Export as CSV or Excel for printer", action: "Export", onClick: onOpenExport },
          { step: 3, label: "Email to printer", desc: "Attach list and send to print partner", action: "Coming Soon", onClick: null },
        ].map(s => (
          <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: Z.ac + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.sm, fontWeight: FW.black, color: Z.ac, flexShrink: 0 }}>{s.step}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.label}</div>
              <div style={{ fontSize: FS.xs, color: Z.td }}>{s.desc}</div>
            </div>
            <Btn sm v="secondary" onClick={s.onClick} disabled={!s.onClick}>{s.action}</Btn>
          </div>
        ))}
      </div>
      {lastExport && <div style={{ marginTop: 10, fontSize: FS.xs, color: Z.td }}>Last export: {fmtDate(lastExport.exportedAt)} — {lastExport.subscriberCount || "?"} subscribers</div>}
    </GlassCard>
  </>;
}
