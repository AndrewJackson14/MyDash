// Pure helpers used across the SalesCRM tabs. None of them touch state
// — pass data in as args. Wave 2 extracted these from the inline
// definitions inside the SalesCRM monolith so tab components don't need
// the closed-over `clients`/`pubs`/`team` references they used to.

// Client name lookup. Pass a Map (clientsById from useAppData) for O(1)
// resolution; falls back to a linear find on a plain array if a caller
// hasn't migrated yet.
export const cn = (clientId, clients) => {
  if (clients instanceof Map) return clients.get(clientId)?.name || "—";
  return (clients || []).find(c => c.id === clientId)?.name || "—";
};

export const pn = (pubId, pubs) => {
  if (pubs instanceof Map) return pubs.get(pubId)?.name || "—";
  return (pubs || []).find(p => p.id === pubId)?.name || "—";
};

// Team-member display name. team rows have either {firstName, lastName}
// or a flat {name}; we accept either.
export const tn = (teamId, team) => {
  const t = (team || []).find(t => t.id === teamId);
  if (!t) return "Unassigned";
  const composed = `${t.firstName || ""} ${t.lastName || ""}`.trim();
  return composed || t.name || "Unassigned";
};

// Has the rep already drafted a proposal for this sale's client? Used
// to gate the "Create Proposal" CTA on a sale card so we don't open a
// duplicate.
export const hasProposal = (saleId, proposals, sales) => {
  const sale = (sales || []).find(s => s.id === saleId);
  if (!sale) return false;
  return (proposals || []).some(p => p.clientId === sale.clientId && p.status !== "Cancelled");
};

export const getClientProposal = (clientId, proposals) =>
  (proposals || []).find(p => p.clientId === clientId && (p.status === "Sent" || p.status === "Draft"));

// Time helpers. Recompute on each call (don't cache at module load) so a
// long-open session that crosses midnight doesn't end up with a stale
// "tomorrow." Used as default values for nextActionDate fields.
export const today = () => new Date().toISOString().slice(0, 10);
export const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// Action label resolver. nextAction may be {type, label} (post-Wave-1
// shape) or a bare string (legacy seed data). Returns a display string.
export const actLabel = (sale) => {
  const a = sale?.nextAction;
  if (!a) return "";
  if (typeof a === "string") return a;
  return a.label || "";
};
