// ============================================================
// legalFormats — pure helpers for the affidavit template + workspace.
//
// Centralised so the template, the canvas, the schedule view, and
// the "this issue" view all derive the same labels / dates / pub
// configs from a single function instead of duplicating string logic.
// ============================================================

// Map a publication's legal_pub_group + identifying fields → all the
// dynamic config the affidavit template needs.
export function getAffidavitConfig(notice, publication, signatureUrl) {
  const group = publication?.legal_pub_group || publication?.legalPubGroup || null;
  const isPrpAtn = group === "prp_atn";

  const county = isPrpAtn ? "SAN LUIS OBISPO" : "LOS ANGELES";
  const city = isPrpAtn ? "Atascadero" : "Malibu";
  const pubLine = isPrpAtn
    ? "The Paso Robles Press and The Atascadero News"
    : "The Malibu Times";
  const signatureCaption = isPrpAtn
    ? ["Legal Clerk, Cami Martin", "The Atascadero News and", "The Paso Robles Press"]
    : ["Legal Clerk, Cami Martin", "The Malibu Times"];

  // "Legal Notice" label + body derived from notice.title.
  // Format Cami uses: "<label>: <body>" — e.g. "Fictitious Business
  // Name: SURRON SUPPLY CO". Anything before the first colon is the
  // header label; the rest is the notice body.
  const rawTitle = String(notice?.title || "");
  const colon = rawTitle.indexOf(":");
  const legalLabel = (colon >= 0 ? rawTitle.slice(0, colon) : rawTitle).trim();
  const legalBody = (colon >= 0 ? rawTitle.slice(colon + 1) : "").trim();

  return {
    state: "CALIFORNIA",
    county,
    city,
    pubLine,
    legalLabel,
    legalBody,
    datesPublished: formatRunDates(notice?.run_dates || notice?.runDates || []),
    executedOn: formatExecutedDate(new Date()),
    signatureUrl: signatureUrl || null,
    signatureCaption,
  };
}

// "3/19, 3/26, 4/2, 4/9/2026" — year only on the trailing date.
// Matches Cami's hand-formatted convention from the Pages templates.
export function formatRunDates(dates) {
  const parsed = (dates || [])
    .map((d) => (typeof d === "string" ? new Date(d + "T12:00:00") : d))
    .filter((d) => d instanceof Date && !isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (!parsed.length) return "";
  const last = parsed[parsed.length - 1];
  const year = last.getFullYear();
  const head = parsed.slice(0, -1).map((d) => `${d.getMonth() + 1}/${d.getDate()}`);
  const tail = `${last.getMonth() + 1}/${last.getDate()}/${year}`;
  return [...head, tail].join(", ");
}

// "April 23, 2026" — used for the "Executed on" line on the affidavit.
export function formatExecutedDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Edition page-image URL builder.
// editions.page_images_base_url is the publication-scoped folder
// (e.g. https://cdn.13stars.media/paso-robles-press/editions).
// Layout under it: {slug}/pages/page-NNN.{format}.
export function editionPageImageUrl(edition, pageNumber) {
  if (!edition?.page_images_base_url || !edition?.slug) return null;
  const fmt = edition.page_image_format || "webp";
  const padded = String(pageNumber).padStart(3, "0");
  const base = edition.page_images_base_url.replace(/\/$/, "");
  return `${base}/${edition.slug}/pages/page-${padded}.${fmt}`;
}

// Path scheme for source page caches + clip artifacts on BunnyCDN.
// Single source of truth — workspace, lock, and purge logic all go
// through these so a future folder reshape is a one-line change.
export function legalSourceFrozenPath(noticeId, runDate, pageNumber) {
  const padded = String(pageNumber).padStart(3, "0");
  return `legal-clippings/${noticeId}/source/${runDate}-p${padded}.webp`;
}

export function legalClipPath(noticeId, suffix = "") {
  // suffix is typically a uuid + extension; allow caller-controlled
  // names so re-crops don't collide.
  const safe = (suffix || `${Date.now()}.webp`).replace(/[^A-Za-z0-9._-]+/g, "-");
  return `legal-clippings/${noticeId}/clips/${safe}`;
}

export function legalAffidavitPdfPath(noticeId, noticeNumber) {
  const safeNum = String(noticeNumber || noticeId).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `legal-affidavits/${noticeId}/${safeNum}-affidavit.pdf`;
}
