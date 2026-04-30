// markdownRenderer — minimal markdown → React.
//
// The role KB files are well-shaped and we don't want a markdown
// dependency. This handles the subset the KB actually uses:
//   - h1-h4
//   - paragraphs
//   - bullet + numbered lists
//   - tables (GFM-style)
//   - inline: **bold**, *italic*, `code`, [text](href)
//   - fenced code blocks (```)
//   - blockquotes (>)
//   - horizontal rule (---)
//
// Headings emit `id` slugs so anchors (`#contract-conversion`) jump.
// Internal MyDash links (`(/sales/...)` or `(file.md#anchor)`) get
// hooked up to onLinkClick if provided so we can intercept and route
// without a full reload. External http(s) links open in a new tab.

import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Inline parser — sequentially replaces patterns. Run on a line of
// text after block-level parsing has stripped the prefix.
function renderInline(text, key, onLinkClick) {
  if (!text) return null;
  const out = [];
  let cursor = 0;
  // Tokens with priority order — code fences first to avoid inner ** matches.
  const patterns = [
    { re: /`([^`]+)`/g,                   type: "code" },
    { re: /\*\*([^*]+)\*\*/g,             type: "bold" },
    { re: /\*([^*]+)\*/g,                 type: "italic" },
    { re: /\[([^\]]+)\]\(([^)]+)\)/g,     type: "link" },
  ];
  // Find earliest match across all patterns; consume; repeat.
  while (cursor < text.length) {
    let earliest = null;
    for (const p of patterns) {
      p.re.lastIndex = cursor;
      const m = p.re.exec(text);
      if (m && (!earliest || m.index < earliest.match.index)) {
        earliest = { pattern: p, match: m };
      }
    }
    if (!earliest) {
      out.push(text.slice(cursor));
      break;
    }
    if (earliest.match.index > cursor) out.push(text.slice(cursor, earliest.match.index));
    const k = `${key}-${out.length}`;
    if (earliest.pattern.type === "code") {
      out.push(<code key={k} style={inlineCodeStyle}>{earliest.match[1]}</code>);
    } else if (earliest.pattern.type === "bold") {
      out.push(<strong key={k}>{earliest.match[1]}</strong>);
    } else if (earliest.pattern.type === "italic") {
      out.push(<em key={k}>{earliest.match[1]}</em>);
    } else if (earliest.pattern.type === "link") {
      const href = earliest.match[2];
      const isExternal = /^https?:\/\//.test(href);
      out.push(
        <a
          key={k}
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer" : undefined}
          onClick={(e) => {
            if (!isExternal && onLinkClick) {
              e.preventDefault();
              onLinkClick(href);
            }
          }}
          style={{ color: Z.ac, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}
        >
          {earliest.match[1]}
        </a>
      );
    }
    cursor = earliest.match.index + earliest.match[0].length;
  }
  return out;
}

// Block parser — operates line-by-line, accumulating into block JSX.
export function MarkdownRenderer({ source, onLinkClick }) {
  if (!source) return null;
  const lines = source.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} style={{ border: "none", borderTop: `1px solid ${Z.bd}`, margin: "20px 0" }} />);
      i++; continue;
    }

    // Heading (# through ####)
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const id = slugify(text);
      const sizes = { 1: 28, 2: 22, 3: 17, 4: 14 };
      const fontFamily = level <= 2 ? DISPLAY : COND;
      const weight = level === 1 ? FW.black : level === 2 ? FW.heavy : FW.bold;
      const margin = level === 1 ? "0 0 12px" : level === 2 ? "24px 0 10px" : "16px 0 8px";
      const Tag = `h${level}`;
      blocks.push(
        <Tag key={`h-${i}`} id={id} style={{
          margin, fontFamily, fontWeight: weight,
          fontSize: sizes[level], color: Z.tx, lineHeight: 1.25,
        }}>
          {renderInline(text, `h-${i}`, onLinkClick)}
        </Tag>
      );
      i++; continue;
    }

    // Fenced code block
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      i++; // consume closing fence
      blocks.push(
        <pre key={`pre-${i}`} style={{
          background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
          padding: 12, fontSize: FS.xs, fontFamily: "ui-monospace, SFMono-Regular, monospace",
          color: Z.tx, overflow: "auto", margin: "10px 0",
        }}><code>{buf.join("\n")}</code></pre>
      );
      continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`bq-${i}`} style={{
          borderLeft: `3px solid ${Z.bd}`, paddingLeft: 12, margin: "10px 0",
          color: Z.tm, fontStyle: "italic", fontSize: FS.sm,
        }}>{renderInline(buf.join(" "), `bq-${i}`, onLinkClick)}</blockquote>
      );
      continue;
    }

    // Table (GFM-style: header | header / ---|--- / cell | cell)
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      const headers = line.split("|").slice(1, -1).map(c => c.trim());
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i++;
      }
      blocks.push(
        <div key={`tbl-${i}`} style={{ overflowX: "auto", margin: "10px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm }}>
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${Z.bd}`, color: Z.td, fontFamily: COND, fontWeight: FW.heavy, fontSize: FS.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {renderInline(h, `th-${hi}`, onLinkClick)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "8px 10px", borderBottom: `1px solid ${Z.bd}25`, color: Z.tx, verticalAlign: "top" }}>
                      {renderInline(cell, `td-${ri}-${ci}`, onLinkClick)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{ margin: "8px 0", paddingLeft: 22 }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 4, color: Z.tx, fontSize: FS.sm, lineHeight: 1.5 }}>
              {renderInline(it, `li-${i}-${ii}`, onLinkClick)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} style={{ margin: "8px 0", paddingLeft: 22 }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 4, color: Z.tx, fontSize: FS.sm, lineHeight: 1.5 }}>
              {renderInline(it, `li-${i}-${ii}`, onLinkClick)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line — paragraph break (handled implicitly).
    if (/^\s*$/.test(line)) { i++; continue; }

    // Paragraph — accumulate until next block-level construct or blank line.
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>|```|---\s*$|\|)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    blocks.push(
      <p key={`p-${i}`} style={{ margin: "0 0 10px", color: Z.tx, fontSize: FS.sm, lineHeight: 1.55 }}>
        {renderInline(buf.join(" "), `p-${i}`, onLinkClick)}
      </p>
    );
  }

  return <>{blocks}</>;
}

const inlineCodeStyle = {
  background: Z.bg,
  border: `1px solid ${Z.bd}`,
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: "0.92em",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};
