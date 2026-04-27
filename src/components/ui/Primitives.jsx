// ============================================================
// Shared UI Primitives — Press Room
//
// Refreshed in Phase 4 batch 1 of the UI refresh.
// Tokens flow through: PRESS (color), TYPE (typography), RAD
// (radius), SPACE (spacing), ELEV (elevation). Legacy Z/FS/Ri
// stay imported for back-compat with sub-primitives that haven't
// been touched yet — they collapse out in subsequent batches.
// ============================================================
import { Component, useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  Z, SC, COND, DISPLAY, R, Ri, SP, TBL, CARD, FS, FW,
  INPUT, BTN, MODAL, LABEL, TOGGLE, AVATAR, ZI, INV, RADII,
  EASE, DUR, FONT, SIGNAL, NEUTRAL, isDark as _isDark,
  // Press Room tokens
  PRESS, TYPE, RAD, SPACE, ELEV,
} from "../../lib/theme";
import Ic from "./Icons";

// ── Press Room shared style fragments ──────────────────────
const pressBody = {
  fontFamily: TYPE.family.body,
  fontSize:   TYPE.size.body,
  color:      "var(--ink)",
};

const pressLabel = {
  fontFamily:    TYPE.family.body,
  fontSize:      11,
  fontWeight:    TYPE.weight.bodyBold,
  color:         "var(--muted)",
  letterSpacing: TYPE.ls.headers,
  textTransform: "uppercase",
};

const pressMeta = {
  fontFamily:    TYPE.family.mono,
  fontSize:      TYPE.size.meta,
  fontWeight:    TYPE.weight.mono,
  letterSpacing: TYPE.ls.meta,
  textTransform: "uppercase",
  color:         "var(--muted)",
};

// Shared input surface — translucent fill, 1px hairline, no glow.
const inputSurface = {
  background:   "rgba(128, 128, 128, 0.06)",
  border:       "1px solid var(--rule)",
  borderRadius: RAD[2],
  color:        "var(--ink)",
  fontSize:     TYPE.size.body,
  fontFamily:   TYPE.family.body,
  outline:      "none",
  boxShadow:    ELEV.input,
  transition:   `border-color ${DUR.fast}ms ${EASE}, background ${DUR.fast}ms ${EASE}`,
};

export const ThemeToggle = ({ onToggle }) => {
  const dk = _isDark();
  return <button
    onClick={onToggle}
    title={dk ? "Light mode" : "Dark mode"}
    style={{
      background:    "transparent",
      color:         "var(--ink)",
      border:        "1px solid var(--rule)",
      borderRadius:  RAD[2],
      padding:       "5px 12px",
      cursor:        "pointer",
      fontSize:      TYPE.size.caption,
      fontWeight:    TYPE.weight.bodyBold,
      fontFamily:    TYPE.family.body,
      display:       "flex",
      alignItems:    "center",
      gap:           6,
    }}
  >{dk ? "☀" : "🌙"}<span>{dk ? "Light" : "Dark"}</span></button>;
};

export const BackBtn = ({ onClick }) => <button
  onClick={onClick}
  style={{
    background: "none", border: "none", cursor: "pointer",
    color: "var(--ink)",
    fontSize: TYPE.size.body,
    fontWeight: TYPE.weight.bodyBold,
    fontFamily: TYPE.family.body,
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 0", marginBottom: 4,
  }}
><span style={{ fontSize: TYPE.size.h4 }}>&larr;</span> Back</button>;

export const FilterBar = ({ options, active, onChange, colorMap }) => (
  <div style={{ display: "flex", gap: 24 }}>
    {options.map(o => {
      const val = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      const isActive = Array.isArray(active) ? active.includes(val) : active === val;
      return (
        <button
          key={val}
          onClick={() => onChange(val)}
          style={{
            padding: "0 0 6px",
            borderRadius: 0,
            border: "none",
            borderBottom: isActive ? `2px solid var(--action)` : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: TYPE.size.body,
            fontWeight: isActive ? TYPE.weight.bodyBold : TYPE.weight.bodyMid,
            color: isActive ? "var(--action)" : "var(--muted)",
            fontFamily: TYPE.family.body,
            whiteSpace: "nowrap",
            letterSpacing: TYPE.ls.headers,
          }}
        >{label}</button>
      );
    })}
  </div>
);

export const SortHeader = ({ columns, sortCol, sortDir, onSort }) => (
  <tr style={{ borderBottom: `1px solid var(--rule)` }}>
    {columns.map(h => (
      <th
        key={h}
        onClick={() => onSort(h)}
        style={{
          padding: TBL.cellPad,
          textAlign: "left",
          fontWeight: TYPE.weight.bodyBold,
          color: "var(--muted)",
          fontSize: TYPE.size.meta,
          textTransform: "uppercase",
          letterSpacing: TYPE.ls.meta,
          whiteSpace: "nowrap",
          cursor: h ? "pointer" : "default",
          userSelect: "none",
          fontFamily: TYPE.family.mono,
        }}
      >
        {h}
        {sortCol === h && (
          <span style={{ marginLeft: 6, fontSize: 9, color: "var(--ink)" }}>
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </th>
    ))}
  </tr>
);

// DataTable — opaque card-surface table with sticky glass headers
// (v2). When the body scrolls inside the container, the thead floats
// above with the glass mixin so the rep doesn't lose column context.
// Browsers without backdrop-filter fall back to the global [data-glass]
// @supports rule (near-opaque tint).
export const DataTable = ({ children, style, emptyMessage }) => {
  const uid = "dt" + Math.random().toString(36).slice(2, 6);
  return (
    <div style={{
      overflowX: "auto",
      borderRadius: RAD[0],
      border: "1px solid var(--rule)",
      background: "var(--card)",
      ...style,
    }}>
      <style>{`
        .${uid} { width: 100%; border-collapse: collapse; font-size: ${TYPE.size.bodySm}px; font-family: ${TYPE.family.body}; font-variant-numeric: lining-nums tabular-nums; }
        .${uid} thead { position: sticky; top: 0; z-index: 2; }
        .${uid} thead tr { background: transparent; }
        .${uid} th {
          position: sticky;
          top: 0;
          padding: 10px 14px;
          text-align: left;
          font-weight: ${TYPE.weight.mono};
          color: var(--muted);
          font-size: ${TYPE.size.meta}px;
          text-transform: uppercase;
          letter-spacing: ${TYPE.ls.meta};
          background: var(--md-glass-bg);
          backdrop-filter: var(--md-glass-blur);
          -webkit-backdrop-filter: var(--md-glass-blur);
          border-bottom: 1px solid var(--rule);
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          font-family: ${TYPE.family.mono};
        }
        .${uid} td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--rule);
          vertical-align: middle;
          color: var(--ink);
          font-family: ${TYPE.family.body};
        }
        .${uid} tbody tr { transition: background ${DUR.fast}ms ${EASE}; cursor: pointer; }
        .${uid} tbody tr:hover { background: var(--hover-wash); }
        .${uid} tbody tr.dt-active { background: var(--hover-wash); }
        .${uid} tbody tr:last-child td { border-bottom: none; }
      `}</style>
      <table className={uid}>{children}</table>
    </div>
  );
};

export const Badge = ({ status, small }) => {
  const c = SC[status] || { bg: "transparent", text: "var(--muted)" };
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       small ? "1px 6px" : "2px 8px",
        borderRadius:  RAD[2],
        fontSize:      small ? 10 : TYPE.size.meta,
        fontWeight:    TYPE.weight.mono,
        background:    c.bg,
        color:         c.text,
        whiteSpace:    "nowrap",
        fontFamily:    TYPE.family.mono,
        letterSpacing: TYPE.ls.meta,
        textTransform: "uppercase",
        border:        `1px solid var(--rule)`,
      }}
    >{status}</span>
  );
};

// ── Btn + variants — Press Room ──────────────────────────────
// Variant rationale (docs/ui-refresh/01-direction-decisions.md):
//   primary   = high-contrast monochrome (ink → paper). Press red is
//               reserved for danger / alert. The "do this" action gets
//               typographic emphasis, not color emphasis.
//   secondary = ink on transparent with hairline rule
//   ghost     = ink on transparent, no border
//   cancel    = muted on transparent with hairline rule (step-back)
//   danger    = press red on white. The only solid-accent variant.
//   success   = ok green on white. Rare — confirmations only.
//   warning   = warn amber on white. Rare — caution affordances.
const btnBase = (sm, disabled) => ({
  display:      "inline-flex",
  alignItems:   "center",
  justifyContent: "center",
  gap:          6,
  border:       "1px solid transparent",
  cursor:       disabled ? "not-allowed" : "pointer",
  borderRadius: RAD[2],
  fontWeight:   TYPE.weight.bodyBold,
  fontSize:     sm ? TYPE.size.caption : TYPE.size.body,
  fontFamily:   TYPE.family.body,
  letterSpacing: TYPE.ls.headers,
  transition:   `opacity ${DUR.fast}ms ${EASE}, background ${DUR.fast}ms ${EASE}, border-color ${DUR.fast}ms ${EASE}`,
  padding:      sm ? "5px 14px" : "8px 18px",
  opacity:      disabled ? 0.4 : 1,
  whiteSpace:   "nowrap",
});

const btnVariants = {
  // Primary action = navy blue. Press red is reserved for danger/alert.
  primary:   { background: "var(--action)",    color: "#FFFFFF",       borderColor: "var(--action)" },
  secondary: { background: "transparent",      color: "var(--action)", borderColor: "var(--action)" },
  ghost:     { background: "transparent",      color: "var(--ink)",    borderColor: "transparent" },
  cancel:    { background: "transparent",      color: "var(--muted)",  borderColor: "var(--rule)" },
  danger:    { background: "var(--accent)",    color: "#FFFFFF",       borderColor: "var(--accent)" },
  success:   { background: "var(--ok)",        color: "#FFFFFF",       borderColor: "var(--ok)" },
  warning:   { background: "var(--warn)",      color: "#FFFFFF",       borderColor: "var(--warn)" },
};

// Filled variants opt out of the global hover-wash rule (which would
// flatten their fill). Instead they get an inset-darken on hover
// applied via a global CSS rule keyed on data-btn-filled. See
// global.css §Btn filled hover.
const FILLED_VARIANTS = new Set(["primary", "danger", "success", "warning"]);

export const Btn = ({ children, v = "primary", sm, onClick, style, disabled, type = "button" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    data-btn-filled={FILLED_VARIANTS.has(v) ? "true" : undefined}
    style={{ ...btnBase(sm, disabled), ...btnVariants[v], ...style }}
  >{children}</button>
);

// Styled file-upload button — hides the native "Choose Files" control
// and renders a label that matches Btn.
export const FileBtn = ({ children = "Choose Files", v = "primary", sm, accept, multiple, onChange, disabled, style, inputRef }) => (
  <label
    data-btn-filled={FILLED_VARIANTS.has(v) ? "true" : undefined}
    style={{ ...btnBase(sm, disabled), ...btnVariants[v], ...style }}
  >
    {children}
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      onChange={onChange}
      style={{ display: "none" }}
    />
  </label>
);

const labelStyle = pressLabel;

export const Inp = ({ label, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={labelStyle}>{label}</label>}
    <input style={{ ...inputSurface, padding: "8px 12px" }} {...p} />
  </div>
);

export const Sel = ({ label, options, style, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={labelStyle}>{label}</label>}
    <div style={{ position: "relative" }}>
      <select
        style={{
          ...inputSurface,
          padding: "8px 30px 8px 12px",
          width: "100%",
          cursor: "pointer",
          WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
          ...style,
        }}
        {...p}
      >
        {options.map(o => (
          <option
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >{typeof o === "string" ? o : o.label}</option>
        ))}
      </select>
      <div style={{
        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", color: "var(--muted)", fontSize: 9,
      }}>▼</div>
    </div>
  </div>
);

export const TA = ({ label, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={labelStyle}>{label}</label>}
    <textarea
      style={{
        ...inputSurface,
        padding: "10px 12px",
        resize: "vertical",
        minHeight: 80,
        fontFamily: TYPE.family.body,
      }}
      {...p}
    />
  </div>
);

// Card — opaque white-on-canvas content surface. The new visual
// hierarchy: cards lift off the steel canvas via temperature shift
// + a 1px inset highlight (--card-highlight), not a drop shadow.
export const Card = ({ children, style }) => (
  <div style={{
    background:   "var(--card)",
    border:       "1px solid var(--rule)",
    borderRadius: RAD.card,
    padding:      SPACE.cardPad,
    boxShadow:    "var(--card-highlight)",
    ...style,
  }}>{children}</div>
);

export const SB = ({ value, onChange, placeholder }) => (
  <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
    <div style={{
      position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
      color: "var(--muted)",
    }}><Ic.search size={14} /></div>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || "Search..."}
      style={{
        ...inputSurface,
        width: "100%",
        padding: "8px 12px 8px 30px",
        boxSizing: "border-box",
      }}
    />
  </div>
);

// Pill-style tab group with a sliding active indicator. The indicator is an
// absolutely-positioned div whose left/width are measured from the active
// button's bounding rect on every render — transitions animate the slide.
export const TB = ({ tabs, active, onChange }) => {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [rect, setRect] = useState({ left: 0, width: 0, ready: false });
  const tabsKey = Array.isArray(tabs) ? tabs.map(t => typeof t === "string" ? t : t.value).join("|") : "";

  useLayoutEffect(() => {
    const container = containerRef.current;
    const btn = btnRefs.current[active];
    if (!container || !btn) { setRect(r => ({ ...r, ready: false })); return; }
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setRect({ left: bRect.left - cRect.left, width: bRect.width, ready: true });
  }, [active, tabsKey]);

  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return <div ref={containerRef} style={{
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    // When rendered inside a flex-direction:column parent (e.g. the
    // Today tab's publication row), inline-flex alone doesn't prevent
    // cross-axis stretch. alignSelf:flex-start keeps the pill-group
    // hugging its content so the active indicator measures correctly.
    alignSelf: "flex-start",
    gap: 2,
    padding: 4,
    borderRadius: 999,
    background: "rgba(140,150,165,0.08)",
    border: "none",
  }}>
    {/* Sliding active indicator — navy so the selected tab reads
        as an action affordance. Press red is reserved for alerts. */}
    <div style={{
      position: "absolute",
      top: 4,
      bottom: 4,
      left: rect.left,
      width: rect.width,
      background: "var(--action)",
      borderRadius: 999,
      transition: rect.ready ? "left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)" : "none",
      opacity: rect.ready ? 1 : 0,
      pointerEvents: "none",
      zIndex: 0,
      boxShadow: "none",
    }} />
    {tabs.map(t => {
      // Tabs are either strings ("Active") or objects ({ value, label }).
      // Object form lets callers render an icon or styled glyph in the
      // label without mutating what's stored in onChange.
      const value = typeof t === "string" ? t : t.value;
      const label = typeof t === "string" ? t : t.label;
      const isActive = active === value;
      return <button
        key={value}
        ref={el => { btnRefs.current[value] = el; }}
        onClick={() => onChange(value)}
        style={{
          position: "relative",
          zIndex: 1,
          padding: "6px 14px",
          borderRadius: 999,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: FS.base,
          fontWeight: isActive ? 700 : 600,
          fontFamily: COND,
          color: isActive ? "#fff" : Z.td,
          transition: "color 0.25s",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >{label}</button>;
    })}
  </div>;
};

// Stat — KPI card. Press Room: Cormorant 600 numerics, ink color,
// tabular figures. Geist mono uppercase label above. Hairline border,
// no shadow.
//
// Motion (Phase 6 signature load): the numeric portion of `value`
// counts up from 0 to its final value over 600ms with cubic ease-out
// on first mount. Subsequent value updates snap. Strings that don't
// contain a number render as-is without animation.
const COUNT_UP_MS = 600;
const NUM_RE = /^(\D*)(-?[\d,]+(?:\.\d+)?)(.*)$/;

function useStatCountUp(value) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (typeof value === "number") {
      let frame;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / COUNT_UP_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(Math.round(value * eased * 100) / 100);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    }
    const m = String(value ?? "").match(NUM_RE);
    if (!m) {
      setDisplay(value);
      return;
    }
    const prefix = m[1] ?? "";
    const target = parseFloat(m[2].replace(/,/g, ""));
    const suffix = m[3] ?? "";
    if (Number.isNaN(target)) {
      setDisplay(value);
      return;
    }
    const isFloat = /\./.test(m[2]);
    const grouped = /,/.test(m[2]);
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = target * eased;
      const formatted = isFloat
        ? cur.toFixed(1)
        : grouped
          ? Math.round(cur).toLocaleString()
          : String(Math.round(cur));
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (t < 1) frame = requestAnimationFrame(step);
      else setDisplay(`${prefix}${grouped ? Math.round(target).toLocaleString() : isFloat ? target.toFixed(1) : target}${suffix}`);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return display;
}

export const Stat = ({ label, value, sub, animate = true }) => {
  const animated = useStatCountUp(animate ? value : value);
  // When animate is explicitly false, useStatCountUp still runs once
  // but lands on the same final value. Keep call order stable.
  const displayed = animate ? animated : value;
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--rule)",
      borderRadius: RAD.card,
      padding: SPACE.cardPad,
      boxShadow: "var(--card-highlight)",
    }}>
      <div style={{ ...pressMeta, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: TYPE.size.displayMd,
        fontWeight: TYPE.weight.display,
        color: "var(--ink)",
        lineHeight: TYPE.lh.display,
        fontFamily: TYPE.family.display,
        fontVariantNumeric: "lining-nums tabular-nums",
      }}>{displayed}</div>
      {sub && (
        <div style={{
          fontSize: TYPE.size.caption,
          color: "var(--muted)",
          marginTop: 6,
          fontFamily: TYPE.family.body,
        }}>{sub}</div>
      )}
    </div>
  );
};

// Modal — v2 backdrop: tinted dim PLUS an 8px blur (less aggressive
// than panel-glass 20px). Reveals the page beneath without replacing
// it. Panel itself stays opaque card surface — reading content needs
// solid contrast. Title is a Geist h3, not Cormorant.
export const Modal = ({ open, onClose, title, children, actions, width = MODAL.defaultWidth, onSubmit }) => {
  if (!open) return null;
  return <div tabIndex={-1} style={{
    position: "fixed", inset: 0,
    background: "rgba(20, 18, 14, 0.45)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: ZI.max,
    outline: "none",
    animation: `v2FadeIn ${DUR.med}ms ${EASE}`,
  }}
    onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    onKeyDown={e => {
      if (e.key === "Escape") { onClose(); }
      if (e.key === "Enter" && !e.shiftKey && onSubmit && !["TEXTAREA", "SELECT", "INPUT"].includes(e.target.tagName)) {
        e.preventDefault();
        onSubmit();
      }
    }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: "var(--card)",
      border: "1px solid var(--rule)",
      borderRadius: RAD[1],
      width,
      maxWidth: "92vw",
      maxHeight: "85vh",
      display: "flex",
      flexDirection: "column",
      animation: `v2ScaleIn ${DUR.med}ms ${EASE}`,
    }}>
      {/* Header — galley-proof hairline below the title. */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--rule)",
        flexShrink: 0,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: TYPE.size.h3,
          fontWeight: TYPE.weight.bodyBold,
          color: "var(--ink)",
          fontFamily: TYPE.family.body,
          letterSpacing: TYPE.ls.headers,
        }}>{title}</h3>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted)", padding: 4,
        }}><Ic.close size={18} /></button>
      </div>
      {/* Body — scrollable */}
      <div style={{ flex: 1, overflow: "auto", padding: 20, minHeight: 0 }}>{children}</div>
      {/* Footer */}
      {actions && (
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid var(--rule)",
          flexShrink: 0,
        }}>{actions}</div>
      )}
    </div>
  </div>;
};

// Bar — Press Room. Sharp rectangles (RAD[0]), ink-default fill, mono
// labels under each bar. Print-press visual.
export const Bar = ({ data, keys, colors, height = 180 }) => {
  const mx = Math.max(...data.map(d => keys.reduce((s, k) => s + d[k], 0)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 28 }}>
            {[...keys].reverse().map(k => (
              <div key={k} style={{
                height: Math.max(2, (d[k] / mx) * (height - 30)),
                background: colors[k] || "var(--action)",
                borderRadius: RAD[0],
              }} />
            ))}
          </div>
          <span style={{
            fontSize: TYPE.size.meta,
            color: "var(--muted)",
            fontWeight: TYPE.weight.mono,
            fontFamily: TYPE.family.mono,
            letterSpacing: TYPE.ls.meta,
            textTransform: "uppercase",
          }}>{d.month}</span>
        </div>
      ))}
    </div>
  );
};

// Toggle — Press Room. On = ink fill (the "engaged" state reads as
// committed type, not as a green light bulb). Off = paper with hairline.
export const Toggle = ({ checked, onChange, label, disabled }) => (
  <label style={{
    display: "inline-flex", alignItems: "center", gap: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  }}>
    <div
      onClick={e => { e.preventDefault(); if (!disabled) onChange(!checked); }}
      style={{
        width: TOGGLE.w, height: TOGGLE.h,
        borderRadius: RAD.pill,
        background: checked ? "var(--ink)" : "var(--paper)",
        border: `1px solid ${checked ? "var(--ink)" : "var(--rule)"}`,
        position: "relative",
        transition: `background ${DUR.fast}ms ${EASE}, border-color ${DUR.fast}ms ${EASE}`,
        flexShrink: 0,
      }}
    >
      <div style={{
        width: TOGGLE.circle, height: TOGGLE.circle,
        borderRadius: RAD.pill,
        background: checked ? "var(--paper)" : "var(--ink)",
        position: "absolute",
        top: TOGGLE.pad - 1,
        left: checked ? TOGGLE.w - TOGGLE.circle - TOGGLE.pad - 1 : TOGGLE.pad - 1,
        transition: `left ${DUR.fast}ms ${EASE}, background ${DUR.fast}ms ${EASE}`,
      }} />
    </div>
    {label && (
      <span style={{
        fontSize: TYPE.size.body,
        fontWeight: TYPE.weight.bodyMid,
        color: "var(--ink)",
        fontFamily: TYPE.family.body,
      }}>{label}</span>
    )}
  </label>
);

// Checkbox — Press Room. Hairline off-state, ink fill on, white check mark.
export const Check = ({ checked, onChange, label, size = 16 }) => (
  <label
    onClick={e => { e.preventDefault(); if (onChange) onChange(!checked); }}
    style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
  >
    <div style={{
      width: size, height: size,
      borderRadius: RAD[2],
      border: `1px solid ${checked ? "var(--ink)" : "var(--rule)"}`,
      background: checked ? "var(--ink)" : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: `background ${DUR.fast}ms ${EASE}, border-color ${DUR.fast}ms ${EASE}`,
      flexShrink: 0,
    }}>
      {checked && (
        <svg width={size - 6} height={size - 6} viewBox="0 0 10 8" fill="none">
          <path d="M1 4l3 3 5-6" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
    {label && (
      <span style={{
        fontSize: TYPE.size.body,
        color: "var(--ink)",
        fontFamily: TYPE.family.body,
      }}>{label}</span>
    )}
  </label>
);

// Avatar — Press Room. Pill (fully round) by default — initials in
// Geist 700 paper-on-ink. The `style` override can swap to RAD[2] for
// rectangular tile contexts.
export const Avi = ({ name, size = "md", style: extraStyle }) => {
  const dim = AVATAR[size] || AVATAR.md;
  const fs = AVATAR.fontSize[size] || AVATAR.fontSize.md;
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: dim, height: dim,
      borderRadius: RAD.pill,
      background: "var(--ink)",
      color: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: fs,
      fontWeight: TYPE.weight.bodyBold,
      flexShrink: 0,
      fontFamily: TYPE.family.body,
      letterSpacing: TYPE.ls.headers,
      ...extraStyle,
    }}>{initials}</div>
  );
};

// Pill — segmented filter chip. Press Room: pill silhouette stays
// (this IS the segmented control), but active state is ink-fill +
// paper text. No tint mode — tint reads as glass which Press rejects.
export const Pill = ({ label, icon: Icon, active, onClick, color, disabled, solid = false }) => {
  // `color` and `solid` retained for API compatibility but ignored —
  // Press Room has one active style.
  void color; void solid;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 12px",
        borderRadius: RAD.pill,
        border: `1px solid ${active ? "var(--action)" : "var(--rule)"}`,
        background: active ? "var(--action)" : "transparent",
        color: active ? "#FFFFFF" : "var(--ink)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: TYPE.size.caption,
        fontWeight: active ? TYPE.weight.bodyBold : TYPE.weight.bodyMid,
        fontFamily: TYPE.family.body,
        whiteSpace: "nowrap",
        transition: `background ${DUR.fast}ms ${EASE}, border-color ${DUR.fast}ms ${EASE}, color ${DUR.fast}ms ${EASE}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon && <Icon size={11} />}
      {label}
    </button>
  );
};

// ============================================================
// Global Layout Components — used across all pages
// ============================================================

// glass() — restored to the real Steel-Office recipe (v2 2026-04-26).
// Used by floating chrome (Sidebar, TopBar, MetadataStrip) and by the
// FloatingPanel primitive for popovers / sticky table headers. Card,
// GlassCard, ListCard, and Stat are content surfaces — they do NOT
// consume this mixin (they keep the opaque `var(--card)` recipe).
//
// Surfaces that consume glass() should also set the `data-glass`
// attribute so the @supports fallback in global.css can substitute a
// near-opaque tinted bg in browsers without backdrop-filter support.
export const glass = () => ({
  background:           "var(--md-glass-bg)",
  border:               "1px solid var(--md-glass-border)",
  backdropFilter:       "var(--md-glass-blur)",
  WebkitBackdropFilter: "var(--md-glass-blur)",
  boxShadow:            "var(--md-glass-shadow)",
});

// cardSurface() — the recipe Card / GlassCard / ListCard / Stat all
// share. Use this for inline content-card spreads in pages (kanban
// tiles, KPI tiles, signal panels, etc). Replaces the pre-v2 pattern
// where pages used `...glass()` to get the hairline-card look —
// that recipe is now real glass and reserved for chrome. Pages
// should never spread glass() directly.
export const cardSurface = () => ({
  background: "var(--card)",
  border:     "1px solid var(--rule)",
  boxShadow:  "var(--card-highlight)",
});

// FloatingPanel — wraps glass() for popovers, dropdowns, sticky
// headers. Default radius is RAD[1] (2px) — panel-tier, sharp.
// Adds `data-glass` for the @supports fallback hook in global.css.
export const FloatingPanel = ({ children, style, ...rest }) => (
  <div
    data-glass="true"
    {...rest}
    style={{ ...glass(), borderRadius: RAD[1], ...style }}
  >{children}</div>
);

// GlassCard — name retained for back-compat with consumers; v2
// converts this from a glass mixin consumer to a plain content card
// (white-on-canvas with hairline + inset highlight). Glass is for
// floating chrome only — see FloatingPanel.
export const GlassCard = ({ children, style, noPad, onClick, onMouseOver, onMouseOut }) => {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      style={{
        background:   "var(--card)",
        border:       "1px solid var(--rule)",
        borderRadius: RAD.card,
        padding:      noPad ? 0 : "20px 22px",
        boxShadow:    "var(--card-highlight)",
        cursor:       interactive ? "pointer" : "default",
        transition:   `background ${DUR.fast}ms ${EASE}, border-color ${DUR.fast}ms ${EASE}`,
        ...style,
      }}
    >{children}</div>
  );
};

// ListCard — content card for list rows. Same opaque recipe.
export const ListCard = ({ children, style, onClick, active }) => (
  <div
    onClick={onClick}
    style={{
      background:   "var(--card)",
      border:       "1px solid var(--rule)",
      borderRadius: RAD.card,
      padding:      CARD.pad,
      boxShadow:    "var(--card-highlight)",
      cursor:       onClick ? "pointer" : "default",
      transition:   `background ${DUR.fast}ms ${EASE}`,
      ...(active ? { background: "var(--hover-wash)" } : {}),
      ...style,
    }}
    onMouseEnter={e => { if (onClick && !active) e.currentTarget.style.background = "var(--hover-wash)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? "var(--hover-wash)" : "var(--card)"; }}
  >{children}</div>
);

// ListDivider — hairline rule
export const ListDivider = () => (
  <div style={{ height: 1, background: "var(--rule)" }} />
);

// ListGrid — container for floating cards with standard gap
export const ListGrid = ({ children, cols, style }) => <div style={{
  display: "grid", gridTemplateColumns: cols || "1fr", gap: CARD.gap, ...style,
}}>{children}</div>;

// PageHeader — Cormorant display title. Press Room's biggest moment of
// editorial type per page.
export const PageHeader = ({ title, count, children }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 10,
  }}>
    <h2 style={{
      margin: 0,
      fontSize: TYPE.size.displayLg,
      fontWeight: TYPE.weight.display,
      lineHeight: TYPE.lh.display,
      color: "var(--ink)",
      fontFamily: TYPE.family.display,
    }}>
      {title}
      {count != null && (
        <span style={{
          fontSize: TYPE.size.body,
          fontWeight: TYPE.weight.bodyMid,
          color: "var(--muted)",
          marginLeft: 12,
          fontFamily: TYPE.family.body,
          fontVariantNumeric: "lining-nums tabular-nums",
        }}>({count})</span>
      )}
    </h2>
    {children && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {children}
      </div>
    )}
  </div>
);

// TabRow — horizontal layout for grouped tab strips. Hairline below.
export const TabRow = ({ children }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 0,
    flexWrap: "nowrap", overflowX: "auto",
    borderBottom: "1px solid var(--rule)",
  }}>{children}</div>
);

// TabPipe — vertical hairline between tab groups.
export const TabPipe = () => (
  <span style={{
    margin: "0 12px",
    width: 1, height: 16,
    background: "var(--rule)",
    display: "inline-block",
    alignSelf: "center",
    userSelect: "none",
  }} aria-hidden="true" />
);

// SolidTabs — Press Room: filter tabs as underline-only segments.
// Active = ink underline + ink text; inactive = muted text, no border.
export const SolidTabs = ({ options, active, onChange }) => (
  <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
    {options.map(o => {
      const val = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      const isActive = active === val;
      return (
        <button
          key={val}
          onClick={() => onChange(val)}
          style={{
            padding: "8px 14px",
            borderRadius: 0,
            border: "none",
            borderBottom: isActive ? "2px solid var(--action)" : "2px solid transparent",
            background: "transparent",
            color: isActive ? "var(--action)" : "var(--muted)",
            cursor: "pointer",
            fontSize: TYPE.size.body,
            fontWeight: isActive ? TYPE.weight.bodyBold : TYPE.weight.bodyMid,
            fontFamily: TYPE.family.body,
            whiteSpace: "nowrap",
            letterSpacing: TYPE.ls.headers,
          }}
        >{label}</button>
      );
    })}
  </div>
);

// GlassStat — alias of Stat. The "glass" name is preserved for API
// back-compat; visuals are identical to Stat post-refresh.
export const GlassStat = Stat;

// SectionTitle — Geist h3, not Cormorant (sub-display tier).
export const SectionTitle = ({ children }) => (
  <div style={{
    fontSize: TYPE.size.h3,
    fontWeight: TYPE.weight.bodyBold,
    color: "var(--ink)",
    fontFamily: TYPE.family.body,
    letterSpacing: TYPE.ls.headers,
    marginBottom: 16,
  }}>{children}</div>
);

// GlassDivider — alias of ListDivider (no visual difference under Press).
export const GlassDivider = ListDivider;

// ============================================================
// ErrorBoundary — catches render errors in lazy-loaded pages
// ============================================================
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // Always log so we have something to look at when a boundary catches
    // — the React error overlay only shows in dev. In prod this lands in
    // the browser console where Bugsnag/Sentry etc. can pick it up later.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info?.componentStack);
  }
  render() {
    if (!this.state.hasError) return this.props.children;

    // `silent` boundary — used for non-critical chrome (popovers, side
    // widgets) where a crash shouldn't blank that piece of the UI. The
    // fallback renders nothing; the rest of the app keeps working.
    if (this.props.silent) return null;

    // `fallback` override — caller supplies a tiny inline replacement
    // (e.g., "[Sidebar unavailable]"). Useful for chrome that needs to
    // leave a placeholder so the user notices.
    if (this.props.fallback) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback({ error: this.state.error, name: this.props.name })
        : this.props.fallback;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 16, background: Z.bg, borderRadius: R, minHeight: 200 }}>
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.da, fontFamily: COND }}>Something went wrong</div>
        <div style={{ fontSize: FS.base, color: Z.tx, fontFamily: COND, textAlign: "center", maxWidth: 420, opacity: 0.7 }}>
          {this.props.name ? `The ${this.props.name} module failed to load.` : "A module failed to load."}
        </div>
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: "8px 20px", borderRadius: R, border: "none", background: Z.ac, color: "#fff", fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, cursor: "pointer" }}>Try Again</button>
      </div>
    );
  }
}

// ============================================================
// Shell v2 primitives — used by the refreshed Sidebar/TopBar.
// All read from the semantic surface tokens on Z (bgHover,
// bgActive, fgPrimary, fgSecondary, fgMuted, fgAccent,
// borderSubtle, borderStrong) and the RADII / EASE / DUR / FONT
// exports. They stay out of the legacy !important selectors by
// wrapping under data-shell="v2" in the parent.
// ============================================================

// NavItem — sidebar entry. 36px high, 10px radius, 3px left accent
// bar when active. When `collapsed` the label fades but stays in
// the DOM so width animations look natural.
export const NavItem = ({ icon: Icon, label, active, collapsed, badge, badgeVariant = "neutral", onClick, title }) => {
  const base = {
    display: "flex", alignItems: "center",
    height: 36, margin: "2px 8px", padding: "0 12px",
    borderRadius: 10, cursor: "pointer",
    color: active ? Z.fgAccent : Z.fgSecondary,
    background: active ? Z.bgActive : "transparent",
    fontSize: 13.5, fontWeight: active ? 600 : 500,
    fontFamily: FONT.sans,
    position: "relative",
    transition: `background-color ${DUR.fast}ms ${EASE}, color ${DUR.fast}ms ${EASE}`,
    whiteSpace: "nowrap",
    border: "none",
    width: "auto",
    textAlign: "left",
  };
  return (
    <div
      onClick={onClick}
      title={title || label}
      style={base}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = Z.bgHover; e.currentTarget.style.color = Z.fgPrimary; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = Z.fgSecondary; } }}
    >
      {active && (
        <span style={{
          position: "absolute", left: -8, top: 8, bottom: 8,
          width: 3, borderRadius: "0 3px 3px 0",
          background: "#486b95",
        }} />
      )}
      <span style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon && <Icon size={18} />}
      </span>
      <span style={{
        marginLeft: 12,
        opacity: collapsed ? 0 : 1,
        transition: `opacity ${DUR.med}ms ${EASE}`,
        flex: 1,
        overflow: "hidden",
      }}>{label}</span>
      {badge != null && (collapsed
        ? <NavBadge value={badge} variant={badgeVariant} collapsed />
        : <NavBadge value={badge} variant={badgeVariant} />
      )}
    </div>
  );
};

// NavBadge — pill when expanded, 6px colored dot (absolutely
// positioned at top-right of the parent NavItem) when collapsed.
export const NavBadge = ({ value, variant = "neutral", collapsed }) => {
  if (collapsed) {
    const dotColor =
      variant === "warning" ? SIGNAL.warning :
      variant === "danger"  ? SIGNAL.danger  :
      Z.fgPrimary;
    return (
      <span style={{
        position: "absolute", top: 8, right: 10,
        width: 6, height: 6, borderRadius: "50%",
        background: dotColor,
        transition: `opacity ${DUR.fast}ms ${EASE}`,
      }} />
    );
  }
  const isDark = _isDark();
  const bg =
    variant === "warning" ? (isDark ? "rgba(217,154,40,0.2)" : "rgba(217,154,40,0.15)") :
    variant === "danger"  ? (isDark ? "rgba(214,69,69,0.18)" : "rgba(214,69,69,0.12)") :
    (isDark ? NEUTRAL[200] : NEUTRAL[800]);
  const color =
    variant === "warning" ? (isDark ? SIGNAL.warning : SIGNAL.warningHover) :
    variant === "danger"  ? (isDark ? "#e88" : SIGNAL.dangerHover) :
    (isDark ? NEUTRAL[900] : NEUTRAL[0]);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 20, height: 18, padding: "0 6px",
      borderRadius: 9, fontSize: 10.5, fontWeight: 600,
      fontVariantNumeric: "tabular-nums",
      background: bg, color,
      fontFamily: FONT.sans,
    }}>{value}</span>
  );
};

// NavSection — label above a group of NavItems. When `collapsed`
// (sidebar narrow), swap label for a 1px hairline divider so the
// rail stays visually grouped.
export const NavSection = ({ label, collapsed, isCollapsed, onToggle, badgeTotal, children }) => {
  return (
    <div>
      {label && !collapsed && (
        <div
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 24, padding: "0 20px", margin: "14px 0 4px",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: Z.fgMuted,
            cursor: onToggle ? "pointer" : "default",
            userSelect: "none",
            fontFamily: FONT.sans,
            whiteSpace: "nowrap",
          }}
        >
          <span>{label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {isCollapsed && badgeTotal > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                background: Z.fgPrimary, color: Z.bgChrome,
                borderRadius: 4, padding: "0 4px",
                minWidth: 14, textAlign: "center", lineHeight: "16px",
              }}>{badgeTotal}</span>
            )}
            <span style={{
              fontSize: 9,
              transition: `transform ${DUR.fast}ms ${EASE}`,
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)",
            }}>▼</span>
          </div>
        </div>
      )}
      {label && collapsed && (
        <div style={{
          height: 1, margin: "8px 12px 4px",
          background: Z.borderSubtle,
        }} />
      )}
      {(!isCollapsed || collapsed) && children}
    </div>
  );
};

// Breadcrumb — horizontal row with `›` separators. Last item is
// rendered as current (fg-primary); earlier items are muted and
// clickable if they carry an onClick.
export const Breadcrumb = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span style={{ color: Z.borderStrong, fontSize: 12 }}>›</span>}
            <span
              onClick={c.onClick}
              style={{
                fontSize: 13, fontWeight: 500,
                color: last ? Z.fgPrimary : Z.fgMuted,
                cursor: c.onClick ? "pointer" : "default",
                fontFamily: FONT.sans,
              }}
            >{c.label}</span>
          </span>
        );
      })}
    </div>
  );
};

// AppShell — 2-column grid wrapper: sidebar placeholder on the
// left, topBar + main on the right. Sidebar itself handles its
// own hover/pin overlay; this component just reserves the column.
export const AppShell = ({ sidebar, topBar, children }) => (
  <div data-shell="v2" style={{
    display: "grid",
    gridTemplateColumns: "64px 1fr",
    minHeight: "100vh",
    fontFamily: FONT.sans,
  }}>
    {sidebar}
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {topBar}
      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  </div>
);
