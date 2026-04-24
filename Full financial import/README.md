# MyDash Historical Import

One-shot import of 5 years of Newspaper Manager data into MyDash.
Nuke + reload pattern: wipes `sales`, `invoices`, `invoice_lines`,
`payments`, `commission_ledger`, `commission_payouts` before loading.
Preserves `clients`, `team_members`, `publications`.

## Files in this bundle

- `import_historical.py` — the script
- `.env.example` — template, rename to `.env` and fill in
- `mydash_sales_payments_consolidated.csv` — the data (69,346 rows)
- `README.md` — this file

## Prerequisites

```bash
python3 -m pip install python-dotenv supabase pandas tqdm
```

Fill in `.env` with your Supabase project URL and the **service role key**
(not the anon key — anon can't bypass RLS for bulk operations). Get it from
Supabase Dashboard → Settings → API → `service_role` secret.

## Pre-flight — do these first

### 1. Back up the database

Supabase Dashboard → Database → Backups. Trigger a manual backup before
running. This is the "oh no" button.

Alternative via CLI:
```bash
supabase db dump --db-url "<your connection string>" > mydash_backup_pre_import.sql
```

### 2. Dry run

```bash
python import_historical.py --csv mydash_sales_payments_consolidated.csv --dry-run
```

Reads the CSV, connects to Supabase, reports what it would do. Makes zero writes. Expect:

- 41,088 order rows will become 41,088 sales rows
- ~39,000 unique invoice numbers will become 39,000 invoices
- 28,257 payment rows (minus ~101 orphans) become payments
- ~3,975 unique companies become client rows (minus whatever's already in DB)

### 3. Review output

Focus on these warnings:

- **"Missing from DB: N"** — publications in the CSV not in `publications` table. Either pre-create them manually OR run with `--create-missing-pubs` to auto-stub them.
- **"Reps in CSV not in team_members: N"** — salespeople whose sales will be imported without `assigned_to`. Review the list, add any missing team members manually before real run if you want proper commission attribution.

### 4. Decide on flags

- `--create-missing-pubs` — auto-create stubs for the ~20 directory/special-publication slugs. Recommended true.
- `--wipe-clients` — also wipe the clients table. **NOT recommended** on first run — keep existing clients and match by name. Use only if you're sure nothing else depends on existing client rows.
- `--yes` — skip all confirmation prompts. Use only after a successful dry run.

## Real run

```bash
python import_historical.py \
  --csv mydash_sales_payments_consolidated.csv \
  --create-missing-pubs
```

Expected runtime: 10–20 minutes for ~70K rows. Progress bars show each phase.

## If something goes wrong mid-run

### Rollback

Restore from the backup you took in step 1.

Supabase Dashboard → Database → Backups → find your pre-import backup → Restore.

### Partial failure recovery

If a phase fails partway through, the script is NOT fully idempotent — rerunning will duplicate data in later phases. Safer to:

1. Restore backup
2. Fix the issue that caused the failure
3. Re-run from scratch

## Post-run verification

The postflight phase prints a reconciliation table. Expected output:

```
                       CSV               DB             Δ
──────────────────────────────────────────────────────────
Orders (sales)  $12,616,961.59  $12,616,961.59        $0.00
Invoiced        $12,130,237.94  $12,130,237.94        $0.00
Payments        $12,295,740.68  $12,295,740.68        $0.00
```

If any Δ is non-zero, investigate before trusting the data.

### Manual checks in the app

1. Open MyDash → Reports → any revenue view — should show 5 years of history
2. Open SalesCRM → pick a well-known historical client → should see their full order history
3. Open Billing → should see thousands of invoices with correct paid/partial/sent statuses
4. Open Commissions → ledger will be empty until you run `recalculate_all_commissions`

### Recalculate commissions

After import, commission_ledger is empty. Run from MyDash:

- Sales → Commissions → "Recalculate All" button

Or via SQL:

```sql
select recalculate_all_commissions();
```

This builds ledger entries for every `sales` row that's `Closed`, using the rep's share % and rate configured at the time of run.

## Known edge cases handled

- **Multi-line invoices** (4 cases): grouped by invoice_number, one invoice with N line items
- **Payment method enum mismatch**: source has `Visa / AMEX / MasterCard / Barter / etc.`; mapped to MyDash enum (`card / check / ach / cash / other`). Original value preserved in `notes`.
- **Digital.csv orphans**: original `Digital.csv` had no invoice numbers — replaced by `Digital2.csv` which does. Used as source.
- **Stripe transaction IDs**: parsed out of the payment memo field when present, stored in `transaction_id`.
- **Last-4 digits**: parsed from `XXXX1234` pattern in memo.
- **Forward-scheduled orders** (1,360 rows): orders with no invoice number. Imported as `Closed` sales; invoices will mint when they hit press date.
- **Orphan payments** (101 rows): payments whose invoice isn't in the order export. Written to `orphan_payments.csv` for manual review, not inserted.

## Known limits

- Script is not parallelized — ~70K inserts run sequentially
- No resume from midpoint — re-run from scratch on failure
- Contracts table not populated (all historical sales have `contract_id = null`)
- Commission ledger not populated (run recalc after)
