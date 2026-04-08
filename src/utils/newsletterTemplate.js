// ============================================================
// Newsletter HTML Template Generator
// Pure function: stories + pub config → complete HTML email
// Runs client-side for instant preview, stored in html_body
// ============================================================

const PUB_CONFIG = {
  "pub-paso-robles-press": { name: "Paso Robles Press", color: "#1B3A5C", domain: "pasoroblespress.com", from: "publisher@pasoroblespress.com" },
  "pub-atascadero-news": { name: "Atascadero News", color: "#2C5F2D", domain: "atascaderonews.com", from: "publisher@atascaderonews.com" },
  "pub-the-malibu-times": { name: "The Malibu Times", color: "#0077B6", domain: "malibutimes.com", from: "news@malibutimes.com" },
};

export function getPubConfig(pubId) {
  return PUB_CONFIG[pubId] || { name: "Newsletter", color: "#333333", domain: "13stars.media", from: "news@13stars.media" };
}

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateNewsletterHtml({ stories, pubId, subject, introText }) {
  const pub = getPubConfig(pubId);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const included = (stories || []).filter(s => s.included !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const local = included.filter(s => !s.is_regional);
  const regional = included.filter(s => s.is_regional);

  const storyBlock = (s) => `
    <tr><td style="padding: 0 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${s.featured_image_url ? `<td width="140" valign="top" style="padding-right: 16px;">
          <a href="https://${pub.domain}/${s.slug}" style="text-decoration: none;">
            <img src="${escHtml(s.featured_image_url)}" alt="" width="140" height="94" style="border-radius: 4px; object-fit: cover; display: block;" />
          </a>
        </td>` : ""}
        <td valign="top">
          <div style="margin-bottom: 4px;">
            <span style="display: inline-block; padding: 2px 8px; background: ${pub.color}18; color: ${pub.color}; font-size: 11px; font-weight: 700; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.5px;">${escHtml(s.category || "News")}</span>
          </div>
          <a href="https://${pub.domain}/${s.slug}" style="text-decoration: none; color: #111;">
            <div style="font-size: 17px; font-weight: 700; line-height: 1.3; margin-bottom: 6px; font-family: Georgia, serif;">${escHtml(s.title)}</div>
          </a>
          <div style="font-size: 14px; color: #555; line-height: 1.5; margin-bottom: 4px;">${escHtml(s.blurb || s.excerpt || "")}</div>
          <a href="https://${pub.domain}/${s.slug}" style="font-size: 13px; color: ${pub.color}; font-weight: 600; text-decoration: none;">Read more &rarr;</a>
          ${s.author ? `<span style="font-size: 12px; color: #999; margin-left: 8px;">by ${escHtml(s.author)}</span>` : ""}
        </td>
      </tr></table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(subject)}</title></head>
<body style="margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f4f4;">
<tr><td align="center" style="padding: 24px 16px;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

    <!-- HEADER -->
    <tr><td style="background: ${pub.color}; padding: 24px 32px;">
      <div style="font-size: 22px; font-weight: 800; color: #ffffff; font-family: Georgia, serif; letter-spacing: -0.3px;">${escHtml(pub.name)}</div>
      <div style="font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px;">${today}</div>
    </td></tr>

    <!-- INTRO -->
    ${introText ? `<tr><td style="padding: 24px 32px 0;">
      <div style="font-size: 15px; color: #333; line-height: 1.6; border-left: 3px solid ${pub.color}; padding-left: 14px; font-style: italic;">${escHtml(introText)}</div>
    </td></tr>` : ""}

    <!-- LOCAL STORIES -->
    <tr><td style="padding: 24px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${local.map(s => storyBlock(s)).join("")}
      </table>
    </td></tr>

    ${regional.length > 0 ? `
    <!-- REGIONAL DIVIDER -->
    <tr><td style="padding: 0 32px;">
      <div style="border-top: 2px solid #e0e0e0; padding-top: 16px; margin-bottom: 8px;">
        <span style="font-size: 12px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1px;">Regional News</span>
      </div>
    </td></tr>
    <!-- REGIONAL STORIES -->
    <tr><td style="padding: 8px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${regional.map(s => storyBlock(s)).join("")}
      </table>
    </td></tr>` : ""}

    <!-- FOOTER -->
    <tr><td style="padding: 24px 32px; background: #fafafa; border-top: 1px solid #eee;">
      <div style="font-size: 12px; color: #999; line-height: 1.5; text-align: center;">
        &copy; ${new Date().getFullYear()} ${escHtml(pub.name)} &middot; 13 Stars Media Group<br>
        <a href="https://${pub.domain}" style="color: ${pub.color}; text-decoration: none;">${pub.domain}</a><br>
        <a href="https://${pub.domain}/unsubscribe" style="color: #999; text-decoration: underline; font-size: 11px;">Unsubscribe</a>
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}
