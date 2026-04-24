// ============================================================
// FuzzyPicker — typeahead replacement for <Sel> when the option list
// is long enough that scanning a 200-row dropdown is painful (clients,
// authors, etc.).
//
// Drop-in shape that matches Sel's:
//   <FuzzyPicker
//     label?      // optional column label
//     value       // current value (string)
//     onChange    // (newValue) => void  (matches the (e) => e.target.value
//                  shape used by callers — see Sel adapter at bottom of file)
//     options     // [{ value, label, sub? }] — sub is an optional
//                  greyed-out caption shown after the label in dropdown rows
//     placeholder // shown when no value selected and input empty
//     allowClear  // default true — show × to clear the value
//     emptyLabel  // label shown for value="" (default "—")
//     menuMaxRows // default 8
//
// Match strategy: case-insensitive substring on label, prefix on first
// word ranks higher. Anchors highlighted in the dropdown.
// ============================================================
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Z, FS, COND, INPUT, LABEL } from "../lib/theme";

const labelStyle = { fontSize: LABEL.fontSize, fontWeight: LABEL.fontWeight, color: Z.td, letterSpacing: LABEL.letterSpacing, textTransform: LABEL.textTransform, fontFamily: COND };
const inputSurface = { background: "rgba(128,128,128,0.10)", border: "1px solid rgba(128,128,128,0.20)", borderRadius: INPUT.radius, color: Z.tx, fontSize: INPUT.fontSize, outline: "none", fontFamily: COND };

function rankMatch(label, q) {
  if (!q) return 0;
  const L = (label || "").toLowerCase();
  const idx = L.indexOf(q);
  if (idx < 0) return -1;
  // Word-boundary boost: matches at start of any word rank ahead of
  // mid-word substrings. A first-character match wins outright.
  const wordIdx = L.split(/\s+/).findIndex(w => w.startsWith(q));
  if (idx === 0) return 0;
  if (wordIdx >= 0) return 1 + wordIdx;
  return 100 + idx;
}

export default function FuzzyPicker({
  label,
  value,
  onChange,
  options,
  placeholder = "Search…",
  allowClear = true,
  emptyLabel = "—",
  menuMaxRows = 8,
  disabled = false,
  style,
  size = "md",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const selected = useMemo(() => (options || []).find(o => String(o.value) === String(value)) || null, [options, value]);

  // When value updates from outside (or the menu closes), reset input.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open, value]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options || [];
    return (options || [])
      .map(o => ({ o, r: rankMatch(o.label, q) }))
      .filter(x => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 200)
      .map(x => x.o);
  }, [options, query]);

  const visible = filtered.slice(0, Math.max(menuMaxRows * 3, 24));

  const select = useCallback((nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }, [onChange]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHoverIdx(i => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (open && visible[hoverIdx]) {
        e.preventDefault();
        select(visible[hoverIdx].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const onInput = (e) => {
    setQuery(e.target.value);
    setHoverIdx(0);
    if (!open) setOpen(true);
  };

  const padding = size === "sm" ? "5px 28px 5px 10px" : "9px 32px 9px 14px";
  // While the menu is open we show the query (or empty); when closed
  // we show the selected label so the field reads like Sel did.
  const displayValue = open ? query : (selected?.label || "");

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={onInput}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          autoComplete="off"
          style={{
            ...inputSurface, padding, width: "100%", cursor: disabled ? "not-allowed" : "text", boxSizing: "border-box",
            opacity: disabled ? 0.6 : 1,
            ...style,
          }}
        />
        {/* Right-side glyph: × to clear when a value is set + open; ▼ otherwise. */}
        {allowClear && selected && !open ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange?.(""); }}
            title="Clear"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: Z.tm, fontSize: 14, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
          >×</button>
        ) : (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: Z.tm, fontSize: FS.micro }}>▼</div>
        )}

        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: 6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            maxHeight: menuMaxRows * 36, overflowY: "auto", zIndex: 1000,
          }}>
            {/* "Clear" affordance at the top when a value is set */}
            {allowClear && selected && (
              <div
                onMouseDown={(e) => { e.preventDefault(); select(""); }}
                style={{ padding: "6px 12px", fontSize: 11, color: Z.tm, cursor: "pointer", borderBottom: `1px solid ${Z.bd}`, fontFamily: COND }}
                onMouseEnter={() => setHoverIdx(-1)}
              >× {emptyLabel} (clear)</div>
            )}
            {visible.length === 0 && (
              <div style={{ padding: 12, color: Z.td, fontSize: 12, textAlign: "center" }}>No matches</div>
            )}
            {visible.map((o, i) => {
              const active = i === hoverIdx;
              return (
                <div
                  key={String(o.value) + ":" + i}
                  onMouseDown={(e) => { e.preventDefault(); select(o.value); }}
                  onMouseEnter={() => setHoverIdx(i)}
                  style={{
                    padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    background: active ? "rgba(128,128,128,0.12)" : "transparent",
                    borderLeft: String(o.value) === String(value) ? `3px solid ${Z.ac}` : "3px solid transparent",
                    fontFamily: COND,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: Z.tx, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                  {o.sub && <span style={{ fontSize: 11, color: Z.tm, flexShrink: 0 }}>{o.sub}</span>}
                </div>
              );
            })}
            {filtered.length > visible.length && (
              <div style={{ padding: "6px 12px", fontSize: 10, color: Z.td, fontFamily: COND, textAlign: "center" }}>
                Showing {visible.length} of {filtered.length} — keep typing to narrow
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
