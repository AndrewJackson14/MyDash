// ============================================================
// Advertiser eBlast HTML Template
//
// Assembles a dedicated sponsored send around a tiptap-authored
// body. Soft sponsored marking (small italic line at the top +
// "paid message" disclaimer at the bottom) — avoids the loud
// "SPONSORED" ribbon feel while staying CAN-SPAM compliant.
//
// Pass forSending: true to inject the {{SEND_ID}} open pixel and
// wrap outbound <a href>s through the email-click redirector.
// {{UNSUB_TOKEN}} is substituted per-recipient in the send edge
// function.
// ============================================================
import { EDGE_FN_URL } from "../lib/supabase";
import { getPubConfig } from "./newsletterTemplate";

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function trackifyLinks(html) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_, url) =>
    `href="${EDGE_FN_URL}/email-click?s={{SEND_ID}}&u=${encodeURIComponent(url)}"`
  );
}

export function generateEblastHtml({
  pubId,
  subject,
  preheader,
  advertiser_name,
  advertiser_website,
  advertiser_logo_url,
  advertiser_address,
  advertiser_phone,
  body_html,
  cta_text,
  cta_url,
  forSending = false,
} = {}) {
  const pub = getPubConfig(pubId);
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const advName = advertiser_name || "Our partners";
  const advSite = advertiser_website ? (advertiser_website.startsWith("http") ? advertiser_website : `https://${advertiser_website}`) : "";
  const ctaHref = cta_url ? (cta_url.startsWith("http") ? cta_url : `https://${cta_url}`) : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(subject || advName)}</title>
${preheader ? `<meta name="description" content="${escHtml(preheader)}" />` : ""}
</head>
<body style="margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a;">

${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f4f4;">${escHtml(preheader)}</div>` : ""}

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f4f4;">
<tr><td align="center" style="padding: 24px 16px;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

    <!-- Color bar -->
    <tr><td style="height: 6px; background: ${pub.color}; line-height: 6px; font-size: 0;">&nbsp;</td></tr>

    <!-- Pub header strip -->
    <tr><td style="padding: 20px 32px 4px;">
      <div style="font-size: 13px; font-weight: 700; color: ${pub.color}; font-family: Georgia, serif; letter-spacing: 0.5px; text-transform: uppercase;">${escHtml(pub.name)}</div>
      <div style="font-size: 12px; color: #999; font-style: italic; margin-top: 2px;">A message from our partners at ${escHtml(advName)}</div>
    </td></tr>

    ${advertiser_logo_url ? `
    <!-- Advertiser logo -->
    <tr><td align="center" style="padding: 24px 32px 8px;">
      ${advSite
        ? `<a href="${escHtml(advSite)}" style="display:inline-block;"><img src="${escHtml(advertiser_logo_url)}" alt="${escHtml(advName)}" style="max-width: 220px; max-height: 100px; display: block; margin: 0 auto;" /></a>`
        : `<img src="${escHtml(advertiser_logo_url)}" alt="${escHtml(advName)}" style="max-width: 220px; max-height: 100px; display: block; margin: 0 auto;" />`}
    </td></tr>` : ""}

    <!-- Body (tiptap HTML) -->
    <tr><td style="padding: 24px 40px; font-size: 16px; line-height: 1.65; color: #1a1a1a;">
      ${body_html || `<p style="color:#999;font-style:italic;">Body content goes here.</p>`}
    </td></tr>

    ${ctaHref ? `
    <!-- CTA -->
    <tr><td align="center" style="padding: 8px 40px 32px;">
      <a href="${escHtml(ctaHref)}" style="display: inline-block; padding: 14px 32px; background: ${pub.color}; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 4px; letter-spacing: 0.3px; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;">
        ${escHtml(cta_text || "Learn more")}
      </a>
    </td></tr>` : ""}

    <!-- Advertiser contact block -->
    <tr><td style="padding: 0 40px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e6e6e6; padding-top: 20px;">
        <tr><td align="center" style="padding-top: 20px;">
          <div style="font-size: 15px; font-weight: 700; color: #333; margin-bottom: 6px;">${escHtml(advName)}</div>
          ${advertiser_address ? `<div style="font-size: 12px; color: #888; line-height: 1.5;">${escHtml(advertiser_address)}</div>` : ""}
          ${advertiser_phone ? `<div style="font-size: 12px; color: #888;">${escHtml(advertiser_phone)}</div>` : ""}
          ${advSite ? `<div style="font-size: 12px; margin-top: 4px;"><a href="${escHtml(advSite)}" style="color: ${pub.color}; text-decoration: none; font-weight: 600;">${escHtml(advSite.replace(/^https?:\/\//, ""))}</a></div>` : ""}
        </td></tr>
      </table>
    </td></tr>

    <!-- Disclaimer + pub footer -->
    <tr><td style="padding: 20px 32px 24px; background: #fafafa; border-top: 1px solid #eee;">
      <div style="font-size: 11px; color: #999; line-height: 1.5; text-align: center;">
        This is a paid message from ${escHtml(advName)}, delivered to ${escHtml(pub.name)} newsletter subscribers.<br>
        &copy; ${new Date().getFullYear()} ${escHtml(pub.name)} &middot; 13 Stars Media Group &middot; ${today}<br>
        <a href="https://${pub.domain}" style="color: ${pub.color}; text-decoration: none;">${pub.domain}</a><br>
        ${forSending
          ? `<a href="${EDGE_FN_URL}/unsubscribe?t={{UNSUB_TOKEN}}" style="color: #999; text-decoration: underline; font-size: 10px;">Unsubscribe</a>`
          : `<span style="color: #999; font-size: 10px;">Unsubscribe link will appear here</span>`}
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
${forSending ? `<img src="${EDGE_FN_URL}/email-open?s={{SEND_ID}}" width="1" height="1" alt="" style="display:none" />` : ""}
</body></html>`;

  return forSending ? trackifyLinks(html) : html;
}
