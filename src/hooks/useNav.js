// useNav — typed navigation helpers around App.jsx's handleNav / deepLink pattern.
//
// Every helper is curried so it returns a bound handler, safe to drop directly
// into an onClick prop without an arrow-fn wrapper:
//
//   const nav = useNav(onNavigate);
//   <EntityLink onClick={nav.toClient(clientId)}>{clientName}</EntityLink>
//
// Path-style strings are parsed by handleNav in App.jsx: the path becomes the
// page and the query params populate `deepLink` state which destination pages
// read on mount.

const qs = (params) => {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v != null && v !== "");
  if (!entries.length) return "";
  return "?" + entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
};

export function useNav(onNavigate) {
  const go = (path) => () => { if (onNavigate) onNavigate(path); };

  return {
    toClient:           (clientId)        => go(`/sales${qs({ tab: "clients", clientId })}`),
    toSale:             (saleId)          => go(`/sales${qs({ tab: "pipeline", saleId })}`),
    toAdProject:        (projectId)       => go(`/adprojects${qs({ projectId })}`),
    toAdProjectForSale: (saleId)          => go(`/adprojects${qs({ saleId })}`),
    toIssueDesign:      (pubId, issueId)  => go(`/adprojects${qs({ pubId, issueId })}`),
    toIssue:            (issueId)         => go(`/schedule${qs({ issueId })}`),
    toFlatplan:         (pubId, issueId)  => go(`/flatplan${qs({ pubId, issueId })}`),
    toBilling:          (invoiceId)       => go(`/billing${qs({ invoiceId })}`),
    toBillingClient:    (clientId)        => go(`/billing${qs({ clientId })}`),
    toTeamMember:       (memberId)        => go(`/team-member${qs({ memberId })}`),
    toPublication:      (pubId)           => go(`/publications${qs({ pubId })}`),
    toContract:         (contractId)      => go(`/contracts${qs({ contractId })}`),
    toReport:           (tab, filters)    => go(`/analytics${qs({ tab, ...(filters || {}) })}`),
    // Escape hatch for paths the helpers don't cover yet.
    toPath:             (path)            => go(path),
  };
}
