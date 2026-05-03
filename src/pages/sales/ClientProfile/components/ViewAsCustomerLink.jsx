import { useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../../../lib/theme";
import { supabase } from "../../../../lib/supabase";

const PORTAL_BASE = "https://portal.13stars.media";

// Phase F portal — "View as customer" button. Opens
// portal.13stars.media in staff-support mode for the active client.
// Slug fetched on click if useAppData's `clients` shape doesn't already
// carry it, so the network call is deferred until the rep actually
// wants to use it.
export default function ViewAsCustomerLink({ clientId, clientSlug }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    let slug = clientSlug;
    if (!slug && clientId) {
      setBusy(true);
      const { data } = await supabase.from("clients").select("slug").eq("id", clientId).maybeSingle();
      slug = data?.slug;
      setBusy(false);
    }
    if (!slug) return;
    window.open(`${PORTAL_BASE}/c/${slug}/?staff_view=1`, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      style={{
        marginTop: 8, padding: "6px 10px",
        background: "transparent", color: Z.tm,
        border: `1px dashed ${Z.bd}`, borderRadius: Ri,
        fontSize: FS.xs, fontWeight: FW.heavy,
        fontFamily: COND, letterSpacing: 0.4, textTransform: "uppercase",
        cursor: busy ? "wait" : "pointer",
        textAlign: "center",
      }}
      title="Open this client's portal view (read-only)"
    >
      {busy ? "Opening…" : "View as customer · portal (read-only) ↗"}
    </button>
  );
}
