import { useMemo, useDeferredValue } from "react";

// Derived data hub for SalesCRM. Pulls every memoized list/map the
// shell + tabs need: lookup maps, filtered active sales (with deferred
// search input for snappy typing), today's actions, closed sales,
// renewals due, and per-status indexes.
//
// Wave 2 — extracted from SalesCRM.jsx. Keeps the orchestrator focused
// on event handlers + JSX, not derivation. The deferred values for
// search inputs return alongside the memos so the parent can pass
// them into tab components without re-deriving.
export function useSalesCRM({
  clients, sales, proposals, currentUser,
  sr, closedSearch, propSearch,
  fPub, myPipeline,
  today,
}) {
  // Wave 2 — debounce filter inputs via useDeferredValue. Keystrokes
  // still commit instantly to the input value, but downstream filters
  // read the deferred copy so React can skip stale filter passes when
  // newer keystrokes are pending.
  const srDeferred = useDeferredValue(sr);
  const closedSearchDeferred = useDeferredValue(closedSearch);
  const propSearchDeferred = useDeferredValue(propSearch);

  const clientMap = useMemo(() => {
    const m = {};
    (clients || []).forEach(c => { m[c.id] = c.name; });
    return m;
  }, [clients]);

  const myClientIds = useMemo(
    () => new Set((clients || []).filter(c => c.repId === currentUser?.id).map(c => c.id)),
    [clients, currentUser?.id]
  );

  const activeSales = useMemo(() => {
    const srLower = srDeferred ? srDeferred.toLowerCase() : null;
    return sales.filter(s => {
      if (myPipeline && currentUser?.id && !myClientIds.has(s.clientId)) return false;
      if (fPub !== "all" && s.publication !== fPub) return false;
      if (srLower && !(clientMap[s.clientId] || "—").toLowerCase().includes(srLower)) return false;
      return true;
    });
  }, [sales, myPipeline, currentUser?.id, myClientIds, fPub, srDeferred, clientMap]);

  // Local lookup indexes — derived from the jurisdiction-filtered
  // clients/sales prop arrays rather than the global useAppData maps so
  // cn()/pn() return the same "—" for out-of-jurisdiction refs that the
  // legacy `find` did.
  const clientsByIdLocal = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const salesByStatusLocal = useMemo(() => {
    const m = new Map();
    for (const s of sales) {
      let arr = m.get(s.status);
      if (!arr) { arr = []; m.set(s.status, arr); }
      arr.push(s);
    }
    return m;
  }, [sales]);

  const todaysActions = useMemo(
    () => activeSales.filter(s => s.nextAction && (s.nextActionDate <= today || !s.nextActionDate) && s.status !== "Closed" && s.status !== "Follow-up")
      .sort((a, b) => (a.nextActionDate || "9").localeCompare(b.nextActionDate || "9")),
    [activeSales, today]
  );

  const closedSales = useMemo(
    () => sales.filter(s => s.status === "Closed").sort((a, b) => b.date.localeCompare(a.date)),
    [sales]
  );

  // Renewals: clients whose status is 'Renewal' (contract expiring
  // within 45 days or ad-hoc buyer) plus top Lapsed clients sorted by
  // total spend for re-engagement.
  const renewalsDue = useMemo(() => {
    const salesByClient = {};
    sales.filter(s => s.status === "Closed").forEach(s => {
      if (!salesByClient[s.clientId]) salesByClient[s.clientId] = { totalSpend: 0, saleCount: 0, pubs: new Set(), lastDate: s.date, lastSale: s };
      const c = salesByClient[s.clientId];
      c.totalSpend += s.amount;
      c.saleCount++;
      if (s.publication) c.pubs.add(s.publication);
      if (s.date > c.lastDate) { c.lastDate = s.date; c.lastSale = s; }
    });

    const renewalClients = (clients || []).filter(c => c.status === "Renewal" || c.status === "Lapsed");

    return renewalClients
      .map(c => {
        const agg = salesByClient[c.id] || { totalSpend: 0, saleCount: 0, pubs: new Set(), lastDate: "", lastSale: {} };
        return {
          clientId: c.id,
          clientStatus: c.status,
          contractEndDate: c.contractEndDate,
          totalSpend: agg.totalSpend,
          saleCount: agg.saleCount,
          pubCount: agg.pubs.size,
          lastDate: agg.lastDate || c.lastAdDate || "",
          amount: agg.totalSpend,
          publication: agg.lastSale?.publication,
          id: c.id,
        };
      })
      .filter(c => c.totalSpend > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [sales, clients]);

  // Wave 3 Task 3.1 — derived activity feed. Replaces the legacy mock
  // useState seed ("Conejo Hardwoods" / "UCLA Health") that surfaced
  // even on a fresh DB. Pulls real events from three sources:
  //   - sales.updatedAt within the last 30 days → status transition
  //   - clients[].comms in the last 30 days → comm log
  //   - proposals.{sentAt|signedAt|convertedAt|closedAt} → proposal events
  // Newest first, capped at 50 entries (matches the previous local-state
  // cap). Logging a call now surfaces in the rail as soon as the addComm
  // round-trip completes (clients state mutates → memo recomputes).
  const activityLog = useMemo(() => {
    const events = [];
    const cutoffMs = Date.now() - 30 * 86400000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const cutoffDate = cutoffIso.slice(0, 10);

    // Sales status transitions
    for (const s of sales || []) {
      if (s.updatedAt && s.updatedAt >= cutoffIso && s.status) {
        events.push({
          id: `sl-${s.id}-${s.updatedAt}`,
          text: s.status === "Lost" && s.lostReason ? `Lost: ${s.lostReason}` : `→ ${s.status}`,
          time: s.updatedAt,
          type: s.status === "Lost" ? "outcome" : "pipeline",
          clientId: s.clientId,
          clientName: clientMap[s.clientId] || "—",
        });
      }
    }

    // Comms (calls / emails / comments / surveys)
    for (const c of clients || []) {
      for (const comm of c.comms || []) {
        if (!comm.date || comm.date < cutoffDate) continue;
        const note = (comm.note || "").trim();
        events.push({
          id: `cm-${comm.id}`,
          text: `${comm.type}${note ? `: ${note.slice(0, 60)}${note.length > 60 ? "…" : ""}` : ""}`,
          time: `${comm.date}T${comm.time || "12:00"}`,
          type: "comm",
          clientId: c.id,
          clientName: c.name,
        });
      }
    }

    // Proposal lifecycle — sent / signed / converted / closed.
    // Each gets its own entry so the rep sees the full arc, not just
    // the latest status.
    for (const p of proposals || []) {
      const stamps = [
        ["sent", p.sentAt],
        ["signed", p.signedAt],
        ["converted", p.convertedAt],
        ["closed", p.closedAt],
      ];
      for (const [verb, stamp] of stamps) {
        if (!stamp || stamp < cutoffIso) continue;
        const dollars = p.total ? `$${Number(p.total).toLocaleString()}` : "";
        events.push({
          id: `pr-${p.id}-${verb}`,
          text: `Proposal ${verb}${dollars ? ` — ${dollars}` : ""}`,
          time: stamp,
          type: "proposal",
          clientId: p.clientId,
          clientName: clientMap[p.clientId] || "—",
        });
      }
    }

    return events
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 50);
  }, [sales, clients, proposals, clientMap]);

  return {
    clientMap, myClientIds,
    activeSales, todaysActions, closedSales, renewalsDue, activityLog,
    clientsByIdLocal, salesByStatusLocal,
    srDeferred, closedSearchDeferred, propSearchDeferred,
  };
}
