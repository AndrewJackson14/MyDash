// ============================================================
// WebTrafficSignalCard — top-site 24h views + trend.
//
// Signals are pre-computed in useSignalFeed (webViews24h,
// webViewsPrev24h, webTrend, topSiteName). This card only renders —
// no new data work.
//
// Per Hayley's Apr 24 decision: show top site only (not summed
// across all sites).
// ============================================================
import { Btn } from "../ui";
import DashboardModule from "./DashboardModule";
import MetricWithBenchmark from "./MetricWithBenchmark";

export default function WebTrafficSignalCard({
  views24h,
  prev24h,
  trend = 0,
  topSiteName,
  userId,
  onOpenAnalytics,
}) {
  const hasData = views24h !== null && views24h !== undefined && !!topSiteName;
  const formatted = hasData ? Number(views24h).toLocaleString() : "—";
  const trendSign = trend > 0 ? "+" : "";
  const direction = trend > 0 ? "up" : trend < 0 ? "down" : "flat";

  return (
    <DashboardModule
      id="web-traffic-signal"
      userId={userId}
      title="Web Traffic · 24h"
      subtitle={topSiteName ? `Top site: ${topSiteName}` : "No traffic data yet"}
      empty={!hasData}
      emptyText="Waiting for traffic data."
      action={<Btn sm v="ghost" onClick={onOpenAnalytics}>Analytics</Btn>}
    >
      <MetricWithBenchmark
        label="24-hour views"
        value={formatted}
        onClick={onOpenAnalytics}
        benchmark={{
          value: `${trendSign}${trend}%`,
          label: "vs prior 24h",
          direction,
          good: true,
        }}
      />
    </DashboardModule>
  );
}
