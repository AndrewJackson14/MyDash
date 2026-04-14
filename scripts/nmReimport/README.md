# NM Reimport Scripts

Scripts that execute the Newspaper Manager → MyDash reimport. They were
run once manually on 2026-04-13 to replace the broken migration data
with clean source data from `FullSales/` plus PDF-level open-invoice
reconciliation.

## Execution order

```
parse_csvs.py            → /tmp/nm_unique_{clients,pubs,reps}.json, /tmp/nm_row_stats.json
parse_pdfs.py            → /tmp/nm_pdf_invoices.json
build_lookups.py         → /tmp/nm_rep_map.json, /tmp/nm_pub_map.json
generate_clients.py      → /tmp/nm_client_ids.json
insert_clients.py        → inserts clients via RPC
insert_sales.py          → streams CSVs, inserts sales, writes /tmp/nm_sales_map.json
build_invoices.py        → /tmp/nm_invoices.json, /tmp/nm_sale_to_invoice.json
insert_invoices_and_lines.py → inserts invoices + invoice_lines via RPC
apply_pdf_overlay.py     → builds /tmp/nm_pdf_matched*.json and partial_payments
run_pdf_overlay.py       → updates DB invoices with PDF status/balance
(manual) nm_insert_partial_payments RPC → inserts 5 partial payment rows
(manual) nm_append_credit_notes RPC → appends credit notes to 8 clients
```

## Helper RPCs (SECURITY DEFINER, granted to anon)

Created in Supabase during the run:

- `nm_bulk_insert_clients(jsonb)`
- `nm_bulk_insert_sales(jsonb)`
- `nm_bulk_insert_invoices(jsonb)`
- `nm_bulk_insert_invoice_lines(jsonb)`
- `nm_apply_pdf_batch(jsonb)`
- `nm_create_standalone_invoices(jsonb)`
- `nm_insert_partial_payments(jsonb)`
- `nm_append_credit_notes(jsonb)`

These were intentionally left in place for a few days in case we need to
re-run. Drop them later with:

```sql
DROP FUNCTION IF EXISTS nm_bulk_insert_clients(jsonb);
DROP FUNCTION IF EXISTS nm_bulk_insert_sales(jsonb);
DROP FUNCTION IF EXISTS nm_bulk_insert_invoices(jsonb);
DROP FUNCTION IF EXISTS nm_bulk_insert_invoice_lines(jsonb);
DROP FUNCTION IF EXISTS nm_apply_pdf_batch(jsonb);
DROP FUNCTION IF EXISTS nm_create_standalone_invoices(jsonb);
DROP FUNCTION IF EXISTS nm_insert_partial_payments(jsonb);
DROP FUNCTION IF EXISTS nm_append_credit_notes(jsonb);
```

## Archive tables

Pre-reimport snapshots live in `*_archive_20260413` tables:
`invoices`, `invoice_lines`, `payments`, `sales`, `contracts`,
`contract_lines`, `proposals`, `proposal_lines`, `ad_projects`, `clients`,
`client_contacts`, `media_assets`, `client_sales_summary`.

**Drop on 2026-05-13** if no issues surface.

## Dependencies

- Python 3.9+
- `pypdf` (`python3 -m pip install --user pypdf`)
- `.env` at repo root with `VITE_SUPABASE_ANON_KEY`

## Environment quirks

The scripts use PostgREST via the anon key + SECURITY DEFINER RPCs to
bypass RLS. This was chosen because a service_role key was not available
during execution. Callers walk up from cwd to find `.env`, so scripts
can be run from any directory.
