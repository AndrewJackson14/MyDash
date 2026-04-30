// TokenAdminMenu — small dropdown for managing public share tokens
// (campaign reports, tearsheet portfolios, client upload links).
//
// Each row exposing a public token has two NULL-default columns:
//   <token>_expires_at  — gate after this timestamp
//   <token>_revoked_at  — kill switch
//
// Migration 166 wired the SQL gate; this is the operator surface so
// staff can stamp an expiry or kill a leaked link without rotating
// the UUID and breaking honest bookmarks.
//
// Caller passes the table + token column name. We update the row
// directly via supabase.from(table).update(...) and call back so the
// parent can refresh local state.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Z, FS, FW, COND, Ri } from "../lib/theme";
import { FloatingPanel } from "./ui";

const fmtWhen = (ts) => {
  if (!ts) return null;
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ts; }
};

export function TokenAdminMenu({
  table,
  idColumn = "id",
  idValue,
  tokenColumn,
  expiresAt,
  revokedAt,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  // Optimistic overlay so the pill reflects the change immediately
  // even if the parent doesn't pipe the update back through props.
  const [overlay, setOverlay] = useState({});
  const wrapRef = useRef(null);

  const expiresCol = `${tokenColumn}_expires_at`;
  const revokedCol = `${tokenColumn}_revoked_at`;
  const effectiveExpiresAt = expiresCol in overlay ? overlay[expiresCol] : expiresAt;
  const effectiveRevokedAt = revokedCol in overlay ? overlay[revokedCol] : revokedAt;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setPickingDate(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const update = async (patch) => {
    if (!idValue) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(table).update(patch).eq(idColumn, idValue);
      if (error) throw error;
      setOverlay(o => ({ ...o, ...patch }));
      onChange?.(patch);
      setOpen(false);
      setPickingDate(false);
    } catch (e) {
      console.error("[TokenAdminMenu] update failed", e);
      alert(`Update failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const setExpiry = async (dateStr) => {
    if (!dateStr) return;
    const iso = new Date(dateStr + "T23:59:59").toISOString();
    await update({ [expiresCol]: iso });
  };

  const clearExpiry = () => update({ [expiresCol]: null });
  const revoke = () => {
    if (!confirm("Revoke this link? Anyone with the URL will get an 'invalid or expired' message immediately.")) return;
    return update({ [revokedCol]: new Date().toISOString() });
  };
  const restore = () => update({ [revokedCol]: null, [expiresCol]: null });

  const isRevoked = !!effectiveRevokedAt;
  const isExpired = !isRevoked && effectiveExpiresAt && new Date(effectiveExpiresAt) <= new Date();
  const status = isRevoked ? "revoked" : isExpired ? "expired" : effectiveExpiresAt ? "scheduled" : "active";
  const statusColor = isRevoked ? Z.da : isExpired ? Z.wa : effectiveExpiresAt ? Z.ac : Z.go;
  const statusLabel = isRevoked
    ? `Revoked ${fmtWhen(effectiveRevokedAt) || ""}`.trim()
    : isExpired
      ? `Expired ${fmtWhen(effectiveExpiresAt) || ""}`.trim()
      : effectiveExpiresAt
        ? `Active until ${fmtWhen(effectiveExpiresAt)}`
        : "Active";

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={statusLabel}
        style={{
          background: "transparent",
          border: `1px solid ${Z.bd}`,
          borderRadius: Ri,
          padding: "0 8px",
          height: 26,
          cursor: "pointer",
          color: statusColor,
          fontSize: FS.xs,
          fontFamily: COND,
          fontWeight: FW.semi,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
        {status === "active" ? "Active" : status === "scheduled" ? "Scheduled" : status === "expired" ? "Expired" : "Revoked"}
      </button>

      {open && (
        <FloatingPanel style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          right: 0,
          minWidth: 240,
          padding: 10,
          zIndex: 50,
          fontFamily: COND,
        }}>
          <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 8, lineHeight: 1.35 }}>
            <span style={{ color: statusColor, fontWeight: FW.bold }}>● </span>{statusLabel}
          </div>

          {pickingDate ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: FS.xs, color: Z.tm }}>Expires after this date:</label>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setExpiry(e.target.value)}
                disabled={busy}
                style={{
                  padding: "4px 6px",
                  fontSize: FS.sm,
                  border: `1px solid ${Z.bd}`,
                  borderRadius: Ri,
                  background: Z.sf,
                  color: Z.tx,
                  fontFamily: COND,
                }}
              />
              <button
                onClick={() => setPickingDate(false)}
                disabled={busy}
                style={menuBtnStyle(Z, "ghost")}
              >Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {!isRevoked && (
                <button onClick={() => setPickingDate(true)} disabled={busy} style={menuBtnStyle(Z)}>
                  {effectiveExpiresAt ? "Change expiry…" : "Set expiry…"}
                </button>
              )}
              {!isRevoked && effectiveExpiresAt && (
                <button onClick={clearExpiry} disabled={busy} style={menuBtnStyle(Z)}>
                  Clear expiry
                </button>
              )}
              {!isRevoked && (
                <button onClick={revoke} disabled={busy} style={menuBtnStyle(Z, "danger")}>
                  Revoke link
                </button>
              )}
              {isRevoked && (
                <button onClick={restore} disabled={busy} style={menuBtnStyle(Z, "primary")}>
                  Restore link
                </button>
              )}
            </div>
          )}
        </FloatingPanel>
      )}
    </span>
  );
}

function menuBtnStyle(Z, kind = "default") {
  const base = {
    textAlign: "left",
    padding: "6px 8px",
    fontSize: FS.sm,
    border: "1px solid transparent",
    borderRadius: Ri,
    background: "transparent",
    color: Z.tx,
    cursor: "pointer",
    fontFamily: COND,
  };
  if (kind === "danger") return { ...base, color: Z.da, border: `1px solid ${Z.da}30` };
  if (kind === "primary") return { ...base, color: Z.ac, border: `1px solid ${Z.ac}30` };
  if (kind === "ghost") return { ...base, color: Z.tm };
  return base;
}
