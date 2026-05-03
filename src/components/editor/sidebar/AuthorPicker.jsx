import React, { useMemo } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import FuzzyPicker from "../../FuzzyPicker";

// Byline picker. Combines staff (filtered to editorial roles) with
// freelancers; allows a custom freeform byline for syndicated content.
// Unknown values (existing rows whose author no longer exists) appear
// at the top labelled "inactive" so the UI never silently drops them.
function AuthorPicker({ author, authors, freelancers, onChange, onCustom }) {
  const opts = useMemo(() => {
    const out = [];
    const seen = new Set();
    // Freelancers always read "Freelance" — collapsing the staff role
    // (typically "Stringer") makes the picker scannable.
    authors.forEach(a => {
      out.push({
        value: a.name,
        label: (a.name || "").replace(/[–—]/g, "-"),
        sub: a.isFreelance ? "Freelance" : (a.role || "Staff"),
      });
      seen.add(a.name);
    });
    freelancers.forEach(f => {
      if (!seen.has(f.name)) {
        out.push({
          value: f.name,
          label: f.name,
          sub: f.specialty ? "Freelance · " + f.specialty : "Freelance",
        });
        seen.add(f.name);
      }
    });
    if (author && !seen.has(author)) {
      out.unshift({ value: author, label: author, sub: "inactive" });
    }
    return out;
  }, [author, authors, freelancers]);

  return (
    <div>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Author</div>
      <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
        <div style={{ flex: 1 }}>
          <FuzzyPicker
            value={author || ""}
            onChange={onChange}
            options={opts}
            placeholder="Search author…"
            emptyLabel="No author"
            size="sm"
          />
        </div>
        <button
          type="button"
          title="Type a custom byline (freelancer, syndicated, etc.)"
          onClick={onCustom}
          style={{ padding: "0 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tm, fontSize: FS.sm, cursor: "pointer", fontFamily: COND, flexShrink: 0 }}
        >Custom byline…</button>
      </div>
    </div>
  );
}

export default React.memo(AuthorPicker);
