// Most constants come from sales/constants.js (zone-wide). This file
// holds the SalesCRM-specific ones that don't apply to ClientProfile,
// Contracts, etc. Wave 2 lifted them out of the SalesCRM monolith so
// the shell stays under 400 lines.

export const OPP_SOURCES = [
  "Referral", "Cold Call", "Walk-in", "Event",
  "Website Inquiry", "Social Media", "Existing Client",
];

export const LOST_REASONS = [
  "Budget cut", "Chose competitor", "Timing not right",
  "No response", "Bad fit", "Price too high", "Other",
];

// Wave 4 — palette for the per-rep stacked revenue bar on the Closed
// tab (Wave 3 Task 3.11). Distinct enough across light + dark that
// adjacent slices stay readable; six entries support the typical
// 4–6 active sales reps before wrapping.
export const REP_COLORS = ["#6BA4F0", "#F0A66B", "#9B7FE0", "#5DC9A6", "#E8B86B", "#E07F8B"];

// Initial form state factories. Centralized so a schema change is one
// edit instead of three (modal init, reset on close, "+ New" reset).
export const newClientForm = () => ({
  name: "",
  industries: [],
  leadSource: "",
  interestedPubs: [],
  contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }],
  notes: "",
  billingEmail: "",
  billingCcEmails: ["", ""],
  billingAddress: "",
  billingAddress2: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
});

export const newOppForm = (defaults = {}) => ({
  company: "", contact: "", email: "", phone: "",
  source: "Referral", notes: "",
  nextAction: "Send media kit",
  nextActionDate: "",
  ...defaults,
});

export const TAB_LIST = [
  "Pipeline", "Inquiries", "Clients", "Proposals",
  "Closed", "Renewals", "Outreach", "Commissions",
];
