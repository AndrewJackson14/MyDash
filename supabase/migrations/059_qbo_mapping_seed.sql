-- ============================================================================
-- Migration 059: Seed qbo_account_mapping
-- ============================================================================
--
-- IMPORTANT: Account names reference POST-PHASE-2 consolidated CoA.
-- Do not deploy to production until Phase 2 merges are complete (or deploy
-- same-day with Phase 2). Live QBO validation in the push layer will reject
-- any pushes to account names that don't exist yet.
--
-- Scope:
--   BILLS (cost side)       — 13 transaction_types, 1:1 with BillsTab CATEGORIES
--   INVOICES (income side)  —  7 transaction_types, matches sales.product_type enum
--
-- Deferred to Phase 3 expansion migration:
--   - event_ticket, event_booth
--   - merchandise_back_issue, merchandise_promo_item, merchandise_other
--   - sponsorship sub-types (content/eblast/social/event)
--   - newspaper_svc_obituary, newspaper_svc_insert
--   - ad_sales_special_pub
--   - adjustment_refund, adjustment_discount, adjustment_correction
-- ============================================================================

BEGIN;

INSERT INTO qbo_account_mapping
  (transaction_type, category, display_name, qbo_account_name,
   line_description_template, required_tokens, example, notes)
VALUES

-- ============================================================================
-- BILLS — keyed by bills.category values (BillsTab.jsx CATEGORIES)
-- ============================================================================

('printing', 'cogs', 'Printing',
  'Printing',
  '{title} {issue_or_date} Printing',
  ARRAY['title','issue_or_date'],
  'Calabasas Style Sept 2026 Printing',
  'All printing costs — magazines, newspapers, special publications. Post-Phase-2 consolidated account.'),

('postage', 'cogs', 'USPS Postage',
  'Publication Delivery:USPS',
  '{title} {issue_or_date} USPS Postage',
  ARRAY['title','issue_or_date'],
  'Hidden Hills Mag Q1 2026 USPS Postage',
  'Publication mailing via USPS. Post-Phase-2 survivor for all per-title USPS sub-accounts.'),

('shipping', 'cogs', 'Office Postage & Shipping',
  'Shipping & Freight',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'FedEx office shipment - FedEx',
  'Non-publication shipping: office mail, sample shipments, courier. Separate from Publication Delivery:USPS.'),

('route_driver', 'cogs', 'Route Driver / Distribution',
  'Publication Delivery:Distribution Labor',
  '{title} {period} Distribution - {vendor}',
  ARRAY['title','period','vendor'],
  'Paso Robles Mag April 2026 Distribution - Smith Delivery',
  'Drivers, carriers, sorting and handling labor for publication distribution.'),

('freelance', 'cogs', 'Freelance Editorial',
  'Production:Freelance Editorial',
  '{title} {issue} - {description} - {vendor}',
  ARRAY['title','issue','description','vendor'],
  'Hidden Hills Q1 2026 - Hiking Trails feature - J. Doe',
  '1099 freelance writers, copy editors, contributors. Post-Phase-2 consolidated.'),

('commission', 'cogs', 'Sales Commission',
  'Sales Commission',
  '{vendor} {period} Commission',
  ARRAY['vendor','period'],
  'J. Sales Rep April 2026 Commission',
  'Sales rep commissions. Already a single clean account; no merge needed.'),

('payroll', 'expense', 'Payroll',
  'Payroll Expenses',
  '{description}',
  ARRAY['description'],
  'Payroll run 2026-04-15',
  'Payroll expense. Parent account; Wages/Taxes/Health Insurance sub-accounts handled inside QBO payroll flow.'),

('rent', 'expense', 'Rent & Lease',
  'General Expenses:Rent & Lease',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'Calabasas office rent April 2026 - Landlord LLC',
  'Office space, storage, vehicle, equipment leases.'),

('utilities', 'expense', 'Utilities',
  'General Expenses:Utilities',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'Internet April 2026 - Spectrum',
  'Phone, gas, electric, water, internet.'),

('software', 'expense', 'Software & Subscriptions',
  'General Expenses:Software & Subscriptions',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'Adobe CC April 2026 - Adobe',
  'SaaS, software licenses, domain registrations, web hosting.'),

('insurance', 'expense', 'Insurance',
  'General Expenses:Insurance',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'General Liability April 2026 - Hartford',
  'Business liability, property, umbrella insurance. NOT health insurance (payroll category).'),

('marketing', 'expense', 'Advertising & Marketing',
  'Advertising & Marketing',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'Facebook Ads April 2026 - Meta',
  'Outbound advertising, promotional materials, business cards.'),

('other_expense', 'expense', 'Other Business Expenses',
  'General Expenses:Other Business Expenses',
  '{description} - {vendor}',
  ARRAY['description','vendor'],
  'Conference registration - Eventbrite',
  'Catch-all for expenses that do not fit the 12 specific bill categories. NOTE: renamed from "other" to avoid collision with invoice-side other_income.'),

-- ============================================================================
-- INVOICES — keyed by invoice_lines.transaction_type (via sales.product_type)
-- ============================================================================

('display_ad', 'income', 'Display Ad',
  'Ad Sales Income',
  '{title} {issue} - {advertiser} - {ad_size}',
  ARRAY['title','issue','advertiser','ad_size'],
  'Hidden Hills Q1 2026 - ABC Realty - Full Page',
  'Print display ads. Collapsed with web_ad at the account level post-Phase-3, but kept distinct at transaction_type for future reporting splits (product P&L, digital-only dashboards).'),

('web_ad', 'income', 'Web / Digital Ad',
  'Ad Sales Income',
  '{property} - {advertiser} - {campaign} - {period}',
  ARRAY['property','advertiser','campaign','period'],
  'TMT.com - Toyota - April Banner - April 2026',
  'Digital banner ads, web_display inventory across ATN/PRP/SYVS/TMT.com. Same account as display_ad; split preserved at transaction_type for reporting.'),

('newspaper_svc_classified', 'income', 'Classified Ad',
  'Newspaper Services Income',
  '{title} {edition_date} - Classified - {advertiser}',
  ARRAY['title','edition_date','advertiser'],
  'ATN/PRP 2026-04-12 - Classified - John Doe',
  'Classified line ads. Newspaper-only revenue stream.'),

('newspaper_svc_legal_notice', 'income', 'Legal Notice / FBN',
  'Newspaper Services Income',
  '{title} FBN - {filing_name} - {filing_date}',
  ARRAY['title','filing_name','filing_date'],
  'ATN/PRP FBN - Doe Enterprises - 2026-04-12',
  'Fictitious Business Name filings and other legal notices.'),

('subscription', 'income', 'Subscription',
  'Subscription Income',
  '{title} Subscription - {subscriber} - {term}',
  ARRAY['title','subscriber','term'],
  'PRM Subscription - Jane Doe - 1yr',
  'Paid magazine or newspaper subscriptions. Publication type (mag/news) distinguishable via {title} and publication record.'),

('sponsorship', 'income', 'Sponsorship',
  'Sponsorship Income',
  '{property} - {sponsor_type} - {sponsor} - {period}',
  ARRAY['property','sponsor_type','sponsor','period'],
  'TMT.com - Sponsored Content - Local Realty - April 2026',
  'Sponsored content, eblasts, newsletter sponsors, social sponsored posts, event sponsorships. Use {sponsor_type} to distinguish in line description.'),

('other_income', 'income', 'Other Income',
  'Sales:Other',
  '{description} - {customer}',
  ARRAY['description','customer'],
  'Mailing Service - Local Realtor',
  'Catch-all for miscellaneous income. Explicitly named other_income to avoid collision with other_expense.');

COMMIT;
