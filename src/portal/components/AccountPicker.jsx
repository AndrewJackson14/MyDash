// AccountPicker — top-bar dropdown for switching active client when a
// user is a contact at multiple clients. If they only have one, this
// renders as a static label.
//
// Spec: client-portal-spec.md.md §5.11.
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal, ACTIVE_SLUG_KEY } from "../lib/portalContext";
import { C } from "../lib/portalUi";

export default function AccountPicker() {
  const { accessibleClients, activeClient } = usePortal();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!activeClient) return null;
  const isSolo = accessibleClients.length <= 1;

  if (isSolo) {
    return (
      <div style={{ ...labelStyle, cursor: "default" }}>
        {activeClient.clientName}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ ...labelStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
      >
        {activeClient.clientName}
        <span style={{ fontSize: 10, color: C.muted }}>▾</span>
      </button>
      {open && (
        <div style={menuStyle}>
          {accessibleClients.map((c) => (
            <button
              key={c.clientId}
              onClick={() => {
                try { localStorage.setItem(ACTIVE_SLUG_KEY, c.clientSlug); } catch {}
                setOpen(false);
                nav(`/c/${c.clientSlug}/home`);
              }}
              style={{
                ...rowStyle,
                fontWeight: c.clientId === activeClient.clientId ? 700 : 500,
                color: c.clientId === activeClient.clientId ? C.ac : C.ink,
              }}
            >
              <span style={{ flex: 1, textAlign: "left" }}>{c.clientName}</span>
              {c.clientId === activeClient.clientId && (
                <span style={{ fontSize: 11, color: C.ac }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: 13, fontWeight: 600, color: C.ink,
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  fontFamily: "inherit",
};

const menuStyle = {
  position: "absolute", top: "calc(100% + 4px)", left: 0,
  minWidth: 220, maxHeight: 320, overflowY: "auto",
  background: "#fff",
  border: `1px solid ${C.rule}`,
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: 4,
  zIndex: 20,
};

const rowStyle = {
  display: "flex", alignItems: "center", gap: 8,
  width: "100%", padding: "8px 12px",
  fontSize: 13,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
};
