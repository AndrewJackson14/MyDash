// ============================================================
// Shared UI Primitives — MyDash Editorial Monochrome
// R = 5px card radius, Ri = 3px internal radius, SP = spacing
// ============================================================
import { Component, useState, useRef, useLayoutEffect } from "react";
import { Z, SC, COND, DISPLAY, R, Ri, SP, TBL, CARD, FS, FW, INPUT, BTN, MODAL, LABEL, TOGGLE, AVATAR, ZI, INV, RADII, EASE, DUR, FONT, SIGNAL, NEUTRAL, isDark as _isDark } from "../../lib/theme";
import Ic from "./Icons";

export const ThemeToggle = ({ onToggle }) => {
  const dk = _isDark();
  return <button onClick={onToggle} title={dk ? "Light mode" : "Dark mode"} style={{ background: Z.tx, color: Z.bg, border: "none", borderRadius: Ri, padding: "5px 12px", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND, display: "flex", alignItems: "center", gap: 6 }}>{dk ? "☀" : "🌙"}<span>{dk ? "Light" : "Dark"}</span></button>;
};

export const BackBtn = ({ onClick }) => <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tx, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, display: "flex", alignItems: "center", gap: 4, padding: "4px 0", marginBottom: 4 }}><span style={{ fontSize: FS.lg }}>&larr;</span> Back</button>;

export const FilterBar = ({ options, active, onChange, colorMap }) => <div style={{ display: "flex", gap: 16 }}>{options.map(o => { const val = typeof o === "string" ? o : o.value; const label = typeof o === "string" ? o : o.label; const isActive = Array.isArray(active) ? active.includes(val) : active === val; return <button key={val} onClick={() => onChange(val)} style={{ padding: 0, borderRadius: 0, border: "none", borderBottom: isActive ? `2px solid ${Z.tx}` : "2px solid transparent", background: "transparent", cursor: "pointer", fontSize: FS.base, fontWeight: isActive ? 700 : 600, color: isActive ? Z.tx : Z.td, fontFamily: COND, whiteSpace: "nowrap", paddingBottom: 4 }}>{label}</button>; })}</div>;

export const SortHeader = ({ columns, sortCol, sortDir, onSort }) => <tr style={{ background: Z.sa }}>{columns.map(h => <th key={h} onClick={() => onSort(h)} style={{ padding: TBL.cellPad, textAlign: "left", fontWeight: TBL.headerWeight, color: Z.td, fontSize: TBL.headerSize, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${Z.bd}`, whiteSpace: "nowrap", cursor: h ? "pointer" : "default", userSelect: "none", fontFamily: COND }}>{h}{sortCol === h && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}</th>)}</tr>;

// DataTable — universal frosted glass table with standardized styles
export const DataTable = ({ children, style, emptyMessage }) => {
  const isDark = Z.bg === "#08090D";
  const glassBg = isDark ? "rgba(140,150,165,0.05)" : "rgba(0,0,0,0.02)";
  const glassBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const headerBg = isDark ? "rgba(140,150,165,0.06)" : "rgba(0,0,0,0.03)";
  const hoverBg = isDark ? "rgba(255,255,255," + TBL.hoverAlpha + ")" : "rgba(0,0,0," + TBL.hoverAlpha + ")";
  const activeBg = isDark ? "rgba(255,255,255," + TBL.activeAlpha + ")" : "rgba(0,0,0," + TBL.activeAlpha + ")";
  const rowBorder = isDark ? "rgba(255,255,255," + TBL.borderAlpha + ")" : "rgba(0,0,0," + TBL.borderAlpha + ")";
  const uid = "dt" + Math.random().toString(36).slice(2, 6);
  return <div style={{
    overflowX: "auto", borderRadius: TBL.radius,
    border: `1px solid ${glassBorder}`,
    background: glassBg,
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    ...style,
  }}>
    <style>{`
      .${uid} { width: 100%; border-collapse: collapse; font-size: ${TBL.bodySize}px; font-family: ${COND}; }
      .${uid} thead tr { background: ${headerBg}; }
      .${uid} th { padding: ${TBL.cellPad}; text-align: left; font-weight: ${TBL.headerWeight}; color: ${Z.td}; font-size: ${TBL.headerSize}px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ${rowBorder}; white-space: nowrap; cursor: pointer; user-select: none; font-family: ${COND}; }
      .${uid} td { padding: ${TBL.cellPad}; border-bottom: 1px solid ${rowBorder}; vertical-align: middle; font-family: ${COND}; }
      .${uid} tbody tr { transition: background 0.1s; cursor: pointer; }
      .${uid} tbody tr:hover { background: ${hoverBg}; }
      .${uid} tbody tr.dt-active { background: ${activeBg}; }
      .${uid} tbody tr:last-child td { border-bottom: none; }
    `}</style>
    <table className={uid}>{children}</table>
  </div>;
};

export const Badge = ({ status, small }) => { const c = SC[status] || { bg: Z.sa, text: Z.tm }; return <span style={{ display: "inline-flex", alignItems: "center", padding: small ? "2px 8px" : "4px 12px", borderRadius: Ri, fontSize: small ? 10 : 11, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap", fontFamily: COND, letterSpacing: 0.3 }}>{status}</span>; };

const btnBase = (sm, disabled) => ({ display: "inline-flex", alignItems: "center", gap: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: BTN.radius, fontWeight: BTN.fontWeight, fontSize: sm ? FS.sm : BTN.fontSize, fontFamily: COND, transition: "opacity 0.15s", padding: sm ? BTN.padSm : BTN.pad, opacity: disabled ? 0.4 : 1 });
const btnVariants = {
  primary:   { background: "#3b82f6", color: INV.light },
  success:   { background: Z.go, color: INV.light },
  secondary: { background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" },
  ghost:     { background: "transparent", color: Z.tm, border: "none" },
  danger:    { background: Z.da, color: INV.light },
  cancel:    { background: "rgba(224,80,80,0.12)", color: Z.da, border: "1px solid rgba(224,80,80,0.3)" },
  warning:   { background: Z.wa, color: INV.light },
};

export const Btn = ({ children, v = "primary", sm, onClick, style, disabled }) => {
  return <button onClick={onClick} disabled={disabled} style={{ ...btnBase(sm, disabled), ...btnVariants[v], ...style }}>{children}</button>;
};

// Styled file-upload button — hides the native "Choose Files" control and
// renders a label that matches Btn. Callers receive the FileList via onChange.
export const FileBtn = ({ children = "Choose Files", v = "primary", sm, accept, multiple, onChange, disabled, style, inputRef }) => {
  return <label style={{ ...btnBase(sm, disabled), ...btnVariants[v], ...style }}>
    {children}
    <input ref={inputRef} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={onChange} style={{ display: "none" }} />
  </label>;
};

const labelStyle = { fontSize: LABEL.fontSize, fontWeight: LABEL.fontWeight, color: Z.td, letterSpacing: LABEL.letterSpacing, textTransform: LABEL.textTransform, fontFamily: COND };

// Shared input surface — matches global.css rgba(128,128,128,0.08)
const inputSurface = { background: "rgba(128,128,128,0.10)", border: "1px solid rgba(128,128,128,0.20)", borderRadius: INPUT.radius, color: Z.tx, fontSize: INPUT.fontSize, outline: "none", fontFamily: COND };

export const Inp = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<input style={{ ...inputSurface, padding: INPUT.pad }} {...p} /></div>;

export const Sel = ({ label, options, style, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<div style={{ position: "relative" }}><select style={{ ...inputSurface, padding: "9px 32px 9px 14px", width: "100%", cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none", ...style }} {...p}>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select><div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: Z.tm, fontSize: FS.micro }}>▼</div></div></div>;

export const TA = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<textarea style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: INPUT.radius, padding: "11px 14px", color: Z.tx, fontSize: INPUT.fontSize, outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} {...p} /></div>;

export const Card = ({ children, style }) => <div style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad, ...style }}>{children}</div>;

export const SB = ({ value, onChange, placeholder }) => <div style={{ position: "relative", flex: 1, maxWidth: 280 }}><div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: Z.td }}><Ic.search size={15} /></div><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Search..."} style={{ ...inputSurface, width: "100%", padding: "9px 14px 9px 34px", boxSizing: "border-box" }} /></div>;

// Pill-style tab group with a sliding active indicator. The indicator is an
// absolutely-positioned div whose left/width are measured from the active
// button's bounding rect on every render — transitions animate the slide.
export const TB = ({ tabs, active, onChange }) => {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [rect, setRect] = useState({ left: 0, width: 0, ready: false });
  const tabsKey = Array.isArray(tabs) ? tabs.join("|") : "";

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
    gap: 2,
    padding: 4,
    borderRadius: 999,
    background: "rgba(140,150,165,0.08)",
    border: "none",
  }}>
    {/* Sliding active indicator — blue so the selected tab reads
        as an action affordance, not a heavy black block. */}
    <div style={{
      position: "absolute",
      top: 4,
      bottom: 4,
      left: rect.left,
      width: rect.width,
      background: "#3B82F6",
      borderRadius: 999,
      transition: rect.ready ? "left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)" : "none",
      opacity: rect.ready ? 1 : 0,
      pointerEvents: "none",
      zIndex: 0,
      boxShadow: rect.ready ? "0 2px 8px rgba(59,130,246,0.3)" : "none",
    }} />
    {tabs.map(t => {
      const isActive = active === t;
      return <button
        key={t}
        ref={el => { btnRefs.current[t] = el; }}
        onClick={() => onChange(t)}
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
        }}
      >{t}</button>;
    })}
  </div>;
};

export const Stat = ({ label, value, sub }) => <div style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad }}><div style={{ ...labelStyle, marginBottom: 8 }}>{label}</div><div style={{ fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, letterSpacing: -0.5, fontFamily: DISPLAY }}>{value}</div>{sub && <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 4 }}>{sub}</div>}</div>;

// Modal — header + scrollable body + optional sticky footer.
// Pass an `actions` prop to render sticky buttons pinned to the
// bottom of the modal frame (Cancel / Save / Create Notice / etc).
// Content scrolls behind the footer. If `actions` isn't provided,
// children render normally in a scrollable body — existing modals
// without a footer prop still work exactly as before.
export const Modal = ({ open, onClose, title, children, actions, width = MODAL.defaultWidth, onSubmit }) => {
  if (!open) return null;
  const dark = _isDark();
  return <div tabIndex={-1} style={{
    position: "fixed", inset: 0,
    // Shell v2 glass overlay — tinted steel-navy in light mode,
    // pure black in dark — plus a real 12px blur so the page
    // below reads as pressed-behind-glass instead of just dimmed.
    background: dark ? "rgba(0,0,0,0.55)" : "rgba(15,29,44,0.35)",
    backdropFilter: "blur(12px) saturate(180%)",
    WebkitBackdropFilter: "blur(12px) saturate(180%)",
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
      // Shell v2 glass panel — translucent surface, heavy blur,
      // subtle inset edge, and a layered shadow for real depth.
      background: Z.glassBg,
      backdropFilter: "blur(40px) saturate(180%)",
      WebkitBackdropFilter: "blur(40px) saturate(180%)",
      border: `1px solid ${Z.glassBorder}`,
      borderRadius: RADII.xl,
      boxShadow: Z.glassShadow,
      width,
      maxWidth: "92vw",
      maxHeight: "85vh",
      display: "flex",
      flexDirection: "column",
      animation: `v2ScaleIn ${DUR.slow}ms ${EASE}`,
    }}>
      {/* Header — fixed top */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: MODAL.pad, borderBottom: `1px solid ${Z.glassBorder}`, flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: Z.fgPrimary, fontFamily: FONT.display, letterSpacing: "-0.02em" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.fgMuted }}><Ic.close size={18} /></button>
      </div>
      {/* Body — scrollable */}
      <div style={{ flex: 1, overflow: "auto", padding: 24, minHeight: 0 }}>{children}</div>
      {/* Footer — sticky bottom, only rendered when actions prop provided */}
      {actions && <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
        padding: "14px 24px",
        borderTop: `1px solid ${Z.glassBorder}`,
        flexShrink: 0,
        borderBottomLeftRadius: RADII.xl,
        borderBottomRightRadius: RADII.xl,
      }}>{actions}</div>}
    </div>
  </div>;
};

export const Bar = ({ data, keys, colors, height = 180 }) => { const mx = Math.max(...data.map(d => keys.reduce((s, k) => s + d[k], 0))); return <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height }}>{data.map((d, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 28 }}>{[...keys].reverse().map(k => <div key={k} style={{ height: Math.max(2, (d[k] / mx) * (height - 30)), background: colors[k] || Z.tx, borderRadius: R }} />)}</div><span style={{ fontSize: FS.base, color: Z.tm, fontWeight: FW.bold, fontFamily: COND }}>{d.month}</span></div>)}</div>; };

// ============================================================
// Toggle — reusable on/off switch (replaces 5+ inline implementations)
// ============================================================
export const Toggle = ({ checked, onChange, label, disabled }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
    <div onClick={e => { e.preventDefault(); if (!disabled) onChange(!checked); }} style={{ width: TOGGLE.w, height: TOGGLE.h, borderRadius: TOGGLE.radius, background: checked ? Z.go : Z.bd, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: TOGGLE.circle, height: TOGGLE.circle, borderRadius: TOGGLE.circleRadius, background: INV.light, position: "absolute", top: TOGGLE.pad, left: checked ? TOGGLE.w - TOGGLE.circle - TOGGLE.pad : TOGGLE.pad, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
    </div>
    {label && <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{label}</span>}
  </label>
);

// ============================================================
// Checkbox — consistent styled checkbox
// ============================================================
export const Check = ({ checked, onChange, label, size = 16 }) => (
  <label onClick={e => { e.preventDefault(); if (onChange) onChange(!checked); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
    <div style={{ width: size, height: size, borderRadius: Ri, border: `1.5px solid ${checked ? Z.go : Z.bd}`, background: checked ? Z.go : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}>
      {checked && <svg width={size - 6} height={size - 6} viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke={INV.light} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
    {label && <span style={{ fontSize: FS.base, color: Z.tx, fontFamily: COND }}>{label}</span>}
  </label>
);

// ============================================================
// Avatar — initials-based avatar with consistent sizing
// ============================================================
export const Avi = ({ name, size = "md", style: extraStyle }) => {
  const dim = AVATAR[size] || AVATAR.md;
  const fs = AVATAR.fontSize[size] || AVATAR.fontSize.md;
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = Math.abs([...(name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
  return (
    <div style={{ width: dim, height: dim, borderRadius: R, background: `hsl(${hue}, 40%, 38%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs, fontWeight: FW.black, color: INV.light, flexShrink: 0, fontFamily: COND, ...extraStyle }}>{initials}</div>
  );
};

// ============================================================
// Pill — small toggle/filter button with optional icon.
//
// Active styling has two modes:
//   - tint   (default): subtle ~9% tint of `color` as background, color text
//   - solid  (solid=true): full `color` background with white text
// `color` defaults to the foreground in tint mode and to the green accent
// (Z.go) in solid mode — picks the right "feels active" look for each.
// ============================================================
export const Pill = ({ label, icon: Icon, active, onClick, color, disabled, solid = false }) => {
  const accent = color || (solid ? Z.go : Z.tx);
  const activeBg = solid ? accent : accent + "18";
  const activeFg = solid ? "#fff" : accent;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "5px 12px", borderRadius: 14,
      border: "none",
      background: active ? activeBg : Z.sa,
      color: active ? activeFg : Z.tx2,
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: FS.xs, fontWeight: active ? FW.bold : FW.semi, fontFamily: COND,
      whiteSpace: "nowrap", transition: "all 0.15s",
      opacity: disabled ? 0.5 : 1,
    }}>
      {Icon && <Icon size={11} />}
      {label}
    </button>
  );
};

// ============================================================
// Global Layout Components — used across all pages
// ============================================================

// Glass effect — reusable inline style mixin for frosted glass appearance.
// Tightened recipe: lower alpha so the ambient wallpaper shows through,
// an inset top highlight so the edge catches light, and a soft outer
// drop shadow for real depth.
export const glass = () => {
  const dark = _isDark();
  return {
    background: dark ? "rgba(140,150,165,0.08)" : "rgba(255,255,255,0.65)",
    backdropFilter: "blur(24px) saturate(140%)",
    WebkitBackdropFilter: "blur(24px) saturate(140%)",
    border: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)"}`,
    boxShadow: dark
      ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.2)"
      : "inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 24px rgba(15,23,42,0.06)",
  };
};

export const GlassCard = ({ children, style, noPad, onClick, onMouseOver, onMouseOut }) => {
  const interactive = !!onClick;
  const handleEnter = (e) => {
    if (interactive) {
      e.currentTarget.style.transform = "translateY(-1px)";
      e.currentTarget.style.background = _isDark() ? "rgba(140,150,165,0.12)" : "rgba(255,255,255,0.80)";
    }
    if (onMouseOver) onMouseOver(e);
  };
  const handleLeave = (e) => {
    if (interactive) {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.background = _isDark() ? "rgba(140,150,165,0.08)" : "rgba(255,255,255,0.65)";
    }
    if (onMouseOut) onMouseOut(e);
  };
  return <div onClick={onClick} onMouseOver={handleEnter} onMouseOut={handleLeave} style={{
    ...glass(),
    borderRadius: R, padding: noPad ? 0 : "22px 24px",
    cursor: interactive ? "pointer" : "default",
    transition: "transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
    ...style,
  }}>{children}</div>;
};

// ListCard — individual frosted glass card for list items (floating cards with gap)
export const ListCard = ({ children, style, onClick, active }) => <div onClick={onClick} style={{
  ...glass(),
  borderRadius: CARD.radius, padding: CARD.pad,
  cursor: onClick ? "pointer" : "default",
  transition: "background 0.1s",
  ...(active ? { background: _isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" } : {}),
  ...style,
}} onMouseEnter={e => { if (onClick) e.currentTarget.style.background = _isDark() ? "rgba(255,255,255," + CARD.hoverAlpha + ")" : "rgba(0,0,0," + CARD.hoverAlpha + ")"; }}
   onMouseLeave={e => { e.currentTarget.style.background = active ? (_isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : (_isDark() ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.45)"); }}
>{children}</div>;

// ListDivider — translucent divider for items inside a grouped card
export const ListDivider = () => <div style={{ height: 1, background: _isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />;

// ListGrid — container for floating cards with standard gap
export const ListGrid = ({ children, cols, style }) => <div style={{
  display: "grid", gridTemplateColumns: cols || "1fr", gap: CARD.gap, ...style,
}}>{children}</div>;

// Page header — Line 1: [Title] ... [right-side children (search, dropdown, +Action)]
export const PageHeader = ({ title, count, children }) => <div style={{
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexWrap: "wrap", gap: 10,
}}>
  <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
    {title}{count != null && <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tm, marginLeft: 8 }}>({count})</span>}
  </h2>
  {children && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{children}</div>}
</div>;

// Tab row — Line 2: [View tabs] | [Filter tabs]. Accepts multiple TB groups separated by pipe.
export const TabRow = ({ children }) => <div style={{
  display: "flex", alignItems: "center", gap: 0, flexWrap: "nowrap", overflowX: "auto",
}}>{children}</div>;

// Pipe separator for use inside TabRow
export const TabPipe = () => <span style={{
  margin: "0 16px", color: Z.td, fontSize: FS.lg, fontWeight: 300, userSelect: "none",
}}>|</span>;

// Solid-fill filter tabs — green active, transparent inactive
export const SolidTabs = ({ options, active, onChange }) => <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
  {options.map(o => {
    const val = typeof o === "string" ? o : o.value;
    const label = typeof o === "string" ? o : o.label;
    const isActive = active === val;
    return <button key={val} onClick={() => onChange(val)} style={{
      padding: "5px 14px", borderRadius: Ri, border: "none",
      background: isActive ? Z.go : "transparent",
      color: isActive ? INV.light : Z.td,
      cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND, whiteSpace: "nowrap",
    }}>{label}</button>;
  })}
</div>;

// Glass stat card — metric display with frosted effect
export const GlassStat = ({ label, value, sub, color }) => <div style={{
  ...glass(),
  borderRadius: R, padding: SP.cardPad,
}}>
  <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, fontFamily: COND }}>{label}</div>
  <div style={{ fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, letterSpacing: -0.5, fontFamily: DISPLAY }}>{value}</div>
  {sub && <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 4 }}>{sub}</div>}
</div>;

// Section title inside a card
export const SectionTitle = ({ children }) => <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 16 }}>{children}</div>;

// Glass divider — translucent line inside glass cards
export const GlassDivider = () => <div style={{ height: 1, background: _isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", margin: "4px 0" }} />;

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
  render() {
    if (!this.state.hasError) return this.props.children;
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
