import { useMemo, useState } from "react";

// Column-sort hook + matching <th> component. Shared across Reports tables so
// sortable lists behave consistently (click cycles asc/desc, numeric columns
// default to desc on first click, text columns default to asc).
export const useSortable = (rows, initialCol, initialDir = "desc") => {
  const [sortCol, setSortCol] = useState(initialCol);
  const [sortDir, setSortDir] = useState(initialDir);

  const handleSort = (col, numeric = false) => {
    if (sortCol === col) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(numeric ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortCol || !rows) return rows || [];
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [rows, sortCol, sortDir]);

  return { sorted, sortCol, sortDir, handleSort };
};

// Replace <th>Label</th> with <SortTh col="key" label="Label" numeric
// sortCol sortDir onSort={handleSort} /> to get click-to-sort behavior.
export const SortTh = ({ col, label, sortCol, sortDir, onSort, numeric, align, style }) => (
  <th
    onClick={() => onSort(col, !!numeric)}
    style={{
      cursor: "pointer",
      textAlign: align || (numeric ? "right" : "left"),
      userSelect: "none",
      ...style,
    }}
  >
    {label}
    {sortCol === col && (
      <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    )}
  </th>
);
