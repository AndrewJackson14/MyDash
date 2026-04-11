// renewalTemplate.js — Generates renewal notice email HTML
// 3-touch drip: 30d (friendly), 14d (reminder), 7d (urgent)

const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAVY = "#1A365D";
const RED = "#C53030";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const DIVIDER = "#E5E7EB";
const GREEN = "#16A34A";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const TOUCH_CONFIG = {
  first: {
    subject: (pubName) => `Your ${pubName} subscription is coming up for renewal`,
    heading: "Time to renew",
    tone: "Your subscription is expiring soon. Renew today to keep receiving your favorite local news without interruption.",
    buttonText: "Renew Now",
    urgencyColor: NAVY,
  },
  second: {
    subject: (pubName) => `Reminder: Your ${pubName} subscription expires soon`,
    heading: "Don't miss a single issue",
    tone: "We noticed your subscription is expiring soon and we haven't heard from you yet. We'd hate for you to miss out on the local stories that matter most.",
    buttonText: "Renew Today",
    urgencyColor: "#D97706",
  },
  third: {
    subject: (pubName) => `Last chance: Your ${pubName} subscription expires this week`,
    heading: "Expiring this week",
    tone: "This is your final reminder — your subscription expires in just a few days. Act now to continue receiving your newspaper at home.",
    buttonText: "Renew Before It's Too Late",
    urgencyColor: RED,
  },
};

/**
 * @param {object} params
 * @param {string} params.subscriberName
 * @param {string} params.publicationName
 * @param {string} params.expiryDate - YYYY-MM-DD
 * @param {number} params.renewalAmount
 * @param {string} params.renewLink - URL for self-service renewal
 * @param {string} params.touch - 'first' | 'second' | 'third'
 */
export function generateRenewalHtml({ subscriberName, publicationName, expiryDate, renewalAmount, renewLink, touch = "first" }) {
  const cfg = TOUCH_CONFIG[touch] || TOUCH_CONFIG.first;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- TOP BAR -->
  <tr><td style="background:${cfg.urgencyColor};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal">${publicationName}</div>
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GRAY_LT};margin-top:4px">A 13 Stars Media Group Publication</div>
  </td></tr>

  <!-- ACCENT RULE -->
  <tr><td style="padding:20px 24px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1.5px solid ${cfg.urgencyColor};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- HEADING -->
  <tr><td style="padding:28px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:26px;color:${cfg.urgencyColor}">${cfg.heading}</div>
  </td></tr>

  <!-- GREETING + MESSAGE -->
  <tr><td style="padding:20px 40px 0">
    <div style="font-family:${SANS};font-size:14px;color:${BLACK};line-height:1.7">
      Dear ${subscriberName || "Subscriber"},<br><br>
      ${cfg.tone}
    </div>
  </td></tr>

  <!-- SUBSCRIPTION DETAILS -->
  <tr><td style="padding:24px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb">
      <tr>
        <td style="padding:16px 20px;width:50%">
          <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-transform:uppercase">Publication</div>
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${BLACK};margin-top:2px">${publicationName}</div>
        </td>
        <td style="padding:16px 20px;width:25%">
          <div style="font-family:${SANS};font-size:11px;color:${touch === "third" ? RED : GRAY_LT};text-transform:uppercase">${touch === "third" ? "EXPIRES" : "Expires"}</div>
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${touch === "third" ? RED : BLACK};margin-top:2px">${fmtDate(expiryDate)}</div>
        </td>
        <td style="padding:16px 20px;width:25%;text-align:right">
          <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-transform:uppercase">Renewal Rate</div>
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${BLACK};margin-top:2px">${fmtCurrency(renewalAmount)}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- RENEW BUTTON -->
  ${renewLink ? `<tr><td style="padding:28px 40px;text-align:center">
    <table cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="background:${cfg.urgencyColor};padding:14px 48px">
        <a href="${renewLink}" style="font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${cfg.buttonText}</a>
      </td>
    </tr></table>
  </td></tr>` : ""}

  <!-- PAYMENT OPTIONS -->
  <tr><td style="padding:0 40px">
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};margin-bottom:8px">Other ways to renew</div>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY};line-height:1.8">
      <strong>By phone:</strong> (805) 237-6060<br>
      <strong>By mail:</strong> Send check to 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447<br>
      <strong>By email:</strong> subscriptions@13stars.media
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:28px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center;margin-top:16px">${publicationName} &middot; A 13 Stars Media Group Publication</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">805-237-6060 &middot; subscriptions@13stars.media</div>
    <div style="font-family:${SANS};font-size:10px;color:${GRAY_LT};text-align:center;margin-top:8px"><a href="#unsubscribe" style="color:${GRAY_LT}">Unsubscribe from renewal reminders</a></div>
  </td></tr>

</table>
</td></tr></table>`;
}

export function getRenewalSubject(publicationName, touch = "first") {
  return (TOUCH_CONFIG[touch] || TOUCH_CONFIG.first).subject(publicationName);
}
