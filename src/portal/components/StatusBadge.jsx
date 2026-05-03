// StatusBadge — small colored pill used by list rows.
import { C } from "../lib/portalUi";

const PROPOSAL_COLORS = {
  "Draft":              { bg: "#F3F4F6", fg: "#374151" },
  "Awaiting Review":    { bg: "#FEF3C7", fg: "#92400E" },
  "Sent":               { bg: "#DBEAFE", fg: "#1E40AF" },
  "Under Review":       { bg: "#FEF3C7", fg: "#92400E" },
  "Approved/Signed":    { bg: "#D1FAE5", fg: "#065F46" },
  "Signed & Converted": { bg: "#D1FAE5", fg: "#065F46" },
  "Converted":          { bg: "#D1FAE5", fg: "#065F46" },
  "Expired":            { bg: "#F3F4F6", fg: "#6B7280" },
  "Declined":           { bg: "#FEE2E2", fg: "#991B1B" },
  "Cancelled":          { bg: "#F3F4F6", fg: "#6B7280" },
};

const INVOICE_COLORS = {
  draft:           { bg: "#F3F4F6", fg: "#374151" },
  sent:            { bg: "#DBEAFE", fg: "#1E40AF" },
  partially_paid:  { bg: "#FEF3C7", fg: "#92400E" },
  paid:            { bg: "#D1FAE5", fg: "#065F46" },
  overdue:         { bg: "#FEE2E2", fg: "#991B1B" },
  void:            { bg: "#F3F4F6", fg: "#6B7280" },
};

const PROJECT_COLORS = {
  pending_creative: { bg: "#FEF3C7", fg: "#92400E" },
  in_design:        { bg: "#DBEAFE", fg: "#1E40AF" },
  preflight:        { bg: "#DBEAFE", fg: "#1E40AF" },
  proof_review:     { bg: "#FEF3C7", fg: "#92400E" },
  approved:         { bg: "#D1FAE5", fg: "#065F46" },
  running:          { bg: "#D1FAE5", fg: "#065F46" },
  completed:        { bg: "#F3F4F6", fg: "#6B7280" },
};

export function ProposalBadge({ value }) {
  return <Badge value={value} palette={PROPOSAL_COLORS} />;
}

export function InvoiceBadge({ value }) {
  return <Badge value={value} palette={INVOICE_COLORS} prettify={prettify} />;
}

export function ProjectBadge({ value }) {
  return <Badge value={value} palette={PROJECT_COLORS} prettify={prettify} />;
}

function Badge({ value, palette, prettify }) {
  if (!value) return null;
  const colors = palette[value] || { bg: "#F3F4F6", fg: C.muted };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: colors.bg, color: colors.fg,
    }}>
      {prettify ? prettify(value) : value}
    </span>
  );
}

function prettify(s) {
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
