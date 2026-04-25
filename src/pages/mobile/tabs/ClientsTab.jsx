// ClientsTab — Spec 056 §5.1 mobile clients list.
//
// Sections per spec: Recently Touched, then A-Z. Spec also calls for
// "Near You" via geo — skipped in MVP since clients lack lat/lng.
// Search bar at top with sub-100ms filter (in-memory).
import { useMemo, useState } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, CARD, fmtRelative } from "../mobileTokens";

export default function ClientsTab({ appData, currentUser, jurisdiction, navTo }) {
  const clients = appData.clients || [];
  const sales = appData.sales || [];
  const myId = currentUser?.id;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | renewal | lapsed

  // Compute "last touched" per client from comms[].
  const lastTouchedMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      const comms = Array.isArray(c.comms) ? c.comms : [];
      let last = null;
      for (const x of comms) {
        const d = x.date || x.createdAt;
        if (d && (!last || d > last)) last = d;
      }
      m.set(c.id, last);
    }
    return m;
  }, [clients]);

  const myClients = useMemo(() => {
    let list = clients.filter(c => !myId || c.repId === myId);
    if (filter === "active") list = list.filter(c => c.status === "Active");
    else if (filter === "renewal") list = list.filter(c => c.status === "Renewal");
    else if (filter === "lapsed") list = list.filter(c => c.status === "Lapsed");
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c => (c.name || "").toLowerCase().includes(q)
        || (c.contacts || []).some(ct => (ct.name || "").toLowerCase().includes(q) || (ct.email || "").toLowerCase().includes(q)));
    }
    return list;
  }, [clients, myId, search, filter]);

  // Sectioning: recently-touched (≤14d) first, then A–Z.
  const { recent, alphaSections } = useMemo(() => {
    const recentCutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const r = [];
    const rest = [];
    for (const c of myClients) {
      const lt = lastTouchedMap.get(c.id);
      if (lt && lt >= recentCutoff) r.push(c);
      else rest.push(c);
    }
    r.sort((a, b) => (lastTouchedMap.get(b.id) || "").localeCompare(lastTouchedMap.get(a.id) || ""));
    rest.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const sections = {};
    for (const c of rest) {
      const letter = (c.name || "?").charAt(0).toUpperCase();
      if (!sections[letter]) sections[letter] = [];
      sections[letter].push(c);
    }
    return { recent: r.slice(0, 8), alphaSections: sections };
  }, [myClients, lastTouchedMap]);

  return <>
    <MobileHeader title="Clients" sub={`${myClients.length} total`} />

    {/* Search bar */}
    <div style={{ position: "sticky", top: "calc(env(safe-area-inset-top) + 52px)", zIndex: 9, background: SURFACE.elevated, borderBottom: `1px solid ${TOKENS.rule}`, padding: "10px 12px" }}>
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search clients…"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "12px 14px", minHeight: 44,
          fontSize: 16, color: INK,
          background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
          borderRadius: 10, outline: "none",
        }}
      />
      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {[["all", "All"], ["active", "Active"], ["renewal", "Renewal"], ["lapsed", "Lapsed"]].map(([v, l]) => {
          const isActive = filter === v;
          return <button key={v} onClick={() => setFilter(v)} style={{
            padding: "6px 12px", borderRadius: 999,
            background: isActive ? ACCENT : "transparent",
            color: isActive ? "#FFFFFF" : TOKENS.muted,
            border: `1px solid ${isActive ? ACCENT : TOKENS.rule}`,
            fontSize: 13, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
            flexShrink: 0,
          }}>{l}</button>;
        })}
      </div>
    </div>

    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {recent.length > 0 && <Section title="Recently touched">
        {recent.map(c => <ClientRow key={c.id} client={c} lastTouched={lastTouchedMap.get(c.id)} onTap={() => navTo(`/mobile/clients/${c.id}`)} />)}
      </Section>}

      {Object.keys(alphaSections).sort().map(letter => <Section key={letter} title={letter}>
        {alphaSections[letter].map(c => <ClientRow key={c.id} client={c} lastTouched={lastTouchedMap.get(c.id)} onTap={() => navTo(`/mobile/clients/${c.id}`)} />)}
      </Section>)}

      {myClients.length === 0 && <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "32px 14px" }}>
        {search ? "No clients match." : "No clients assigned to you yet."}
      </div>}
    </div>
  </>;
}

function Section({ title, children }) {
  return <div>
    <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.6, textTransform: "uppercase", padding: "0 4px 6px" }}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
  </div>;
}

const STATUS_DOT = {
  Active: "#27500A",
  Renewal: "#854F0B",
  Lapsed: "#791F1F",
  Lead: "#0C447C",
  Inactive: "#5F5E5A",
};

function ClientRow({ client, lastTouched, onTap }) {
  return <div onClick={onTap} style={{
    ...CARD, padding: "12px 14px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 12, minHeight: 56,
  }}>
    <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_DOT[client.status] || TOKENS.muted, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</div>
      <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 1 }}>
        {client.status || "—"}{lastTouched ? ` · last touched ${fmtRelative(lastTouched)}` : ""}
      </div>
    </div>
    <span style={{ color: TOKENS.muted, fontSize: 18, fontWeight: 600 }}>›</span>
  </div>;
}
