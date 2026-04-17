// ============================================================
// PageHeaderContext — pages publish their header (breadcrumb,
// title, actions), TopBar subscribes. When no page has published,
// the context value is null and TopBar renders nothing — so
// legacy pages that still render their own inline header keep
// working without a double-header.
// ============================================================
import { createContext, useContext, useState, useCallback, useMemo } from "react";

const Ctx = createContext(null);

export function PageHeaderProvider({ children }) {
  const [header, setHeaderState] = useState(null);
  const setHeader = useCallback((next) => { setHeaderState(next); }, []);
  const clearHeader = useCallback(() => { setHeaderState(null); }, []);
  const value = useMemo(() => ({ header, setHeader, clearHeader }), [header, setHeader, clearHeader]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageHeader() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePageHeader must be used inside <PageHeaderProvider>");
  return ctx;
}
