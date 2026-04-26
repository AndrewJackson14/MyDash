// ============================================================
// PAGE_META — page id → { label, department } for the metadata strip.
//
// Departments map roughly to the sidebar sections, with two
// directed overrides per docs/ui-refresh/01-direction.md:
//   • Performance Review reads as EDITORIAL (per the example
//     in the direction doc) even though it's grouped under
//     Operations in the sidebar.
//   • Reports (Analytics) reads as ANALYTICS so it doesn't
//     collide with the Sales-side REVENUE label.
// ============================================================

export const PAGE_META = {
  // Top bar
  dashboard:        { label: "My Dash",           department: "DASH" },
  calendar:         { label: "Calendar",          department: "DASH" },
  messaging:        { label: "Messages",          department: "DASH" },
  mail:             { label: "Mail",              department: "DASH" },

  // Revenue
  sales:            { label: "Sales",             department: "REVENUE" },
  contracts:        { label: "Contracts",         department: "REVENUE" },
  billing:          { label: "Billing",           department: "REVENUE" },

  // Content / production
  editorial:        { label: "Production",        department: "EDITORIAL" },
  adprojects:       { label: "Design Studio",     department: "EDITORIAL" },
  medialibrary:     { label: "Media Library",     department: "EDITORIAL" },
  flatplan:         { label: "Flatplan",          department: "EDITORIAL" },
  layout:           { label: "Layout Console",    department: "EDITORIAL" },
  printers:         { label: "Printers",          department: "EDITORIAL" },
  tearsheets:       { label: "Tearsheet Center",  department: "EDITORIAL" },
  collections:      { label: "Collections",       department: "EDITORIAL" },
  newsletters:      { label: "Newsletters",       department: "EDITORIAL" },
  sitesettings:     { label: "MySites",           department: "EDITORIAL" },
  knowledgebase:    { label: "Knowledge Base",    department: "EDITORIAL" },

  // Advertising
  "bookings-queue": { label: "Booking Queue",     department: "ADVERTISING" },
  classifieds:      { label: "Classifieds",       department: "ADVERTISING" },
  merch:            { label: "Merch",             department: "ADVERTISING" },

  // Operations
  circulation:      { label: "Circulation",       department: "OPERATIONS" },
  servicedesk:      { label: "Service Desk",      department: "OPERATIONS" },
  legalnotices:     { label: "Legal Notices",     department: "OPERATIONS" },
  performance:      { label: "Performance Review", department: "EDITORIAL" }, // direction-doc override

  // Analytics
  analytics:        { label: "Reports",           department: "ANALYTICS" },

  // Systems / admin
  team:             { label: "Team",              department: "ADMIN" },
  publications:     { label: "Publications",      department: "ADMIN" },
  schedule:         { label: "Schedule",          department: "ADMIN" },
  emailtemplates:   { label: "Email Templates",   department: "ADMIN" },
  integrations:     { label: "Integrations",      department: "ADMIN" },
  dataimport:       { label: "Data Import",       department: "ADMIN" },

  // Detail / context routes
  "team-member":    { label: "Team Member",       department: "ADMIN" },
  "issue-detail":   { label: "Issue",             department: "EDITORIAL" },

  // Dev surfaces (DEV builds only)
  "dev-typography": { label: "Typography",        department: "DEV" },
};

export const DEFAULT_META = { label: "—", department: "" };

export const getPageMeta = (pg) => PAGE_META[pg] || DEFAULT_META;
