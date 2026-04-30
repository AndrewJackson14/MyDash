// ============================================================
// /dev/typography — Press Room type-scale showcase
//
// Renders every type token, every color token, the radius scale,
// and a couple of "in context" compositions so we can sanity-check
// the system without scrolling through real pages.
//
// Dev surface only — gated to import.meta.env.DEV in App.jsx NAV.
// ============================================================

import { useEffect } from "react";
import { usePageHeader } from "../../contexts/PageHeaderContext";

const cell = {
  padding: "12px 16px",
  borderTop: "1px solid var(--rule)",
  display: "flex",
  alignItems: "baseline",
  gap: 16,
  flexWrap: "wrap",
};

const lbl = {
  flex: "0 0 200px",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-meta)",
  fontWeight: "var(--weight-mono)",
  letterSpacing: "var(--ls-meta)",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const meta = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-meta)",
  fontWeight: "var(--weight-mono)",
  letterSpacing: "var(--ls-meta)",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const SECTION_PAD = "32px 32px 8px";

function Section({ title, children }) {
  return (
    <section style={{ borderBottom: "1px solid var(--rule)" }}>
      <header style={{
        padding: SECTION_PAD,
        fontFamily: "var(--font-body)",
        fontSize: "var(--type-h4)",
        fontWeight: "var(--weight-body-bold)",
        color: "var(--ink)",
        letterSpacing: "var(--ls-headers)",
      }}>{title}</header>
      <div style={{ padding: "0 32px 24px" }}>{children}</div>
    </section>
  );
}

export default function Typography({ isActive }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Typography" }], title: "Typography" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  return (
    <div style={{
      background: "var(--canvas)",
      color: "var(--ink)",
      fontFamily: "var(--font-body)",
      minHeight: "100%",
    }}>

      {/* Page title — Cormorant display */}
      <header style={{ padding: "48px 32px 32px", borderBottom: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: "var(--type-display-xl)", fontFamily: "var(--font-display)", fontWeight: "var(--weight-display)", lineHeight: "var(--lh-display)", margin: 0 }}>
          Typography
        </h1>
        <div style={{ ...meta, marginTop: 12 }}>Press Room — Phase 3 sample</div>
      </header>

      {/* Display scale — Cormorant 600 */}
      <Section title="Display (Cormorant Garamond)">
        {[
          ["display-xl", "var(--type-display-xl)", "56 / 1.0", "Page titles, hero KPIs"],
          ["display-lg", "var(--type-display-lg)", "40 / 1.0", "Section heroes"],
          ["display-md", "var(--type-display-md)", "32 / 1.0", "KPI numbers — never below 28px"],
        ].map(([token, size, sizeLabel, use]) => (
          <div key={token} style={cell}>
            <span style={lbl}>{token} · {sizeLabel}</span>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: size,
              fontWeight: "var(--weight-display)",
              lineHeight: "var(--lh-display)",
              color: "var(--ink)",
            }}>The press is set</span>
            <span style={meta}>{use}</span>
          </div>
        ))}
        {/* Italic preview — auth/empty states only */}
        <div style={cell}>
          <span style={lbl}>display-md · italic</span>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--type-display-md)",
            fontWeight: "var(--weight-display)",
            fontStyle: "italic",
            lineHeight: "var(--lh-display)",
            color: "var(--ink)",
          }}>Welcome back</span>
          <span style={meta}>Auth screen + empty states only</span>
        </div>
      </Section>

      {/* Geist headers */}
      <Section title="Headers (Geist 700)">
        {[
          ["h3", "var(--type-h3)", 22, "Card headers, section heads"],
          ["h4", "var(--type-h4)", 18, "Subsection heads, table titles"],
          ["h5", "var(--type-h5)", 14, "Table column headers, form labels"],
        ].map(([token, size, sizeLabel, use]) => (
          <div key={token} style={cell}>
            <span style={lbl}>{token} · {sizeLabel}px</span>
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: size,
              fontWeight: "var(--weight-body-bold)",
              lineHeight: "var(--lh-heading)",
              color: "var(--ink)",
              letterSpacing: "var(--ls-headers)",
            }}>March issue runlist · 12 stories assigned</span>
            <span style={meta}>{use}</span>
          </div>
        ))}
      </Section>

      {/* Body / caption / meta */}
      <Section title="Body & meta">
        {[
          ["body",       "var(--type-body)",    "Geist 400",  14, "Default body"],
          ["body-sm",    "var(--type-body-sm)", "Geist 400",  13, "Dense table rows"],
          ["caption",    "var(--type-caption)", "Geist 500",  12, "Helper text"],
          ["meta",       "var(--type-meta)",    "Geist Mono 500, 0.08em uppercase",  11, "Metadata strip, timestamps, IDs"],
        ].map(([token, size, weightDesc, sizeLabel, use]) => (
          <div key={token} style={cell}>
            <span style={lbl}>{token} · {sizeLabel}px</span>
            <span style={{
              fontFamily: token === "meta" ? "var(--font-mono)" : "var(--font-body)",
              fontSize: size,
              fontWeight: token === "caption" ? "var(--weight-body-mid)"
                       : token === "meta"    ? "var(--weight-mono)"
                       : "var(--weight-body)",
              lineHeight: token === "meta" ? "var(--lh-meta)" : "var(--lh-body)",
              color: "var(--ink)",
              letterSpacing: token === "meta" ? "var(--ls-meta)" : "normal",
              textTransform: token === "meta" ? "uppercase" : "none",
            }}>{token === "meta"
                ? "13 stars / mydash · rev. 04.26.26"
                : "The Atascadero News printed every Tuesday this March, drawing a 4 percent rise in display ad revenue."}</span>
            <span style={meta}>{weightDesc} · {use}</span>
          </div>
        ))}
      </Section>

      {/* Numeric handling */}
      <Section title="Numerics">
        <div style={cell}>
          <span style={lbl}>tabular-nums + lining</span>
          <table style={{ borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 16px", fontSize: "var(--type-meta)", fontFamily: "var(--font-mono)", fontWeight: "var(--weight-mono)", letterSpacing: "var(--ls-meta)", textTransform: "uppercase", color: "var(--muted)" }}>Issue</th>
                <th style={{ textAlign: "right", padding: "4px 16px", fontSize: "var(--type-meta)", fontFamily: "var(--font-mono)", fontWeight: "var(--weight-mono)", letterSpacing: "var(--ls-meta)", textTransform: "uppercase", color: "var(--muted)" }}>Insertions</th>
                <th style={{ textAlign: "right", padding: "4px 16px", fontSize: "var(--type-meta)", fontFamily: "var(--font-mono)", fontWeight: "var(--weight-mono)", letterSpacing: "var(--ls-meta)", textTransform: "uppercase", color: "var(--muted)" }}>Revenue</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "lining-nums tabular-nums" }}>
              {[
                ["Mar 2026", 142, 18420],
                ["Apr 2026",  98, 12180],
                ["May 2026", 167, 22550],
              ].map(([d, n, r]) => (
                <tr key={d}>
                  <td style={{ padding: "6px 16px", fontSize: "var(--type-body-sm)" }}>{d}</td>
                  <td style={{ padding: "6px 16px", textAlign: "right", fontSize: "var(--type-body-sm)" }}>{n}</td>
                  <td style={{ padding: "6px 16px", textAlign: "right", fontSize: "var(--type-body-sm)" }}>${r.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Color swatches */}
      <Section title="Color">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {[
            ["--ink",         "Body text, primary"],
            ["--paper",       "Page background"],
            ["--card",        "Elevated surfaces"],
            ["--rule",        "Hairlines, dividers"],
            ["--muted",       "Secondary, captions"],
            ["--action",      "Primary action — navy blue"],
            ["--action-soft", "Selection, hover wash"],
            ["--accent",      "Press red — alerts/danger only"],
            ["--accent-soft", "Alert wash"],
            ["--ok",          "Success only"],
            ["--warn",        "Caution"],
          ].map(([token, use]) => (
            <div key={token} style={{
              display: "flex", flexDirection: "column", gap: 6,
              border: "1px solid var(--rule)",
              padding: 12,
              borderRadius: "var(--rad-1)",
              background: "var(--card)",
            }}>
              <div style={{
                height: 48,
                background: `var(${token})`,
                border: token === "--paper" || token === "--card"
                  ? "1px solid var(--rule)" : "none",
                borderRadius: "var(--rad-1)",
              }} />
              <div style={{ ...meta, color: "var(--ink)" }}>{token}</div>
              <div style={{ fontSize: "var(--type-caption)", fontWeight: "var(--weight-body-mid)", color: "var(--muted)" }}>{use}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Radius scale */}
      <Section title="Radius">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            ["--rad-0", "0px",   "Page chrome, table containers"],
            ["--rad-1", "2px",   "Cards, panels, modals"],
            ["--rad-2", "4px",   "Buttons, inputs, badges"],
            ["--rad-3", "6px",   "Drop zones, image previews"],
            ["--rad-pill", "pill", "Avatars, status dots"],
          ].map(([token, label, use]) => (
            <div key={token} style={{
              flex: "0 0 160px",
              border: "1px solid var(--rule)",
              padding: 12,
              borderRadius: "var(--rad-1)",
              background: "var(--card)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{
                height: 56,
                background: "var(--action-soft)",
                border: "1px solid var(--action)",
                borderRadius: `var(${token})`,
              }} />
              <div style={{ ...meta, color: "var(--ink)" }}>{token}</div>
              <div style={{ fontSize: "var(--type-caption)", color: "var(--muted)" }}>{label} · {use}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* In-context composition */}
      <Section title="In context">
        {/* KPI row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
          padding: "16px 0",
          borderBottom: "1px solid var(--rule)",
          marginBottom: 24,
        }}>
          {[
            ["Active deals",     "47", "+6 wk-over-wk"],
            ["Pipeline value",  "$284,500", "across 12 reps"],
            ["Avg close rate",   "31.4%", "rolling 90 days"],
          ].map(([label, value, sub]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ ...meta }}>{label}</span>
              <span style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--type-display-md)",
                fontWeight: "var(--weight-display)",
                lineHeight: "var(--lh-display)",
                color: "var(--ink)",
                fontVariantNumeric: "lining-nums tabular-nums",
              }}>{value}</span>
              <span style={{ fontSize: "var(--type-caption)", color: "var(--muted)" }}>{sub}</span>
            </div>
          ))}
        </div>

        {/* Editorial card */}
        <article style={{
          padding: 24,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--rad-1)",
          maxWidth: 720,
        }}>
          <div style={{ ...meta, marginBottom: 8 }}>STORY · 2026.04.26 · MARCH ISSUE</div>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--type-display-lg)",
            fontWeight: "var(--weight-display)",
            lineHeight: "var(--lh-display)",
            margin: 0,
            color: "var(--ink)",
          }}>The press is set, the deadline holds.</h2>
          <p style={{
            marginTop: 16,
            fontSize: "var(--type-body)",
            lineHeight: "var(--lh-body)",
            color: "var(--ink)",
          }}>
            Production staff scan tables all day; surrounding chrome stays generous so the density never feels claustrophobic. Asymmetry only at page-header level. No floating cards with drop shadows. Surfaces are defined by hairlines and background tone, not elevation.
          </p>
          <div style={{ marginTop: 12, fontSize: "var(--type-caption)", color: "var(--muted)" }}>
            By <span style={{ color: "var(--ink)", fontWeight: "var(--weight-body-bold)" }}>The Editor</span> · 320 words
          </div>
        </article>
      </Section>

      <footer style={{ padding: "32px", textAlign: "center" }}>
        <span style={meta}>End of typography sample</span>
      </footer>
    </div>
  );
}
