// marketingTemplate.js — Generates marketing email HTML
// Visual design: hero images, publication photography, bold colors
// Supports: rate cards, pub launches, events, seasonal campaigns

const NAVY = "#1A365D";
const RED = "#C53030";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const DIVIDER = "#E5E7EB";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * @param {object} params
 * @param {string} params.headline - Main headline
 * @param {string} params.subheadline - Subheadline
 * @param {string} params.heroImageUrl - Full URL to hero image on BunnyCDN
 * @param {string} params.bodyHtml - Rich HTML body content (from TipTap)
 * @param {string} params.ctaText - Call to action button text
 * @param {string} params.ctaUrl - Call to action URL
 * @param {string} params.publicationName - Publication name for branding
 * @param {string} params.unsubscribeUrl - Unsubscribe link (CAN-SPAM)
 * @param {string} params.trackingPixelUrl - Open tracking pixel
 */
export function generateMarketingHtml({
  headline, subheadline, heroImageUrl, bodyHtml,
  ctaText, ctaUrl, publicationName, unsubscribeUrl, trackingPixelUrl,
}) {
  const brandName = publicationName || "13 Stars Media Group";

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5"><tr><td align="center" style="padding:20px 0">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- MASTHEAD -->
  <tr><td style="padding:24px 40px;text-align:center;background:${NAVY}">
    <div style="font-family:${SERIF};font-size:22px;color:#ffffff">${brandName}</div>
  </td></tr>

  <!-- HERO IMAGE -->
  ${heroImageUrl ? `<tr><td style="padding:0;font-size:0;line-height:0">
    <img src="${heroImageUrl}" alt="${headline || ""}" width="640" style="width:100%;display:block;border:0" />
  </td></tr>` : ""}

  <!-- HEADLINE -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:28px;color:${NAVY};line-height:1.3">${headline || ""}</div>
    ${subheadline ? `<div style="font-family:${SANS};font-size:14px;color:${GRAY};margin-top:8px;line-height:1.5">${subheadline}</div>` : ""}
  </td></tr>

  <!-- RED ACCENT -->
  <tr><td style="padding:20px 80px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:2px solid ${RED};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- BODY CONTENT -->
  <tr><td style="padding:24px 40px 0">
    <div style="font-family:${SANS};font-size:14px;color:${BLACK};line-height:1.7">${bodyHtml || ""}</div>
  </td></tr>

  <!-- CTA BUTTON -->
  ${ctaText && ctaUrl ? `<tr><td style="padding:28px 40px;text-align:center">
    <table cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="background:${NAVY};padding:14px 48px">
        <a href="${ctaUrl}" style="font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${ctaText}</a>
      </td>
    </tr></table>
  </td></tr>` : ""}

  <!-- FOOTER -->
  <tr><td style="padding:24px 40px 32px;background:#f9fafb">
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center">${brandName}</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">P.O. Box 427, Paso Robles, CA 93447 &middot; 805-237-6060</div>
    ${unsubscribeUrl ? `<div style="font-family:${SANS};font-size:10px;color:${GRAY_LT};text-align:center;margin-top:8px"><a href="${unsubscribeUrl}" style="color:${GRAY_LT}">Unsubscribe</a> from marketing emails</div>` : ""}
  </td></tr>

</table>
</td></tr></table>
${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />` : ""}`;
}
