// PressTimelineStrip.jsx — full-width 7-day strip. Today leftmost.
// Click cell → filter IssueCardsGrid below to that day.

import { useMemo } from "react";
import PressTimelineCell from "./PressTimelineCell";
import { PRESS_TIMELINE_DAYS } from "../constants";

const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayKey = (d) => d.toISOString().slice(0, 10);

export default function PressTimelineStrip({
  issues = [],
  selectedDay = null,
  onSelectDay,
}) {
  const days = useMemo(() => {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < PRESS_TIMELINE_DAYS; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const key = dayKey(d);
      // Match against any issue with press_date on this day.
      const dayIssues = issues.filter(iss => (iss.press_date || "").slice(0, 10) === key);
      const abbrevs = dayIssues.map(iss => iss.publication_abbrev).filter(Boolean);
      const fullNames = dayIssues.map(iss => iss.publication_name).filter(Boolean);
      out.push({
        key,
        date: d,
        dayAbbrev: DAY_ABBREV[d.getDay()],
        shortDate: fmtShort(d),
        abbrevs,
        fullNames,
        firstDeadline: dayIssues[0]?.ad_deadline || dayIssues[0]?.press_date || null,
      });
    }
    return out;
  }, [issues]);

  return (
    <div style={{ display: "flex", gap: 8, width: "100%" }}>
      {days.map(d => (
        <PressTimelineCell
          key={d.key}
          dayAbbrev={d.dayAbbrev}
          date={d.shortDate}
          publications={d.abbrevs}
          fullPublications={d.fullNames}
          pressDeadlineISO={d.firstDeadline}
          selected={selectedDay === d.key}
          onClick={onSelectDay
            ? () => onSelectDay(selectedDay === d.key ? null : d.key)
            : undefined}
        />
      ))}
    </div>
  );
}
