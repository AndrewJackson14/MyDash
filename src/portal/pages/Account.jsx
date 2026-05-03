// /c/<slug>/account — three-tab account page.
// Spec: client-portal-spec.md.md §5.9
//
// Tabs:
//   - business      → read-only display + "contact your sales rep" stub
//   - team          → list contacts, invite via invite_client_contact RPC,
//                     revoke via revoke_client_contact RPC
//   - notifications → checkbox grid persisted via update_notification_preferences RPC
//
// Tab is held in URL state as ?tab=<key> so the picker is bookmarkable
// and "back" works the way users expect.
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import BusinessTab      from "./account/BusinessTab";
import TeamTab          from "./account/TeamTab";
import NotificationsTab from "./account/NotificationsTab";

const TABS = [
  { key: "business",      label: "Business details" },
  { key: "team",          label: "Team" },
  { key: "notifications", label: "Notifications" },
];

export default function Account() {
  const { slug } = useParams();
  const { activeClient } = usePortal();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "business";

  const setTab = (k) => {
    const next = new URLSearchParams(params);
    if (k === "business") next.delete("tab"); else next.set("tab", k);
    setParams(next, { replace: true });
  };

  if (!activeClient) return null;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Account</h1>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{activeClient.clientName}</div>

      <div style={tabsRowStyle} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            style={tabBtnStyle(tab === t.key)}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "business"      && <BusinessTab clientId={activeClient.clientId} />}
        {tab === "team"          && <TeamTab     clientId={activeClient.clientId} />}
        {tab === "notifications" && <NotificationsTab clientId={activeClient.clientId} />}
      </div>
    </div>
  );
}

const tabsRowStyle = {
  display: "flex", gap: 0,
  borderBottom: `1px solid ${C.rule}`,
  overflowX: "auto",
};

const tabBtnStyle = (active) => ({
  padding: "10px 16px",
  fontSize: 13, fontWeight: 600,
  color: active ? C.ink : C.muted,
  background: "transparent",
  border: "none",
  borderBottom: `2px solid ${active ? C.ac : "transparent"}`,
  cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap",
});
