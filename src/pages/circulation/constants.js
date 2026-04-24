// Shared constants for the Circulation module. Kept as plain data so
// tab files can import without pulling in React components.
import { Z } from "../../lib/theme";

export const SUB_TYPES = [
  { value: "print", label: "Print" },
  { value: "digital", label: "Digital" },
];

export const SUB_STATUSES = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
];

export const SUB_STATUS_COLORS = {
  active:    { bg: Z.ss, text: Z.su },
  expired:   { bg: Z.ws, text: Z.wa },
  cancelled: { bg: Z.ds, text: Z.da },
  pending:   { bg: Z.sa, text: Z.tm },
};

export const LOC_TYPES = [
  "newsstand", "coffee_shop", "hotel", "business_center",
  "restaurant", "retail", "other",
];

export const ROUTE_FREQS = [
  { value: "weekly",    label: "Weekly" },
  { value: "bi_weekly", label: "Bi-Weekly" },
  { value: "monthly",   label: "Monthly" },
  { value: "per_issue", label: "Per Issue" },
];

export const EXPORT_COLUMNS = [
  { key: "firstName",    label: "First Name" },
  { key: "lastName",     label: "Last Name" },
  { key: "addressLine1", label: "Address" },
  { key: "addressLine2", label: "Address 2" },
  { key: "city",         label: "City" },
  { key: "state",        label: "State" },
  { key: "zip",          label: "ZIP" },
  { key: "phone",        label: "Phone" },
  { key: "email",        label: "Email" },
  { key: "publicationId",label: "Publication" },
  { key: "type",         label: "Type" },
  { key: "status",       label: "Status" },
  { key: "expiryDate",   label: "Expiry" },
  { key: "startDate",    label: "Start Date" },
  { key: "renewalDate",  label: "Renewal Date" },
  { key: "amountPaid",   label: "Amount Paid" },
  { key: "source",       label: "Source" },
  { key: "notes",        label: "Notes" },
];

export const PRINTER_PRESET = [
  "firstName", "lastName", "addressLine1", "addressLine2",
  "city", "state", "zip",
];

// Drop short "The " prefix from pub names in dense UI contexts.
export const pnFor = (pubs) => (pid) => {
  const n = pubs.find(p => p.id === pid)?.name || "";
  return n.replace(/^The /, "");
};

export const todayIso = () => new Date().toISOString().slice(0, 10);
