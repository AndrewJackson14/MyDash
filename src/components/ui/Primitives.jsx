// ============================================================
// Shared UI Primitives — MyDash Editorial Monochrome
// R = 5px card radius, Ri = 3px internal radius, SP = spacing
// ============================================================
import { Z, SC, COND, DISPLAY, R, Ri, SP, TBL, CARD, FS, FW, INPUT, BTN, MODAL, LABEL, TOGGLE, AVATAR, ZI, INV, isDark as _isDark } from "../../lib/theme";
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
  const glassBg = isDark ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)";
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)";
  const headerBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
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

export const Btn = ({ children, v = "primary", sm, onClick, style, disabled }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: BTN.radius, fontWeight: BTN.fontWeight, fontSize: sm ? FS.sm : BTN.fontSize, fontFamily: COND, transition: "opacity 0.15s", padding: sm ? BTN.padSm : BTN.pad, opacity: disabled ? 0.4 : 1 };
  const variants = {
    primary:   { background: Z.go, color: INV.light },
    success:   { background: Z.go, color: INV.light },
    secondary: { background: Z.tx, color: Z.bg },
    ghost:     { background: "transparent", color: Z.tx, border: "none", textDecoration: "underline", textUnderlineOffset: 3 },
    danger:    { background: Z.da, color: INV.light },
    warning:   { background: Z.wa, color: INV.light },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[v], ...style }}>{children}</button>;
};

const labelStyle = { fontSize: LABEL.fontSize, fontWeight: LABEL.fontWeight, color: Z.td, letterSpacing: LABEL.letterSpacing, textTransform: LABEL.textTransform, fontFamily: COND };

export const Inp = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<input style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: INPUT.radius, padding: INPUT.pad, color: Z.tx, fontSize: INPUT.fontSize, outline: "none" }} {...p} /></div>;

export const Sel = ({ label, options, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<div style={{ position: "relative" }}><select style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: INPUT.radius, padding: "9px 32px 9px 14px", color: Z.tx, fontSize: INPUT.fontSize, outline: "none", width: "100%", cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }} {...p}>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select><div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: Z.tm, fontSize: FS.micro }}>▼</div></div></div>;

export const TA = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{label && <label style={labelStyle}>{label}</label>}<textarea style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: INPUT.radius, padding: "11px 14px", color: Z.tx, fontSize: INPUT.fontSize, outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} {...p} /></div>;

export const Card = ({ children, style }) => <div style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad, ...style }}>{children}</div>;

export const SB = ({ value, onChange, placeholder }) => <div style={{ position: "relative", flex: 1, maxWidth: 280 }}><div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: Z.td }}><Ic.search size={15} /></div><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Search..."} style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "9px 14px 9px 34px", color: Z.tx, fontSize: FS.base, outline: "none", boxSizing: "border-box" }} /></div>;

export const TB = ({ tabs, active, onChange }) => <div style={{ display: "flex", gap: 16 }}>{tabs.map(t => <button key={t} onClick={() => onChange(t)} style={{ padding: "0 0 4px", borderRadius: 0, border: "none", borderBottom: active === t ? `2px solid ${Z.tx}` : "2px solid transparent", cursor: "pointer", fontSize: FS.base, fontWeight: active === t ? 700 : 600, fontFamily: COND, background: "transparent", color: active === t ? Z.tx : Z.td }}>{t}</button>)}</div>;

export const Stat = ({ label, value, sub }) => <div style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad }}><div style={{ ...labelStyle, marginBottom: 8 }}>{label}</div><div style={{ fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, letterSpacing: -0.5, fontFamily: DISPLAY }}>{value}</div>{sub && <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 4 }}>{sub}</div>}</div>;

export const Modal = ({ open, onClose, title, children, width = MODAL.defaultWidth, onSubmit }) => { if (!open) return null; return <div tabIndex={-1} style={{ position: "fixed", inset: 0, background: MODAL.backdropBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: ZI.max, backdropFilter: MODAL.backdropBlur, outline: "none" }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") { onClose(); } if (e.key === "Enter" && !e.shiftKey && onSubmit && !["TEXTAREA", "SELECT", "INPUT"].includes(e.target.tagName)) { e.preventDefault(); onSubmit(); } }}><div onClick={e => e.stopPropagation()} style={{ background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: MODAL.radius + 2, width, maxWidth: "92vw", maxHeight: "85vh", overflow: "auto" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: MODAL.pad, borderBottom: `1px solid ${Z.bd}` }}><h3 style={{ margin: 0, fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm }}><Ic.close size={18} /></button></div><div style={{ padding: 24 }}>{children}</div></div></div>; };

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
// Pill — small toggle/filter button with optional icon
// ============================================================
export const Pill = ({ label, icon: Icon, active, onClick, color, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "4px 10px", borderRadius: Ri,
    border: `1px solid ${active ? Z.tm : Z.bd}`,
    background: active ? (color || Z.ac) + "12" : "transparent",
    color: active ? (color || Z.tx) : Z.td,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: FS.xs, fontWeight: active ? FW.bold : FW.semi, fontFamily: COND,
    whiteSpace: "nowrap", transition: "all 0.15s",
    opacity: disabled ? 0.5 : 1,
  }}>
    {Icon && <Icon size={11} />}
    {label}
  </button>
);

// ============================================================
// Global Layout Components — used across all pages
// ============================================================

// Glass effect — reusable inline style mixin for frosted glass appearance
export const glass = () => ({
  background: _isDark() ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)",
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${_isDark() ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`,
});

export const GlassCard = ({ children, style, noPad }) => <div style={{
  ...glass(),
  borderRadius: R, padding: noPad ? 0 : "22px 24px", ...style,
}}>{children}</div>;

// ListCard — individual frosted glass card for list items (floating cards with gap)
export const ListCard = ({ children, style, onClick, active }) => <div onClick={onClick} style={{
  background: _isDark() ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)",
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${_isDark() ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`,
  borderRadius: CARD.radius, padding: CARD.pad,
  cursor: onClick ? "pointer" : "default",
  transition: "background 0.1s",
  ...(active ? { background: _isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" } : {}),
  ...style,
}} onMouseEnter={e => { if (onClick) e.currentTarget.style.background = _isDark() ? "rgba(255,255,255," + CARD.hoverAlpha + ")" : "rgba(0,0,0," + CARD.hoverAlpha + ")"; }}
   onMouseLeave={e => { e.currentTarget.style.background = active ? (_isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : (_isDark() ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)"); }}
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
export const GlassStat = ({ label, value, sub }) => <div style={{
  background: _isDark() ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)",
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${_isDark() ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`,
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
