// SupportAdminJournal — private daily journal for Nic.
//
// Four structured prompts (shipped, decisions, blocked, next) + free-
// form notes. Auto-save on blur with debounce; one row per day per
// user; RLS keeps the rows private (Hayley/admins do NOT have read
// access — see migration 170 RLS policies).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";
import { supabase, isOnline } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { usePageHeader } from "../../contexts/PageHeaderContext";

const todayISO = () => new Date().toISOString().slice(0, 10);

const PROMPTS = [
  { key: "shipped",   label: "What shipped today",  hint: "code, deploys, migrations, KB updates, integrations" },
  { key: "decisions", label: "Decisions made",      hint: "architectural, strategic, advisory" },
  { key: "blocked",   label: "What's blocked",      hint: "stuck waiting on input / decision / external dep" },
  { key: "next",      label: "What's next",         hint: "tomorrow's priority queue" },
];

export default function SupportAdminJournal({ isActive }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Journal" }], title: "Journal" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  const { teamMember } = useAuth();
  const userId = teamMember?.id;

  const [entryDate, setEntryDate] = useState(todayISO());
  const [entry, setEntry] = useState({ shipped: "", decisions: "", blocked: "", next: "", notes: "" });
  const [pastEntries, setPastEntries] = useState([]);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  // ── Load the day's entry + past index
  const loadEntry = useCallback(async (date) => {
    if (!isOnline() || !userId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("support_admin_journal")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", date)
      .maybeSingle();
    setEntry({
      shipped:   data?.shipped   || "",
      decisions: data?.decisions || "",
      blocked:   data?.blocked   || "",
      next:      data?.next      || "",
      notes:     data?.notes     || "",
    });
    setLoading(false);
  }, [userId]);

  const loadPastIndex = useCallback(async () => {
    if (!isOnline() || !userId) return;
    const { data } = await supabase
      .from("support_admin_journal")
      .select("entry_date")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(60);
    setPastEntries((data || []).map(r => r.entry_date));
  }, [userId]);

  useEffect(() => { loadEntry(entryDate); }, [loadEntry, entryDate]);
  useEffect(() => { loadPastIndex(); }, [loadPastIndex]);

  // ── Save (debounced auto-save + manual save)
  const save = useCallback(async () => {
    if (!isOnline() || !userId) return;
    setSaveStatus("saving");
    try {
      // Upsert by (user_id, entry_date) — UNIQUE constraint guarantees
      // one row per day per user.
      const { error } = await supabase.from("support_admin_journal").upsert({
        user_id: userId,
        entry_date: entryDate,
        ...entry,
      }, { onConflict: "user_id,entry_date" });
      if (error) throw error;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      // Refresh past index in case this is a new day
      loadPastIndex();
    } catch (err) {
      console.error("[journal] save failed:", err);
      setSaveStatus("error");
    }
  }, [userId, entryDate, entry, loadPastIndex]);

  const updateField = (key, value) => {
    setEntry(prev => ({ ...prev, [key]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(save, 1500);
  };

  if (!teamMember) {
    return (
      <div style={{ padding: 28, color: Z.tm }}>Sign in to use the journal.</div>
    );
  }

  const isToday = entryDate === todayISO();

  return (
    <div style={{ padding: 28, display: "flex", gap: 24, alignItems: "start", maxWidth: "100%" }}>
      {/* Sidebar — past entries index */}
      <aside style={{
        width: 200, flexShrink: 0,
        background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R, padding: 12,
        position: "sticky", top: 16,
        maxHeight: "calc(100vh - 80px)", overflowY: "auto",
      }}>
        <div style={{
          fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
          textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8,
        }}>Past entries</div>
        <button
          onClick={() => setEntryDate(todayISO())}
          style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "6px 8px", marginBottom: 4,
            background: isToday ? Z.ac + "18" : "transparent",
            border: "none", borderRadius: Ri,
            color: isToday ? Z.ac : Z.tx, fontSize: FS.sm,
            fontWeight: isToday ? FW.bold : FW.semi,
            fontFamily: COND, cursor: "pointer",
          }}
        >Today</button>
        {pastEntries.filter(d => d !== todayISO()).map(d => (
          <button
            key={d}
            onClick={() => setEntryDate(d)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "6px 8px", marginBottom: 2,
              background: d === entryDate ? Z.ac + "18" : "transparent",
              border: "none", borderRadius: Ri,
              color: d === entryDate ? Z.ac : Z.tm, fontSize: FS.sm,
              fontWeight: d === entryDate ? FW.bold : FW.semi,
              fontFamily: COND, cursor: "pointer",
            }}
          >{d}</button>
        ))}
        {pastEntries.length === 0 && (
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, padding: "4px 8px" }}>
            No past entries yet.
          </div>
        )}
      </aside>

      {/* Main editor */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{
            fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY,
            margin: 0,
          }}>{entryDate}{isToday ? " · today" : ""}</h1>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{
              opacity: saveStatus === "idle" ? 0 : 1,
              transition: "opacity 200ms",
              color: saveStatus === "error" ? Z.da : saveStatus === "saved" ? Z.go : Z.tm,
            }}>
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "Saved ✓"}
              {saveStatus === "error" && "Save failed"}
            </span>
            <button
              onClick={save}
              disabled={!isToday}
              style={{
                background: isToday ? Z.ac : Z.bd,
                color: isToday ? Z.bg : Z.tm,
                border: "none", padding: "6px 12px", borderRadius: Ri,
                fontSize: FS.xs, fontWeight: FW.bold, fontFamily: COND,
                cursor: isToday ? "pointer" : "default",
              }}
            >Save</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: Z.tm }}>Loading…</div>
        ) : (
          <>
            {PROMPTS.map(p => (
              <Prompt
                key={p.key}
                label={p.label}
                hint={p.hint}
                value={entry[p.key]}
                onChange={(v) => updateField(p.key, v)}
                disabled={!isToday}
              />
            ))}
            <Prompt
              label="Notes"
              hint="free-form — anything else worth keeping"
              value={entry.notes}
              onChange={(v) => updateField("notes", v)}
              disabled={!isToday}
              minRows={6}
            />
          </>
        )}

        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, padding: "8px 4px" }}>
          Private to you. Hayley and other admins do not have read access.
          One row per day; auto-saves as you type.
        </div>
      </main>
    </div>
  );
}

function Prompt({ label, hint, value, onChange, disabled, minRows = 3 }) {
  return (
    <div style={{
      background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R, padding: 14,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{
        fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
        textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
      }}>{label}</div>
      <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginBottom: 4 }}>{hint}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={minRows}
        placeholder={disabled ? "(read-only — past entry)" : ""}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "10px 12px",
          background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
          fontSize: FS.sm, color: Z.tx,
          fontFamily: "inherit", resize: "vertical",
          outline: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}
