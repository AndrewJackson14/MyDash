// ============================================================
// DataDeletion.jsx — Public Data Deletion Instructions page
// No auth required — accessed via /data-deletion
//
// Required by Meta's Platform Terms (Section 3(d)(i)) for any app
// using Facebook Login. We use the simpler "instructions URL" path
// rather than the programmatic callback — users contact us by email
// and we delete on receipt.
// ============================================================

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB",
};

export default function DataDeletion() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tx, padding: "48px 24px", fontFamily: "Geist Variable, ui-sans-serif, system-ui" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: C.sf, padding: "40px 36px", borderRadius: 12, border: `1px solid ${C.bd}` }}>
        <div style={{ fontSize: 12, color: C.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>13 Stars Media · MyDash</div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 40, fontWeight: 700, margin: "0 0 18px", lineHeight: 1.15 }}>
          Data Deletion Instructions
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.55, color: C.tm, marginTop: 0 }}>
          MyDash is an internal operations tool used by 13 Stars Media to manage editorial,
          advertising, and social-media publishing for our owned publications. The app is not
          available to the general public.
        </p>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8, color: C.tx }}>What data we store</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.tm, margin: 0 }}>
          When a publication owner connects a Facebook Page or Instagram Business account
          through MyDash, we store an access token (used to publish on the connected
          account&rsquo;s behalf) along with the account&rsquo;s public id and display name. We also
          store the text and any images of posts you compose or schedule, plus the results
          of those posts (success/failure, permalink, timestamp).
        </p>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8, color: C.tx }}>How to request deletion</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.tm, margin: 0 }}>
          To have your data removed from MyDash, contact us at{" "}
          <a href="mailto:accounts@13stars.media" style={{ color: C.ac, textDecoration: "underline" }}>
            accounts@13stars.media
          </a>
          {" "}with the subject line <em>&ldquo;MyDash data deletion&rdquo;</em>. Include the Facebook Page name,
          Instagram handle, or X handle you want removed. We will:
        </p>
        <ul style={{ fontSize: 15, lineHeight: 1.7, color: C.tm, marginTop: 8 }}>
          <li>Revoke the stored access token and delete the connection record.</li>
          <li>Delete all post drafts, scheduled posts, and post-result history tied to that account.</li>
          <li>Confirm completion by email within <strong>30 days</strong> of receipt.</li>
        </ul>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8, color: C.tx }}>Self-service disconnect</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.tm, margin: 0 }}>
          If you are a 13 Stars Media team member with MyDash access, you can disconnect a
          social account at any time by opening the publication in <em>Publications</em>, scrolling
          to <em>Social Accounts</em>, and clicking <em>Disconnect</em>. This removes the connection
          and the stored access token immediately. To also delete post history, follow the
          email instructions above.
        </p>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8, color: C.tx }}>Revoking through Facebook</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.tm, margin: 0 }}>
          You can also revoke MyDash&rsquo;s access from your Facebook account directly:{" "}
          <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noreferrer" style={{ color: C.ac, textDecoration: "underline" }}>
            Facebook Settings &rarr; Business Integrations
          </a>
          . Find &ldquo;MyDash&rdquo; in the list and remove it. This invalidates our token but does not
          delete post history we have already stored &mdash; for that, email us as above.
        </p>

        <div style={{ marginTop: 36, paddingTop: 18, borderTop: `1px solid ${C.bd}`, fontSize: 13, color: C.td }}>
          13 Stars Media &middot; <a href="https://mydash.media" style={{ color: C.td, textDecoration: "none" }}>mydash.media</a> &middot; Last updated 2026-04-27
        </div>
      </div>
    </div>
  );
}
