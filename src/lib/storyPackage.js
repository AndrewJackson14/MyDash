// ============================================================
// storyPackage — Anthony Phase 2 (G15)
// Bundle a story for InDesign import: headline + body in three
// formats (md/html/txt) + photo credits + image originals.
//
// Output:
//   <pub>-<issue>-<slug>/
//   ├── 01-headline.txt
//   ├── 02-body.md
//   ├── 03-body.html
//   ├── 04-body.txt
//   ├── 05-pullquotes.txt
//   ├── 06-photo-credits.txt
//   ├── 07-meta.json
//   └── images/
//       ├── featured.jpg
//       ├── inline-01.jpg
//       └── captions.txt
//
// JSZip is lazy-loaded — same pattern as storyImagesBundle so the
// bundle penalty only hits when Anthony actually clicks [Pkg].
// ============================================================
let JSZipPromise = null;
function loadJSZip() {
  if (!JSZipPromise) JSZipPromise = import("jszip").then(m => m.default || m);
  return JSZipPromise;
}

function safeFilename(name, fallback = "file") {
  const base = String(name || fallback).trim();
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || fallback;
}

// Strip HTML to plain text. Preserves paragraph breaks as double
// newlines and list items as bulleted lines so the output reads
// naturally in InDesign's plain-text paste.
function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  // pull blockquote contents and tag them so the pullquote extractor
  // can find them after the strip
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/p\s*>/gi, "\n\n");
  s = s.replace(/<\s*\/h[1-6]\s*>/gi, "\n\n");
  s = s.replace(/<\s*li[^>]*>/gi, "• ");
  s = s.replace(/<\s*\/li\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  // decode common entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // collapse 3+ blank lines
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// HTML → Markdown. Handles the common tiptap output: h1-h6, p, strong,
// em, a, ul/ol/li, blockquote. Anything fancier falls through to plain
// text — designers can still paste into InDesign's rich-text field
// from body.html if they need full fidelity.
function htmlToMarkdown(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "  \n");
  s = s.replace(/<h1[^>]*>(.*?)<\/h1>/gis, "\n# $1\n");
  s = s.replace(/<h2[^>]*>(.*?)<\/h2>/gis, "\n## $1\n");
  s = s.replace(/<h3[^>]*>(.*?)<\/h3>/gis, "\n### $1\n");
  s = s.replace(/<h4[^>]*>(.*?)<\/h4>/gis, "\n#### $1\n");
  s = s.replace(/<h5[^>]*>(.*?)<\/h5>/gis, "\n##### $1\n");
  s = s.replace(/<h6[^>]*>(.*?)<\/h6>/gis, "\n###### $1\n");
  s = s.replace(/<strong[^>]*>(.*?)<\/strong>/gis, "**$1**");
  s = s.replace(/<b[^>]*>(.*?)<\/b>/gis, "**$1**");
  s = s.replace(/<em[^>]*>(.*?)<\/em>/gis, "*$1*");
  s = s.replace(/<i[^>]*>(.*?)<\/i>/gis, "*$1*");
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "[$2]($1)");
  s = s.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_m, inner) => "\n" + inner.split("\n").map(l => "> " + l).join("\n") + "\n");
  s = s.replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n");
  s = s.replace(/<\/(?:ul|ol)>/gi, "\n");
  s = s.replace(/<(?:ul|ol)[^>]*>/gi, "\n");
  s = s.replace(/<p[^>]*>/gi, "");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// Pull <blockquote> contents out of the body for pullquotes.txt.
function extractPullquotes(html) {
  if (!html) return [];
  const out = [];
  const re = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = htmlToText(m[1]);
    if (t) out.push(t);
  }
  return out;
}

// Public entry. story is the in-memory app shape (not raw DB row).
// images is an array of { url, file_name, caption, photo_credit }.
// pubName / issueLabel come from the dashboard's lookup helpers.
export async function downloadStoryPackage({ story, images = [], pubName = "", issueLabel = "" }) {
  const slugSeed = (story.slug || story.title || "story").toLowerCase().replace(/\s+/g, "-").slice(0, 60);
  const slug = safeFilename(slugSeed, "story");
  const folderBase = [pubName, issueLabel, slug].filter(Boolean).map(p => safeFilename(p)).join("-") || slug;

  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder(folderBase);

  // 01-headline.txt — single sheet with title + deck + byline + word count
  const headlineLines = [
    story.title || "(untitled)",
    story.deck ? "" : null, story.deck || null,
    "",
    `By ${story.author || "(no byline)"}`,
    pubName && issueLabel ? `${pubName} — ${issueLabel}` : (pubName || issueLabel || ""),
    story.due_date || story.dueDate ? `Due: ${story.due_date || story.dueDate}` : null,
    "",
    `Words: ${story.word_count || story.wordCount || 0}${story.word_limit ? ` / ${story.word_limit} limit` : ""}`,
  ].filter(l => l !== null);
  root.file("01-headline.txt", headlineLines.join("\n"));

  // 02–04 — body in three formats
  const bodyHtml = story.body || "";
  root.file("02-body.md", htmlToMarkdown(bodyHtml));
  root.file("03-body.html", bodyHtml);
  root.file("04-body.txt", htmlToText(bodyHtml));

  // 05-pullquotes.txt
  const quotes = extractPullquotes(bodyHtml);
  if (quotes.length > 0) {
    root.file("05-pullquotes.txt", quotes.map((q, i) => `${i + 1}. ${q}`).join("\n\n"));
  }

  // 06-photo-credits.txt
  const credits = images
    .map(i => i.photo_credit || i.photoCredit || story.photo_credit || story.photoCredit)
    .filter(Boolean);
  const uniqueCredits = [...new Set(credits)];
  if (uniqueCredits.length > 0) {
    root.file("06-photo-credits.txt", uniqueCredits.join("\n"));
  }

  // 07-meta.json — minimal machine-readable manifest
  root.file("07-meta.json", JSON.stringify({
    id: story.id,
    title: story.title,
    slug: story.slug,
    author: story.author,
    category: story.category,
    word_count: story.word_count || story.wordCount,
    word_limit: story.word_limit,
    has_images: !!story.has_images,
    page: story.page,
    jump_to_page: story.jump_to_page,
    print_issue_id: story.print_issue_id || story.print_issue_id || null,
    publication: pubName,
    issue_label: issueLabel,
    images: images.length,
    generated_at: new Date().toISOString(),
  }, null, 2));

  // images/ + captions.txt
  if (images.length > 0) {
    const imgFolder = root.folder("images");
    const seen = new Map();
    const captionLines = [];
    for (const img of images) {
      let name = safeFilename(img.file_name || "image", "image");
      const count = (seen.get(name) || 0) + 1;
      seen.set(name, count);
      if (count > 1) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`;
      }
      captionLines.push(`${name}: ${img.caption || "(no caption)"}`);
      try {
        const res = await fetch(img.url, { credentials: "omit" });
        if (!res.ok) continue;
        const blob = await res.blob();
        imgFolder.file(name, blob);
      } catch {
        // skip — single failed fetch shouldn't kill the rest
      }
    }
    imgFolder.file("captions.txt", captionLines.join("\n"));
  }

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folderBase}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
