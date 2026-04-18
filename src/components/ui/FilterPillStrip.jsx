import { Pill } from "./Primitives";

// ============================================================
// FilterPillStrip — horizontal strip of toggleable filter pills.
//
// Single-select (default): value is a string; onChange returns the new value.
// Multi-select (multi=true): value is an array; onChange returns the new array
// with the toggled option added or removed.
//
// The component owns the flex/wrap container so callsites stop boilerplating
// `<div style={{display:flex, gap, flexWrap}}>`. For scrollable groups (e.g.
// long industry lists), pass `maxHeight`.
//
// Options shape: [{ value, label, icon? }]
//   - value:  the persisted identifier
//   - label:  user-facing text
//   - icon:   optional icon component (same shape <Pill> accepts)
//
// onChange always receives just the next value — never the option object.
// ============================================================
export function FilterPillStrip({
  options,
  value,
  onChange,
  multi = false,
  color,           // override active accent (defaults to green via Pill's solid mode)
  solid = true,    // active state renders as solid bg + white text
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
