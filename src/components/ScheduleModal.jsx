// ============================================================
// ScheduleModal — datetime picker + recurrence rule editor for
// newsletter / eBlast drafts.
//
// Hand it onSchedule({ scheduled_at: ISO string, recurrence }):
//   recurrence is one of:
//     null
//     { type: 'daily',   hour, minute, timezone }
//     { type: 'weekly',  days: [iso 1-7], hour, minute, timezone }
//     { type: 'monthly', day: 1-28, hour, minute, timezone }
// ============================================================
import { useState, useMemo } from "react";
import { Z, COND, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Inp, Sel, Modal } from "./ui";

const TZ = "America/Los_Angeles";

// "now + 1h" rounded to nearest 5 min, formatted for <input type=datetime-local>
function defaultLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  d.setSeconds(0); d.setMilliseconds(0);
  // Build local-string from the user's browser locale; the form input
  // is always interpreted in the user's local TZ, so we just use what
  // toISOString slice gives after offsetting.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const WEEKDAYS = [
  { iso: 1, label: "M" },
  { iso: 2, label: "T" },
  { iso: 3, label: "W" },
  { iso: 4, label: "T" },
  { iso: 5, label: "F" },
  { iso: 6, label: "S" },
  { iso: 7, label: "S" },
];

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export default function ScheduleModal({ open, onClose, onSchedule, currentScheduledAt = null, currentRecurrence = null, draftLabel = "this campaign" }) {
  const [whenLocal, setWhenLocal] = useState(currentScheduledAt
    ? new Date(currentScheduledAt).toISOString().slice(0, 16)
    : defaultLocal());
  const [recurType, setRecurType] = useState(currentRecurrence?.type || "once");
  const [weeklyDays, setWeeklyDays] = useState(
    currentRecurrence?.type === "weekly" && Array.isArray(currentRecurrence.days)
      ? currentRecurrence.days
      : [new Date().getDay() === 0 ? 7 : new Date().getDay()]
  );
  const [monthlyDay, setMonthlyDay] = useState(
    currentRecurrence?.type === "monthly" && currentRecurrence.day ? currentRecurrence.day : 1
  );
  const [hour, setHour] = useState(currentRecurrence?.hour ?? 8);
  const [minute, setMinute] = useState(currentRecurrence?.minute ?? 0);
  const [submitting, setSubmitting] = useState(false);

  const recurrenceObj = useMemo(() => {
    if (recurType === "once") return null;
    const base = { hour, minute, timezone: TZ };
    if (recurType === "daily") return { type: "daily", ...base };
    if (recurType === "weekly") return { type: "weekly", days: weeklyDays.length ? weeklyDays.sort() : [1], ...base };
    if (recurType === "monthly") return { type: "monthly", day: monthlyDay, ...base };
    return null;
  }, [recurType, weeklyDays, monthlyDay, hour, minute]);

  // Preview: show the next 3 firing times (local) for the chosen rule.
  const previewTimes = useMemo(() => {
    if (recurType === "once") {
      return whenLocal ? [new Date(whenLocal)] : [];
    }
    // For recurring: project from now in local time.
    const out = [];
    let cursor = new Date();
    for (let i = 0; i < 3; i++) {
      cursor = nextRecurring(recurrenceObj, cursor);
      if (!cursor) break;
      out.push(cursor);
      cursor = new Date(cursor.getTime() + 60_000);
    }
    return out;
  }, [recurType, whenLocal, recurrenceObj]);

  const submit = async () => {
    setSubmitting(true);
    try {
      let scheduledAtIso;
      if (recurType === "once") {
        if (!whenLocal) { setSubmitting(false); return; }
        scheduledAtIso = new Date(whenLocal).toISOString();
      } else {
        const next = previewTimes[0];
        if (!next) { setSubmitting(false); return; }
        scheduledAtIso = next.toISOString();
      }
      await onSchedule({ scheduled_at: scheduledAtIso, recurrence: recurrenceObj });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleWeekday = (iso) => {
    setWeeklyDays(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso]);
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={`Schedule ${draftLabel}`}
      width={520}
      onSubmit={submit}
      actions={<>
        <Btn sm v="secondary" onClick={onClose} disabled={submitting}>Cancel</Btn>
        <Btn sm onClick={submit} disabled={submitting || (recurType !== "once" && previewTimes.length === 0)}>
          {submitting ? "Scheduling…" : "Schedule"}
        </Btn>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 4 }}>Recurrence</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { v: "once",    label: "One time" },
              { v: "daily",   label: "Daily" },
              { v: "weekly",  label: "Weekly" },
              { v: "monthly", label: "Monthly" },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => setRecurType(o.v)} style={{
                padding: "6px 14px", borderRadius: Ri,
                border: `1px solid ${recurType === o.v ? Z.ac : Z.bd}`,
                background: recurType === o.v ? Z.ac : Z.sf,
                color: recurType === o.v ? "#fff" : Z.tm,
                fontSize: FS.sm, fontWeight: recurType === o.v ? FW.heavy : FW.semi,
                fontFamily: COND, cursor: "pointer",
              }}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* One-time picker */}
        {recurType === "once" && (
          <div>
            <label style={{ display: "block", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 4 }}>Send at (your local time)</label>
            <input
              type="datetime-local"
              value={whenLocal}
              onChange={e => setWhenLocal(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, color: Z.tx, fontSize: FS.base, fontFamily: "inherit", outline: "none" }}
            />
          </div>
        )}

        {/* Weekly day picker */}
        {recurType === "weekly" && (
          <div>
            <label style={{ display: "block", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 6 }}>Days of week</label>
            <div style={{ display: "flex", gap: 4 }}>
              {WEEKDAYS.map(d => {
                const on = weeklyDays.includes(d.iso);
                return (
                  <button key={d.iso} type="button" onClick={() => toggleWeekday(d.iso)} style={{
                    width: 38, height: 38, borderRadius: "50%",
                    border: `1px solid ${on ? Z.ac : Z.bd}`,
                    background: on ? Z.ac : Z.sf,
                    color: on ? "#fff" : Z.tm,
                    fontSize: FS.sm, fontWeight: FW.heavy,
                    fontFamily: COND, cursor: "pointer",
                  }}>{d.label}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly day picker */}
        {recurType === "monthly" && (
          <div>
            <label style={{ display: "block", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 4 }}>Day of month</label>
            <Sel value={String(monthlyDay)} onChange={e => setMonthlyDay(parseInt(e.target.value, 10))}
              options={MONTH_DAYS.map(d => ({ value: String(d), label: `Day ${d}${d === 28 ? " (last safe day every month)" : ""}` }))} />
          </div>
        )}

        {/* Hour/minute for recurring */}
        {recurType !== "once" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Sel
              label="Hour (Pacific)"
              value={String(hour)}
              onChange={e => setHour(parseInt(e.target.value, 10))}
              options={Array.from({ length: 24 }, (_, h) => ({
                value: String(h),
                label: `${(h % 12) || 12}:00 ${h < 12 ? "am" : "pm"}`,
              }))}
            />
            <Sel
              label="Minute"
              value={String(minute)}
              onChange={e => setMinute(parseInt(e.target.value, 10))}
              options={[0, 15, 30, 45].map(m => ({ value: String(m), label: String(m).padStart(2, "0") }))}
            />
          </div>
        )}

        {/* Next sends preview */}
        {previewTimes.length > 0 && (
          <div style={{ padding: "10px 14px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 6 }}>
              {recurType === "once" ? "Will fire at" : "Next 3 sends"}
            </div>
            {previewTimes.map((t, i) => (
              <div key={i} style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>
                {t.toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                  year: "numeric", hour: "numeric", minute: "2-digit",
                  timeZone: TZ, timeZoneName: "short",
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Mirror of the edge function's computeNextRunAt — used here only
// for the "next 3 sends" preview. Intentionally kept simple; PT
// rounding matches the cron tick (within 2 minutes).
function nextRecurring(rule, fromUtc) {
  if (!rule) return null;
  const tz = rule.timezone || TZ;
  const hour = Number.isInteger(rule.hour) ? rule.hour : 8;
  const minute = Number.isInteger(rule.minute) ? rule.minute : 0;

  const localNow = new Date(fromUtc.toLocaleString("en-US", { timeZone: tz }));

  const toUtcWithTz = (y, m, d) => {
    const trial = new Date(Date.UTC(y, m, d, hour, minute, 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(trial).map(p => [p.type, p.value]));
    const actualLocal = new Date(
      `${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}T` +
      `${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}:${String(parts.second).padStart(2,"0")}Z`
    );
    return new Date(trial.getTime() - (actualLocal.getTime() - trial.getTime()));
  };

  if (rule.type === "daily") {
    let cand = toUtcWithTz(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
    if (cand <= fromUtc) cand = toUtcWithTz(localNow.getFullYear(), localNow.getMonth(), localNow.getDate() + 1);
    return cand;
  }
  if (rule.type === "weekly") {
    const days = rule.days?.length ? rule.days : [1];
    for (let off = 0; off < 14; off++) {
      const probe = new Date(localNow.getTime() + off * 86400000);
      const iso = probe.getDay() === 0 ? 7 : probe.getDay();
      if (!days.includes(iso)) continue;
      const cand = toUtcWithTz(probe.getFullYear(), probe.getMonth(), probe.getDate());
      if (cand > fromUtc) return cand;
    }
    return null;
  }
  if (rule.type === "monthly") {
    const day = Math.min(Math.max(1, rule.day || 1), 28);
    for (let off = 0; off < 2; off++) {
      const probe = new Date(localNow.getFullYear(), localNow.getMonth() + off, day);
      const cand = toUtcWithTz(probe.getFullYear(), probe.getMonth(), probe.getDate());
      if (cand > fromUtc) return cand;
    }
    return null;
  }
  return null;
}
