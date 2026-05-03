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
  clients, sales, currentUser,
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

  return {
    clientMap, myClientIds,
    activeSales, todaysActions, closedSales, renewalsDue,
    clientsByIdLocal, salesByStatusLocal,
    srDeferred, closedSearchDeferred, propSearchDeferred,
  };
}
