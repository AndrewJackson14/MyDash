import { useState, useMemo } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Badge, GlassCard, GlassStat, PageHeader, TabRow, TB, DataTable, SB } from "../components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NTH_LABELS = ["1st", "2nd", "3rd", "4th", "Last"];

// Generate issues from a schedule pattern
function generateIssues(pub, pattern) {
  const { frequency, dayOfWeek, daysOfWeek, nthWeekdays, datesOfMonth, adCloseDays, edCloseDays, startDate, endDate } = pattern;
  const issues = [];
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  if (frequency === "Weekly") {
    let cursor = new Date(start);
    while (cursor.getDay() !== dayOfWeek) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= end) {
      issues.push(makeIssue(pub, cursor, adCloseDays, edCloseDays));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (frequency === "Bi-Weekly") {
    let cursor = new Date(start);
    while (cursor.getDay() !== dayOfWeek) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= end) {
      issues.push(makeIssue(pub, cursor, adCloseDays, edCloseDays));
      cursor.setDate(cursor.getDate() + 14);
    }
  } else if (frequency === "Bi-Monthly") {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      for (const dom of (datesOfMonth || [1, 15])) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
        if (d >= start && d <= end) {
          issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (frequency === "Monthly") {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const dom = (datesOfMonth && datesOfMonth[0]) || 1;
    while (cursor <= end) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
      if (d >= start && d <= end) {
        issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (frequency === "Quarterly") {
    let cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
    const dom = (datesOfMonth && datesOfMonth[0]) || 1;
    while (cursor <= end) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
      if (d >= start && d <= end) {
        issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
      }
      cursor.setMonth(cursor.getMonth() + 3);
    }
  } else if (frequency === "Semi-Annual") {
    let cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 6) * 6, 1);
    const dom = (datesOfMonth && datesOfMonth[0]) || 1;
    while (cursor <= end) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
      if (d >= start && d <= end) {
        issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
      }
      cursor.setMonth(cursor.getMonth() + 6);
    }
  } else if (frequency === "Annual") {
    let yr = start.getFullYear();
    const dom = (datesOfMonth && datesOfMonth[0]) || 1;
    const mo = (datesOfMonth && datesOfMonth[1] != null) ? datesOfMonth[1] : start.getMonth();
    while (yr <= end.getFullYear()) {
      const d = new Date(yr, mo, dom);
      if (d >= start && d <= end) {
        issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
      }
      yr++;
    }
  } else if (frequency === "Custom (Multi-Day Weekly)") {
    // Multiple days per week (e.g. Tuesday + Friday)
    const activeDays = daysOfWeek || [dayOfWeek];
    let cursor = new Date(start);
    while (cursor <= end) {
      if (activeDays.includes(cursor.getDay())) {
        issues.push(makeIssue(pub, cursor, adCloseDays, edCloseDays));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (frequency === "Custom (Nth Weekday)") {
    // Nth weekday of each month (e.g. 1st and 3rd Tuesday)
    const rules = nthWeekdays || [{ nth: 0, day: dayOfWeek }]; // nth: 0=1st, 1=2nd, 2=3rd, 3=4th, 4=last
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      for (const rule of rules) {
        const d = getNthWeekday(cursor.getFullYear(), cursor.getMonth(), rule.day, rule.nth);
        if (d && d >= start && d <= end) {
          issues.push(makeIssue(pub, d, adCloseDays, edCloseDays));
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return issues.sort((a, b) => a.date.localeCompare(b.date));
}

// Helper: get the Nth weekday of a month (nth: 0=1st, 1=2nd, 2=3rd, 3=4th, 4=last)
function getNthWeekday(year, month, dayOfWeek, nth) {
  if (nth === 4) {
    // Last occurrence: start from end of month
    const lastDay = new Date(year, month + 1, 0);
    while (lastDay.getDay() !== dayOfWeek) lastDay.setDate(lastDay.getDate() - 1);
    return lastDay;
  }
  const first = new Date(year, month, 1);
  while (first.getDay() !== dayOfWeek) first.setDate(first.getDate() + 1);
  first.setDate(first.getDate() + nth * 7);
  if (first.getMonth() !== month) return null;
  return first;
}

function makeIssue(pub, date, adCloseDays, edCloseDays) {
  const d = new Date(date);
  const mo = MONTHS[d.getMonth()];
  const yr = d.getFullYear();
  const day = d.getDate();
  const pubDate = d.toISOString().slice(0, 10);

  let label;
  if (pub.frequency === "Weekly" || pub.frequency === "Bi-Weekly" || pub.frequency.startsWith("Custom")) {
    label = `${mo} ${day}, ${yr}`;
  } else if (pub.frequency === "Bi-Monthly") {
    label = `${mo} ${day}, ${yr}`;
  } else if (pub.frequency === "Monthly") {
    label = `${mo} ${yr}`;
  } else if (pub.frequency === "Quarterly") {
    const q = Math.ceil((d.getMonth() + 1) / 3);
    label = `Q${q} ${yr}`;
  } else if (pub.frequency === "Semi-Annual") {
    const h = d.getMonth() < 6 ? "H1" : "H2";
    label = `${h} ${yr}`;
  } else if (pub.frequency === "Annual") {
    label = `${yr}`;
  } else {
    label = `${mo} ${day}, ${yr}`;
  }

  const adDead = new Date(d);
  adDead.setDate(adDead.getDate() - adCloseDays);
  const edDead = new Date(d);
  edDead.setDate(edDead.getDate() - edCloseDays);

  return {
    id: `${pub.id}-${pubDate}`,
    pubId: pub.id,
    label,
    date: pubDate,
    pageCount: pub.pageCount || 24,
    adDeadline: adDead.toISOString().slice(0, 10),
    edDeadline: edDead.toISOString().slice(0, 10),
    status: d < new Date() ? "Published" : "Scheduled",
    _editing: false,
  };
}

const EZSchedule = ({ pubs, issues, setIssues, insertIssuesBatch, onClose }) => {
  const isDk = Z.bg === "#08090D";

  // Wizard state
  const [step, setStep] = useState(0); // 0=select pub, 1=set pattern, 2=preview, 3=done
  const [pubIndex, setPubIndex] = useState(0);
  const [completedPubs, setCompletedPubs] = useState([]);

  // Current pub being configured
  const currentPub = pubs[pubIndex];

  // Pattern state
  const [frequency, setFrequency] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(4); // Thursday
  const [daysOfWeek, setDaysOfWeek] = useState([]); // Multi-day weekly
  const [nthWeekdays, setNthWeekdays] = useState([{ nth: 0, day: 2 }]); // Nth weekday rules
  const [datesOfMonth, setDatesOfMonth] = useState([1]);
  const [dateOfMonth2, setDateOfMonth2] = useState(15);
  const [annualMonth, setAnnualMonth] = useState(0); // Month for annual
  const [adCloseDays, setAdCloseDays] = useState(2);
  const [edCloseDays, setEdCloseDays] = useState(3);
  const [startDate, setStartDate] = useState(() => (new Date().getFullYear() - 1) + "-01-01");
  const [endDate, setEndDate] = useState(() => new Date().getFullYear() + "-12-31");

  // Preview state
  const [previewIssues, setPreviewIssues] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);

  // Pubs that already have issues
  const pubsWithIssues = useMemo(() => {
    const set = new Set();
    (issues || []).forEach(i => set.add(i.pubId));
    return set;
  }, [issues]);

  // Reset pattern for next pub
  const resetPattern = (pub) => {
    if (pub) {
      setFrequency(pub.frequency || "");
      setAdCloseDays(pub.type === "Magazine" ? 15 : 2);
      setEdCloseDays(pub.type === "Magazine" ? 21 : 3);
    }
    setPreviewIssues([]);
    setEditingIdx(null);
  };

  // Step 0 → 1: select pub and move to pattern
  const selectPub = (idx) => {
    setPubIndex(idx);
    resetPattern(pubs[idx]);
    setStep(1);
  };

  // Step 1 → 2: generate preview
  const generatePreview = () => {
    let dom = [datesOfMonth[0] || 1];
    if (frequency === "Bi-Monthly") dom = [datesOfMonth[0] || 1, dateOfMonth2];
    if (frequency === "Annual") dom = [datesOfMonth[0] || 1, annualMonth];
    const pattern = { frequency, dayOfWeek, daysOfWeek, nthWeekdays, datesOfMonth: dom, adCloseDays, edCloseDays, startDate, endDate };
    const generated = generateIssues({ ...currentPub, frequency }, pattern);
    setPreviewIssues(generated);
    setStep(2);
  };

  // Step 2: edit a date
  const updateIssueDate = (idx, field, value) => {
    setPreviewIssues(prev => prev.map((iss, i) => i === idx ? { ...iss, [field]: value } : iss));
  };

  // Step 2: delete an issue
  const deleteIssue = (idx) => {
    setPreviewIssues(prev => prev.filter((_, i) => i !== idx));
  };

  // Step 2 → 3: save issues
  const saveIssues = async () => {
    const newIssues = previewIssues.map(({ _editing, ...iss }) => iss);
    
    if (insertIssuesBatch) {
      // Persist to Supabase — deletes existing from startDate forward, then inserts
      await insertIssuesBatch(currentPub.id, newIssues, startDate);
    } else {
      // Fallback: local state only
      const existingOther = (issues || []).filter(i => i.pubId !== currentPub.id);
      const existingBeforeStart = (issues || []).filter(i => i.pubId === currentPub.id && i.date < startDate);
      setIssues([...existingOther, ...existingBeforeStart, ...newIssues]);
    }
    
    setCompletedPubs(prev => [...prev, currentPub.id]);

    // Find next pub to configure
    const nextIdx = pubs.findIndex((p, i) => i > pubIndex && !completedPubs.includes(p.id) && p.id !== currentPub.id);
    if (nextIdx >= 0) {
      setPubIndex(nextIdx);
      resetPattern(pubs[nextIdx]);
      setStep(1);
    } else {
      setStep(3); // all done
    }
  };

  // Skip this pub
  const skipPub = () => {
    const nextIdx = pubs.findIndex((p, i) => i > pubIndex && !completedPubs.includes(p.id) && p.id !== currentPub.id);
    if (nextIdx >= 0) {
      setPubIndex(nextIdx);
      resetPattern(pubs[nextIdx]);
      setStep(1);
    } else {
      setStep(3);
    }
  };

  const progress = completedPubs.length;
  const total = pubs.length;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="MyWizard">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, fontFamily: COND }}>{progress} of {total} publications</span>
        <div style={{ width: 120, height: 4, background: Z.bd, borderRadius: Ri }}>
          <div style={{ height: "100%", borderRadius: Ri, width: `${(progress / total) * 100}%`, background: Z.go, transition: "width 0.3s" }} />
        </div>
        <Btn sm v="ghost" onClick={onClose}>✕ Close</Btn>
      </div>
    </PageHeader>

    {/* ═══ STEP 0: SELECT PUBLICATION ═══ */}
    {step === 0 && <GlassCard>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 16 }}>Select a Publication to Schedule</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {pubs.map((p, i) => {
          const hasIssues = pubsWithIssues.has(p.id) || completedPubs.includes(p.id);
          return <div key={p.id} onClick={() => selectPub(i)} style={{
            background: isDk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
            border: `1px solid ${isDk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
            borderRadius: R, padding: 14, cursor: "pointer",
            transition: "background 0.1s",
          }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>{p.frequency} · {p.type}</div>
            {hasIssues && <Badge status="Scheduled" small />}
            {completedPubs.includes(p.id) && <span style={{ fontSize: FS.xs, color: Z.su, fontWeight: FW.bold, marginLeft: 4 }}>✓ Done</span>}
          </div>;
        })}
      </div>
    </GlassCard>}

    {/* ═══ STEP 1: SET SCHEDULE PATTERN ═══ */}
    {step === 1 && currentPub && <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{currentPub.name}</div>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>{currentPub.type} · {currentPub.circulation?.toLocaleString()} circ.</div>
        </div>
        <Btn sm v="ghost" onClick={skipPub}>Skip →</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: frequency + press day */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Sel label="Frequency" value={frequency} onChange={e => setFrequency(e.target.value)}
            options={["Weekly", "Bi-Weekly", "Bi-Monthly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Custom (Multi-Day Weekly)", "Custom (Nth Weekday)"].map(f => ({ value: f, label: f }))} />

          {(frequency === "Weekly" || frequency === "Bi-Weekly") &&
            <Sel label="Press Day" value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)}
              options={DAYS.map((d, i) => ({ value: i, label: d }))} />
          }

          {frequency === "Bi-Monthly" && <div style={{ display: "flex", gap: 8 }}>
            <Inp label="1st Issue Day" type="number" value={datesOfMonth[0] || 1} onChange={e => setDatesOfMonth([+e.target.value])} />
            <Inp label="2nd Issue Day" type="number" value={dateOfMonth2} onChange={e => setDateOfMonth2(+e.target.value)} />
          </div>}

          {(frequency === "Monthly" || frequency === "Quarterly" || frequency === "Semi-Annual") &&
            <Inp label="Day of Month" type="number" value={datesOfMonth[0] || 1} onChange={e => setDatesOfMonth([+e.target.value])} />
          }

          {frequency === "Annual" && <div style={{ display: "flex", gap: 8 }}>
            <Sel label="Month" value={annualMonth} onChange={e => setAnnualMonth(+e.target.value)} options={MONTHS.map((m, i) => ({ value: i, label: m }))} />
            <Inp label="Day" type="number" value={datesOfMonth[0] || 1} onChange={e => setDatesOfMonth([+e.target.value])} />
          </div>}

          {frequency === "Custom (Multi-Day Weekly)" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: COND }}>Press Days (select multiple)</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {DAYS.map((d, i) => <button key={d} onClick={() => setDaysOfWeek(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort())} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${daysOfWeek.includes(i) ? Z.go : Z.bd}`, background: daysOfWeek.includes(i) ? Z.go + "20" : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: daysOfWeek.includes(i) ? FW.bold : FW.medium, color: daysOfWeek.includes(i) ? Z.go : Z.tm, fontFamily: COND }}>{d.slice(0, 3)}</button>)}
            </div>
          </div>}

          {frequency === "Custom (Nth Weekday)" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: COND }}>Weekday Rules</label>
            {nthWeekdays.map((rule, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Sel value={rule.nth} onChange={e => setNthWeekdays(prev => prev.map((r, j) => j === i ? { ...r, nth: +e.target.value } : r))} options={NTH_LABELS.map((l, idx) => ({ value: idx, label: l }))} />
              <Sel value={rule.day} onChange={e => setNthWeekdays(prev => prev.map((r, j) => j === i ? { ...r, day: +e.target.value } : r))} options={DAYS.map((d, idx) => ({ value: idx, label: d }))} />
              {nthWeekdays.length > 1 && <button onClick={() => setNthWeekdays(prev => prev.filter((_, j) => j !== i))} style={{ background: Z.da, border: "none", borderRadius: Ri, padding: "4px 8px", cursor: "pointer", color: INV.light, fontSize: FS.xs, fontWeight: FW.bold }}>✕</button>}
            </div>)}
            <Btn sm v="ghost" onClick={() => setNthWeekdays(prev => [...prev, { nth: 0, day: 2 }])}>+ Add Rule</Btn>
          </div>}
        </div>

        {/* Right: deadlines + date range */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Inp label="Ad Close (days before press)" type="number" value={adCloseDays} onChange={e => setAdCloseDays(+e.target.value)} />
          <Inp label="Editorial Close (days before press)" type="number" value={edCloseDays} onChange={e => setEdCloseDays(+e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Inp label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Inp label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Btn v="secondary" onClick={() => setStep(0)}>← Back</Btn>
        <Btn onClick={generatePreview} disabled={!frequency}>Generate Preview</Btn>
      </div>
    </GlassCard>}

    {/* ═══ STEP 2: PREVIEW & ADJUST ═══ */}
    {step === 2 && (() => {
      const existingFromStart = (issues || []).filter(i => i.pubId === currentPub.id && i.date >= startDate);
      const willDelete = existingFromStart.length;
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <GlassCard style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{currentPub.name}</span>
            <span style={{ fontSize: FS.sm, color: Z.tm, marginLeft: 8 }}>{previewIssues.length} issues · {startDate} → {endDate}</span>
            {willDelete > 0 && <div style={{ fontSize: FS.sm, color: Z.wa, fontWeight: FW.bold, marginTop: 4 }}>⚠ {willDelete} existing issue{willDelete !== 1 ? "s" : ""} from {startDate} forward will be replaced</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm v="secondary" onClick={() => setStep(1)}>← Edit Pattern</Btn>
            <Btn sm onClick={() => { if (willDelete > 0 && !window.confirm(`This will replace ${willDelete} existing issue${willDelete !== 1 ? "s" : ""} from ${startDate} forward. Continue?`)) return; saveIssues(); }}>✓ Save {previewIssues.length} Issues</Btn>
          </div>
        </div>
      </GlassCard>

      <DataTable>
        <thead><tr>
          <th>#</th>
          <th>Label</th>
          <th>Publish Date</th>
          <th>Ad Close</th>
          <th>Ed Close</th>
          <th>Pages</th>
          <th>Status</th>
          <th></th>
        </tr></thead>
        <tbody>
          {previewIssues.map((iss, idx) => {
            const isEd = editingIdx === idx;
            return <tr key={iss.id} onClick={() => setEditingIdx(isEd ? null : idx)} style={{ cursor: "pointer" }}>
              <td style={{ fontSize: FS.sm, color: Z.td }}>{idx + 1}</td>
              <td style={{ fontWeight: FW.semi, color: Z.tx }}>{iss.label}</td>
              <td>{isEd
                ? <input type="date" value={iss.date} onChange={e => updateIssueDate(idx, "date", e.target.value)} onClick={e => e.stopPropagation()}
                    style={{ background: "transparent", border: "none", color: Z.tx, fontSize: FS.md, fontFamily: COND, outline: "none" }} />
                : <span style={{ color: Z.tx }}>{iss.date}</span>
              }</td>
              <td>{isEd
                ? <input type="date" value={iss.adDeadline} onChange={e => updateIssueDate(idx, "adDeadline", e.target.value)} onClick={e => e.stopPropagation()}
                    style={{ background: "transparent", border: "none", color: Z.da, fontSize: FS.md, fontFamily: COND, outline: "none" }} />
                : <span style={{ color: Z.da, fontWeight: FW.semi }}>{iss.adDeadline}</span>
              }</td>
              <td>{isEd
                ? <input type="date" value={iss.edDeadline} onChange={e => updateIssueDate(idx, "edDeadline", e.target.value)} onClick={e => e.stopPropagation()}
                    style={{ background: "transparent", border: "none", color: Z.pu || Z.wa, fontSize: FS.md, fontFamily: COND, outline: "none" }} />
                : <span style={{ color: Z.pu || Z.wa, fontWeight: FW.semi }}>{iss.edDeadline}</span>
              }</td>
              <td style={{ color: Z.tm }}>{iss.pageCount}</td>
              <td><Badge status={iss.status} small /></td>
              <td>
                {isEd && <Btn sm v="danger" onClick={e => { e.stopPropagation(); deleteIssue(idx); setEditingIdx(null); }}>✕</Btn>}
              </td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    </div>;
    })()}

    {/* ═══ STEP 3: ALL DONE ═══ */}
    {step === 3 && <GlassCard style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 8 }}>All Publications Scheduled</div>
      <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 16 }}>{completedPubs.length} publications configured with issue schedules</div>
      <Btn onClick={onClose}>Back to Publications</Btn>
    </GlassCard>}
  </div>;
};

export default EZSchedule;
