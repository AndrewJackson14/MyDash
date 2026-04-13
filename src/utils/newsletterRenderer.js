// ============================================================
// newsletterRenderer.js — Template → HTML renderer
// Given a template config + a pool of stories, render clean HTML
// ============================================================

const escapeHtml = (s) => String(s || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const fmtLongDate = (d) => new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ─── Token replacement ───────────────────────────────────────
function replaceTokens(str, { date, pubName, sponsor }) {
  return String(str || "")
    .replace(/\{\{date\}\}/g, fmtLongDate(date))
    .replace(/\{\{pub_name\}\}/g, pubName || "")
    .replace(/\{\{sponsor\}\}/g, sponsor || "Sponsor");
}

// ─── Select stories for a single section from a pool ─────────
export function selectStoriesForSection(section, pool) {
  const lookbackMs = (section.lookback_hours || 24) * 3600 * 1000;
  const cutoff = new Date(Date.now() - lookbackMs).toISOString();

  let candidates = pool.filter(s => (s.published_at || "") >= cutoff);

  switch (section.source) {
    case "featured":
      candidates = candidates.filter(s => s.is_featured);
      break;
    case "top_viewed":
      candidates = [...candidates].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      break;
    case "latest":
      // no filter — take latest
      break;
    default:
      if (section.source?.startsWith("category:")) {
        const slug = section.source.slice("category:".length);
        candidates = candidates.filter(s => s.category_slug === slug);
      }
  }

  // Sort by date desc unless already sorted by views
  if (section.source !== "top_viewed") {
    candidates = [...candidates].sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  }

  return candidates.slice(0, section.limit || 3);
}

// ─── Render a single story based on layout ───────────────────
function renderStory(story, layout, site) {
  const url = `https://${site.domain}/${story.slug}`;
  const title = escapeHtml(story.title);
  const cat = escapeHtml(story.category || "");
  const author = story.author ? escapeHtml(story.author) : "";
  const excerpt = escapeHtml(story.excerpt || "").slice(0, 220);
  const img = story.featured_image_url || "";
  const primary = site.primary_color || "#1a1a1a";
  const accent = site.secondary_color || "#c53030";

  if (layout === "hero") {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border-collapse:collapse;">
        <tr><td>
          ${img ? `<a href="${url}" style="text-decoration:none;"><img src="${img}" width="600" alt="${title}" style="width:100%;max-width:600px;height:auto;display:block;border:0;margin-bottom:14px;" /></a>` : ""}
          ${cat ? `<div style="font:bold 11px 'Helvetica Neue',Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${accent};margin-bottom:6px;">${cat}</div>` : ""}
          <a href="${url}" style="text-decoration:none;color:${primary};"><h2 style="font:bold 24px Georgia,'Times New Roman',serif;margin:0 0 10px;line-height:1.25;color:${primary};">${title}</h2></a>
          ${excerpt ? `<p style="font:16px Georgia,'Times New Roman',serif;margin:0 0 8px;line-height:1.5;color:#444;">${excerpt}</p>` : ""}
          ${author ? `<div style="font:13px 'Helvetica Neue',Arial,sans-serif;color:#888;">By ${author}</div>` : ""}
        </td></tr>
      </table>
    `;
  }

  if (layout === "list") {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border-collapse:collapse;">
        <tr>
          ${img ? `<td width="120" valign="top" style="padding-right:14px;"><a href="${url}"><img src="${img}" width="120" alt="" style="width:120px;height:80px;object-fit:cover;display:block;border:0;" /></a></td>` : ""}
          <td valign="top">
            ${cat ? `<div style="font:bold 10px 'Helvetica Neue',Arial,sans-serif;letter-spacing:0.8px;text-transform:uppercase;color:${accent};margin-bottom:4px;">${cat}</div>` : ""}
            <a href="${url}" style="text-decoration:none;color:${primary};"><h3 style="font:bold 17px Georgia,'Times New Roman',serif;margin:0 0 6px;line-height:1.3;color:${primary};">${title}</h3></a>
            ${author ? `<div style="font:12px 'Helvetica Neue',Arial,sans-serif;color:#888;">By ${author}</div>` : ""}
          </td>
        </tr>
      </table>
    `;
  }

  // compact
  return `
    <div style="padding:8px 0;border-bottom:1px solid #eee;">
      <a href="${url}" style="text-decoration:none;color:${primary};font:500 15px Georgia,'Times New Roman',serif;">${title}</a>
      ${author ? `<span style="font:12px 'Helvetica Neue',Arial,sans-serif;color:#888;margin-left:8px;">· ${author}</span>` : ""}
    </div>
  `;
}

// ─── Render a full section ───────────────────────────────────
function renderSection(section, stories, site) {
  if (stories.length === 0) return "";
  const accent = site.secondary_color || "#c53030";
  const heading = escapeHtml(section.heading || "");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border-collapse:collapse;">
      <tr><td>
        <div style="font:bold 12px 'Helvetica Neue',Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:${accent};padding-bottom:6px;border-bottom:2px solid ${accent};margin-bottom:18px;">${heading}</div>
        ${stories.map(s => renderStory(s, section.layout, site)).join("")}
      </td></tr>
    </table>
  `;
}

// ─── Main render ─────────────────────────────────────────────
export function renderNewsletter({ template, stories, site, sendDate, sponsor }) {
  const date = sendDate || new Date();
  const tokens = { date, pubName: site.name, sponsor };

  const subject = replaceTokens(template.subject, tokens);
  const preheader = replaceTokens(template.preheader, tokens);
  const intro = replaceTokens(template.intro, tokens);
  const footer = replaceTokens(template.footer, tokens);

  const primary = site.primary_color || "#1a1a1a";
  const logo = site.logo_url || "";

  // Build sections with story selection
  const usedIds = new Set();
  const sectionHtml = (template.sections || []).map(sec => {
    // Filter out already-shown stories to prevent duplicates across sections
    const pool = stories.filter(s => !usedIds.has(s.id));
    const selected = selectStoriesForSection(sec, pool);
    selected.forEach(s => usedIds.add(s.id));
    return renderSection(sec, selected, site);
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,'Times New Roman',serif;color:#222;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:24px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-collapse:collapse;">

      <!-- Header -->
      <tr><td style="padding:28px 32px;border-bottom:3px solid ${primary};text-align:center;">
        ${logo
          ? `<img src="${logo}" alt="${escapeHtml(site.name)}" style="max-height:50px;width:auto;display:inline-block;" />`
          : `<h1 style="margin:0;font:bold 28px Georgia,'Times New Roman',serif;color:${primary};">${escapeHtml(site.name)}</h1>`
        }
        <div style="margin-top:8px;font:12px 'Helvetica Neue',Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#888;">${fmtLongDate(date)}</div>
      </td></tr>

      <!-- Intro -->
      ${intro ? `<tr><td style="padding:24px 32px 8px;">
        <p style="margin:0;font:16px Georgia,'Times New Roman',serif;line-height:1.6;color:#444;">${escapeHtml(intro)}</p>
      </td></tr>` : ""}

      <!-- Sections -->
      <tr><td style="padding:24px 32px;">
        ${sectionHtml || `<p style="color:#888;font:14px 'Helvetica Neue',Arial,sans-serif;text-align:center;padding:40px 0;">No stories match this template.</p>`}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 32px;border-top:1px solid #eee;background:#fafafa;text-align:center;">
        <div style="font:13px 'Helvetica Neue',Arial,sans-serif;color:#888;line-height:1.6;">
          ${footer ? `${escapeHtml(footer)}<br>` : ""}
          <a href="https://${site.domain}" style="color:${primary};text-decoration:none;">${site.domain}</a>
          · <a href="#" style="color:#888;text-decoration:underline;">Unsubscribe</a>
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
