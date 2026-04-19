// Mirrors the CASE in migration 062. Single source of truth for the
// sales.product_type → invoice_lines.transaction_type derivation, used by
// every invoice_line INSERT path so new rows satisfy the NOT NULL + FK to
// qbo_account_mapping set up in migration 063.
export const deriveTransactionType = (productType) => {
  switch (productType) {
    case "display_print":      return "display_ad";
    case "web_ad":             return "web_ad";
    case "web_display":        return "web_ad";
    case "classified":         return "newspaper_svc_classified";
    case "legal_notice":       return "newspaper_svc_legal_notice";
    case "sponsored_content":
    case "newsletter_sponsor":
    case "eblast":
    case "social_sponsor":
    case "social_sponsored":
      return "sponsorship";
    case "creative_service":   return "other_income";
    default:                   return "other_income";
  }
};
