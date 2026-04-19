import { useLayoutEffect, useRef, useState } from "react";
import { Pill } from "./Primitives";
import { Z, FS, FW, COND } from "../../lib/theme";

// ============================================================
// FilterPillStrip — horizontal strip of toggleable filter pills.
//
// Single-select (default): value is a string; onChange returns the new value.
// Multi-select (multi=true): value is an array; onChange returns the new array
// with the toggled option added or removed.
//
// Slider variant (slider=true, single-select only): renders TB-style — single
// rounded container with an animated sliding background indicator on the
// active option. Useful for sub-tab rows under a top tab bar. Pairs nicely
// with `mini` for sub-filter sizing. `color` overrides the slider background
// (defaults to green Z.go to match the solid Pill active style).
//
// Multi-select mode always renders as individual pills regardless of slider.
//
// Options shape: [{ value, label, icon? }]
// onChange always receives just the next value — never the option object.
// ============================================================
export function FilterPillStrip({
  options,
  value,
  onChange,
  multi = false,
  color,           // active accent (slider bg / solid pill bg)
  solid = true,    // pill mode only — solid bg + white text on active
  slider = false,  // single-select only — TB-style sliding container
  mini = false,    // smaller padding/font for sub-filter rows
  gap = 4,
  maxHeight = null,
}) {
  const isActive = (optValue) => multi
    ? Array.isArray(value) && value.includes(optValue)
    : value === optValue;

  const handleToggle = (optValue) => {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(optValue) ? arr.filter(v => v !== optValue) : [...arr, optValue]);
    } else {
      onChange(optValue);
    }
  };

  // Slider variant — TB-style animated sliding indicator over a single
  // rounded container. Single-select only; multi falls back to pill row.
  if (slider && !multi) {
    return <SliderStrip
      options={options}
      value={value}
      onChange={handleToggle}
      color={color || Z.go}
      mini={mini}
    />;
  }

  return (
    <div style={{
      display: "flex", gap, flexWrap: "wrap",
      ...(maxHeight ? { maxHeight, overflowY: "auto", padding: 2 } : {}),
    }}>
      {options.map(opt => (
        <Pill
          key={opt.value}
          label={opt.label}
          icon={opt.icon}
          active={isActive(opt.value)}
          color={color}
          solid={solid}
          onClick={() => handleToggle(opt.value)}
        />
      ))}
    </div>
  );
}

// Internal — TB-style slider with animated background. Same animation
// pattern as <TB>: measures the active button's rect on mount + active
// change, transitions a positioned div underneath.
function SliderStrip({ options, value, onChange, color, mini }) {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [rect, setRect] = useState({ left: 0, width: 0, ready: false });
  const optionsKey = options.map(o => o.value).join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const btn = btnRefs.current[value];
    if (!container || !btn) { setRect(r => ({ ...r, ready: false })); return; }
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setRect({ left: bRect.left - cRect.left, width: bRect.width, ready: true });
  }, [value, optionsKey]);

  const pad = mini ? 3 : 4;
  const padX = mini ? 10 : 14;
  const padY = mini ? 4 : 6;
  const fs = mini ? FS.xs : FS.base;

  return <div ref={containerRef} style={{
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: pad,
    borderRadius: 999,
    background: "rgba(140,150,165,0.08)",
    border: "none",
  }}>
    <div style={{
      position: "absolute",
      top: pad,
      bottom: pad,
      left: rect.left,
      width: rect.width,
      background: color,
      borderRadius: 999,
      transition: rect.ready ? "left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)" : "none",
      opacity: rect.ready ? 1 : 0,
      pointerEvents: "none",
      zIndex: 0,
      boxShadow: rect.ready ? `0 2px 8px ${color}4D` : "none",
    }} />
    {options.map(opt => {
      const isActive = value === opt.value;
      return <button
        key={opt.value}
        ref={el => { btnRefs.current[opt.value] = el; }}
        onClick={() => onChange(opt.value)}
        style={{
          position: "relative",
          zIndex: 1,
          padding: `${padY}px ${padX}px`,
          borderRadius: 999,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: fs,
          fontWeight: isActive ? 700 : 600,
          fontFamily: COND,
          color: isActive ? "#fff" : Z.td,
          transition: "color 0.25s",
          whiteSpace: "nowrap",
        }}
      >{opt.label}</button>;
    })}
  </div>;
}
