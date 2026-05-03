import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// Category select. On change we collapse three columns into a single
// patch — category_id (FK), category (denormalized name), and
// category_slug — so the sidebar never lands a partial-write state.
function CategoryPicker({ categoryId, categories, onChange }) {
  return (
    <div id="panel-category">
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Category</div>
      <select
        value={categoryId || ""}
        onChange={e => {
          const cat = categories.find(c => c.id === e.target.value);
          onChange({ category_id: e.target.value, ...(cat ? { category: cat.name, category_slug: cat.slug } : {}) });
        }}
        style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}
      >
        <option value="">Select category</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

export default React.memo(CategoryPicker);
