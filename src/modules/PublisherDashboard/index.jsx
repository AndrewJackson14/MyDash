// PublisherDashboard/index.jsx — shell, layout, data orchestration.
// Replaces DashboardV2 for Hayley's role per the build spec.
//
// Layout (per spec):
//   ALERT BANNER (conditional)
//   PRESS TIMELINE STRIP
//   ┌────────────────────────────┬──────────────┐
//   │ ISSUE CARDS GRID           │ ACTIVITY      │
//   │ (1.6fr)                    │ STREAM (1fr)  │
//   ├────────────────────────────┴──────────────┤
//   │ MONTH AT A GLANCE                          │
//   └────────────────────────────────────────────┘

import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, R } from "../../lib/theme";
import AlertBanner       from "./components/AlertBanner";
import PressTimelineStrip from "./components/PressTimelineStrip";
import IssueCardsGrid    from "./components/IssueCardsGrid";
import ActivityStream    from "./components/ActivityStream";
import MonthAtAGlance    from "./components/MonthAtAGlance";
import usePublisherDashboard from "./usePublisherDashboard";

export default function PublisherDashboard({ team, currentUser, onNavigate, hideGreeting }) {
  const [filterPressDay, setFilterPressDay] = useState(null);

  const dash = usePublisherDashboard({ team });

  const handleAlertClick = (a) => {
    if (a.alert_type === "awaiting_signoff" || a.alert_type === "deadline_critical") {
      const issueId = a.metadata?.issue_id;
      if (issueId) onNavigate?.(`/layout?id=${issueId}`);
    } else if (a.alert_type === "escalation") {
      // Escalations land on the publisher's direction-notes feed; routing
      // to messaging is the closest existing surface for now.
      onNavigate?.("messaging");
    }
  };

  const handleIssueClick = (i) => {
    if (i.issue_id) onNavigate?.(`/layout?id=${i.issue_id}`);
  };

  const greeting = (() => {
    const h = new Date().getHours();
    const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
    const name = currentUser?.name?.split(" ")[0] || "there";
    return `Good ${part}, ${name}`;
  })();

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 14,
      padding: 28,
    }}>
      {!hideGreeting && (
        <div style={{
          fontSize: 28, fontWeight: FW.black, color: Z.tx,
          fontFamily: DISPLAY, marginBottom: 4,
        }}>
          {greeting}
        </div>
      )}

      {/* Alert Banner — renders nothing when alerts is empty */}
      <AlertBanner alerts={dash.alerts} onClickAlert={handleAlertClick} />

      {/* Press Timeline Strip — anchor element, always visible */}
      <PressTimelineStrip
        issues={dash.issues}
        selectedDay={filterPressDay}
        onSelectDay={setFilterPressDay}
      />

      {/* Issue cards (left, 1.6fr) | Activity stream (right, 1fr).
          Collapses to single column under 900px. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
        gap: 14,
      }}
      // Inline media-query workaround: we'd want a CSS class for breakpoint.
      // For now the grid auto-fits issue cards inside the left column, which
      // is the primary responsiveness need. Stack-on-narrow is added once
      // we move to a CSS module / utility class.
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SectionHeader>Issues — Next 7 Days</SectionHeader>
          <IssueCardsGrid
            issues={dash.issues}
            filterPressDay={filterPressDay}
            onIssueClick={handleIssueClick}
          />
        </div>

        <ActivityStream
          events={dash.events}
          scope={dash.eventsScope}
          onScopeChange={dash.setEventsScope}
          resolveActor={dash.resolveActor}
          resolveClient={dash.resolveClient}
          resolvePublication={dash.resolvePublication}
          loading={dash.loading}
          hasMore={dash.eventsHasMore}
          onLoadMore={dash.loadMoreEvents}
        />
      </div>

      <MonthAtAGlance
        revenue={dash.glance?.revenue}
        revenueGoal={dash.glance?.revenue_goal}
        revenuePctOfGoal={dash.glance?.revenue_pct_of_goal}
        net={dash.glance?.net}
        netMarginPct={dash.glance?.net_margin_pct}
        arOver60={dash.glance?.ar_over_60}
        arOver60Accounts={dash.glance?.ar_over_60_accounts}
        subscribersActive={dash.glance?.subscribers_active}
        subscribersNetChange={dash.glance?.subscribers_net_change}
        onOpenFinancials={() => onNavigate?.("billing")}
      />
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
      textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
    }}>
      {children}
    </div>
  );
}
