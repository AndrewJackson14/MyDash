// ============================================================
// @-mention helpers (shared by ChatPanel + any other composer).
//
// Stored token format: `@[Full Name](uuid)` — parseable with one
// regex, human-readable in a fallback (say, email digest), and
// survives copy-paste because it's literal text rather than DOM.
//
// Parse returns an array of { id, name, start, end } so renderers
// can split a message into text + pill segments in one pass.
// ============================================================

export const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{8,})\)/g;

export function parseMentions(text) {
  if (!text) return [];
  const out = [];
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    out.push({ id: m[2], name: m[1], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Split a message into alternating text/mention segments for rendering:
// [ {type:'text', value}, {type:'mention', id, name}, … ]
export function tokenizeMessage(text) {
  if (!text) return [];
  const segs = [];
  let cursor = 0;
  MENTION_RE.lastIndex = 0;
  let m;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > cursor) segs.push({ type: "text", value: text.slice(cursor, m.index) });
    segs.push({ type: "mention", id: m[2], name: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) segs.push({ type: "text", value: text.slice(cursor) });
  return segs;
}

// Find the "@query" token the user is currently typing (if any).
// Returns { query, start, end } where start..end is the range to
// replace when the user picks a member. Returns null if the caret
// is not inside a pending mention.
export function activeMentionAtCaret(text, caret) {
  if (caret == null || caret < 0) return null;
  // Walk backwards from the caret to the last '@' preceded by whitespace
  // or start-of-string. Abort on whitespace (no multi-word mentions).
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const query = upto.slice(at + 1);
  if (/\s/.test(query)) return null;       // @ was further back; no active token
  if (query.length > 40) return null;      // runaway typing guard
  if (at > 0 && !/\s/.test(text[at - 1])) return null; // must follow whitespace or SOS
  return { query, start: at, end: caret };
}

// Replace the active @query span with a formatted token.
export function insertMention(text, { start, end }, member) {
  const token = `@[${member.name}](${member.id})`;
  return {
    text: text.slice(0, start) + token + " " + text.slice(end),
    nextCaret: start + token.length + 1,
  };
}
