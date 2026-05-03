import React, { useState } from "react";
import { Z, COND, FS } from "../../lib/theme";
import { Btn, TA } from "../ui";
import { supabase } from "../../lib/supabase";

// ══════════════════════════════════════════════════════════════════
// LAYOUT HANDOFF PANEL — Anthony Phase 2 (G13)
// Camille's "Send to Anthony" affordance. Flips story to Ready +
// print_status to ready (if not already), then posts a team_notes
// ping with notes so Anthony's dashboard surfaces it as an Issue Ping.
// ══════════════════════════════════════════════════════════════════
function LayoutHandoffPanel({ story, meta, saveMeta, team, currentUser, dialog }) {
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);

  // Find the active layout designer to ping. Production Manager falls
  // back if no Layout Designer is wired up. team comes in app-shape
  // so we filter by .role/.isActive (camelCase).
  const layoutDesigner = (team || []).find(t => t.role === "Layout Designer" && t.isActive !== false)
    || (team || []).find(t => t.role === "Production Manager" && t.isActive !== false);

  if (!layoutDesigner) {
    return (
      <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Layout Handoff</div>
        <div style={{ fontSize: FS.xs, color: Z.td, fontStyle: "italic" }}>No Layout Designer assigned</div>
      </div>
    );
  }

  const send = async () => {
    if (sending) return;
    if (!meta.print_issue_id) {
      await dialog.alert("Set a Print Issue above first — Anthony needs to know which issue this is for.");
      return;
    }
    setSending(true);
    try {
      // 1. Flip status to Ready + print_status to ready if not yet
      if (meta.status !== "Ready" && meta.status !== "Approved") {
        await saveMeta("status", "Ready");
      }
      if (!meta.print_status || meta.print_status === "none") {
        await saveMeta("print_status", "ready");
      }

      // 2. Post a team_notes ping. context_type='story' so the
      // dashboard's Issue Pings tile (filtered to context_type=issue)
      // doesn't fire — but DirectionCard (no context filter) does.
      // The ping body includes the story title so Anthony has context.
      const message = notes.trim()
        ? `Layout: "${story.title || 'Untitled'}" ready — ${notes.trim()}`
        : `Layout: "${story.title || 'Untitled'}" is ready for you.`;
      await supabase.from("team_notes").insert({
        from_user: currentUser?.id || null,
        to_user: layoutDesigner.id,
        message,
        context_type: "story",
        context_id: story.id,
      });

      setLastSentAt(new Date().toISOString());
      setNotes("");
    } catch (err) {
      console.error("Send to Anthony failed:", err);
      await dialog.alert("Couldn't send: " + (err?.message || "unknown error"));
    }
    setSending(false);
  };

  const designerFirst = (layoutDesigner.name || "Layout Designer").split(" ")[0];

  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Layout Handoff</div>
        {lastSentAt && <span style={{ fontSize: FS.micro, color: Z.go, fontFamily: COND }}>{"✓"} sent</span>}
      </div>
      <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 6 }}>
        Send to <span style={{ color: Z.tx, fontWeight: 600 }}>{layoutDesigner.name}</span>
      </div>
      <TA
        label={`Notes for ${designerFirst} (optional)`}
        value={notes}
        onChange={v => setNotes(v)}
        rows={3}
      />
      <Btn
        sm
        onClick={send}
        disabled={sending}
        style={{ width: "100%", marginTop: 6 }}
      >
        {sending ? "Sending…" : `Send to ${designerFirst}`}
      </Btn>
    </div>
  );
}

export default React.memo(LayoutHandoffPanel);
