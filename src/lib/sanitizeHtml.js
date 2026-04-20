// ============================================================
// sanitizeHtml.js — centralised DOMPurify wrapper
//
// Every `dangerouslySetInnerHTML={{ __html: ... }}` in MyDash should
// flow through this helper so sanitization rules are consistent and
// easy to tighten in one place. Current default (below) strips every
// event handler, javascript: URLs, SVG script namespaces, form/iframe
// elements, and anything the DOMPurify default block list already
// catches.
//
// For cases where richer markup is actually wanted (e.g. tiptap
// rendering embedded images + links in story bodies), pass a custom
// config — but prefer tightening here over widening per-callsite.
//
// Audit reference: AUDIT-2026-04-20 S-10.
// ============================================================
import DOMPurify from "dompurify";

// Tighter than DOMPurify's default. DOMPurify allows SVG + MathML by
// default; we don't render either, and SVG is a documented XSS vector
// in email/story contexts. Also disallow forms entirely (no place for
// them inside legacy WP article bodies) and anything with a target=_top.
const BASE_CONFIG = {
  USE_PROFILES: { html: true },              // html only, no svg/mathml
  FORBID_TAGS:  ["form", "input", "button", "style", "iframe", "object", "embed"],
  FORBID_ATTR:  ["formaction", "ping", "target"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

// Escape hatch: callers can merge their own config over BASE_CONFIG.
// (Pass null / omit to use the defaults.)
export function sanitizeHtml(html, overrides) {
  if (html == null) return "";
  const config = overrides ? { ...BASE_CONFIG, ...overrides } : BASE_CONFIG;
  return DOMPurify.sanitize(String(html), config);
}

// Convenience for the common `dangerouslySetInnerHTML` pattern:
//   <div {...safeHtml(story.body)} />
export function safeHtml(html, overrides) {
  return { dangerouslySetInnerHTML: { __html: sanitizeHtml(html, overrides) } };
}
