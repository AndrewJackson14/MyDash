import { useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../../../lib/theme";
import { TokenAdminMenu } from "../../../../components/TokenAdminMenu";
import SendPortfolioModal from "./SendPortfolioModal";

// Anthony P5g+P5h — paired button: copy the public portfolio URL (🔗)
// or open a send modal that emails it to a contact (✉). The portal is
// /ads/<portfolio_token> rendering ClientPortfolioPortal.
export default function PortfolioLinkButton({ client }) {
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const token = client?.portfolioToken;
  const url = token ? `${window.location.origin}/ads/${token}` : "";
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };
  if (!token) return null;
  return (
    <>
      <span style={{
        display: "inline-flex", alignItems: "stretch",
        background: copied ? Z.go + "15" : Z.sf,
        border: `1px solid ${copied ? Z.go : Z.bd}`,
        borderRadius: Ri,
        overflow: "hidden",
        height: 26,
      }}>
        <button
          onClick={copy}
          title={`Copy ${url}`}
          style={{ background: "transparent", border: "none", padding: "0 10px", cursor: "pointer", color: copied ? Z.go : Z.tx, fontSize: FS.xs, fontFamily: COND, fontWeight: FW.semi, letterSpacing: 0.5, textTransform: "uppercase" }}
        >
          {copied ? "✓ Copied" : "🔗 Tearsheet portfolio"}
        </button>
        <button
          onClick={() => setSendOpen(true)}
          title="Send portfolio link to client"
          style={{ background: "transparent", border: "none", borderLeft: `1px solid ${Z.bd}`, padding: "0 10px", cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontFamily: COND }}
        >
          ✉
        </button>
      </span>
      <TokenAdminMenu
        table="clients"
        idValue={client.id}
        tokenColumn="portfolio_token"
        expiresAt={client.portfolioTokenExpiresAt}
        revokedAt={client.portfolioTokenRevokedAt}
      />
      {sendOpen && (
        <SendPortfolioModal client={client} onClose={() => setSendOpen(false)} />
      )}
    </>
  );
}
