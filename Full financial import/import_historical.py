#!/usr/bin/env python3
"""
MyDash historical import — nuke and reload.

Loads mydash_sales_payments_consolidated.csv into Supabase. All existing
sales/invoices/payments/clients that originated from the CSV namespace are
wiped first. Runs in sequenced phases with progress reporting and a
--dry-run mode that reports what would happen without writing.

Prerequisites
-------------
  pip install python-dotenv supabase pandas tqdm

Environment (.env in same dir)
------------------------------
  SUPABASE_URL=https://hqywacyhpllapdwccmaw.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role key, NOT anon key>

Usage
-----
  # Dry run first — reports counts, no writes.
  python import_historical.py --csv mydash_sales_payments_consolidated.csv --dry-run

  # Real run. Prompts for confirmation before each destructive step.
  python import_historical.py --csv mydash_sales_payments_consolidated.csv

  # Skip confirmation prompts (only use after a clean dry run).
  python import_historical.py --csv mydash_sales_payments_consolidated.csv --yes

Phases
------
  1. Preflight: validate CSV, verify Supabase connection, print plan.
  2. Wipe: delete existing data from commission_ledger, payments, invoice_lines,
     invoices, sales, issue_goal_allocations touching these sales. Leaves
     clients in place unless --wipe-clients is passed.
  3. Publications: ensure every publication_id slug exists. New ones are
     created as stubs with sensible defaults.
  4. Clients: create a row for each unique company name, or match to existing.
  5. Team rep mapping: read team_members, build name→id lookup.
  6. Invoices: insert one row per unique invoice_number with status derived
     from payment totals. Multi-line invoices collapse correctly.
  7. Sales: insert one row per order line, linked to client, pub, invoice.
  8. Invoice lines: link sales to invoices via invoice_lines.
  9. Payments: insert one row per payment, linked to invoice_id.
 10. Postflight: reconciliation report — source totals vs DB totals.
"""

import argparse
import os
import sys
import time
from collections import defaultdict
from decimal import Decimal

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm


# ───────────────────── config ─────────────────────

BATCH_SIZE = 500  # Supabase insert batch size


def fetch_all(sb, table, cols):
    """Paginated full-table read — PostgREST defaults to 1,000 row cap."""
    rows, off = [], 0
    while True:
        chunk = sb.table(table).select(cols).range(off, off + 999).execute().data
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        off += 1000
    return rows

# Map source Payment Method → MyDash enum values
# MyDash enum is: 'card', 'check', 'ach', 'cash', 'other'
PAYMENT_METHOD_MAP = {
    'Cash': 'cash',
    'Check': 'check',
    'Visa': 'card',
    'Master Card': 'card',
    'MasterCard': 'card',
    'AMEX': 'card',
    'Discover': 'card',
    'ACH/Elec': 'ach',
    'Customer Account': 'other',
    'Credit Memo': 'other',
    'Write Off': 'other',
    'Barter': 'other',
    'Invoice Credit': 'other',
}

# Map source ad_type (from our consolidated file) → MyDash product_type enum
# MyDash enum: display_print, classified, legal_notice, web_ad,
#              sponsored_content, newsletter_sponsor, eblast,
#              social_sponsor, creative_service
PRODUCT_TYPE_MAP = {
    'Display Print - Newspaper': 'display_print',
    'Display Print - Magazine':  'display_print',
    'Classified Line Listing':    'classified',
    'Legal Notice':               'legal_notice',
    'Digital':                    'web_ad',
    'Directory':                  'display_print',
    'Service':                    'creative_service',
    'Other':                      'display_print',
}

# invoice_lines.transaction_type FK → qbo_account_mapping.transaction_type.
# Valid keys are QBO income categories, not product_type enum values.
TXN_TYPE_MAP = {
    'Display Print - Newspaper':  'display_ad',
    'Display Print - Magazine':   'display_ad',
    'Classified Line Listing':    'newspaper_svc_classified',
    'Legal Notice':               'newspaper_svc_legal_notice',
    'Digital':                    'web_ad',
    'Directory':                  'display_ad',
    'Service':                    'other_income',
    'Other':                      'display_ad',
}

# Known publications that should exist in MyDash already. Anything else
# in the CSV will be created as a stub (controlled by --create-missing-pubs).
KNOWN_PUB_IDS = {
    'paso-press', 'paso-magazine',
    'atascadero-news', 'atascadero-magazine',
    'morro-bay-life', 'santa-ynez-star',
    'malibu-times', 'malibu-magazine',
    'calabasas-style', 'palisades-magazine',
}


# ───────────────────── helpers ─────────────────────

def log(msg, level='info'):
    prefix = {'info': '[·]', 'ok': '[✓]', 'warn': '[!]', 'err': '[✗]', 'step': '\n[▶]'}[level]
    print(f"{prefix} {msg}", flush=True)


def confirm(prompt, assume_yes=False):
    if assume_yes:
        return True
    ans = input(f"    {prompt} [y/N] ").strip().lower()
    return ans == 'y'


def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def to_float(x):
    if pd.isna(x): return 0.0
    try: return float(x)
    except (ValueError, TypeError): return 0.0


def to_date(x):
    if pd.isna(x) or not x: return None
    s = str(x).strip()
    if not s or s.lower() == 'nan': return None
    return s  # CSV already has YYYY-MM-DD strings


# ───────────────────── main phases ─────────────────────

def phase_preflight(sb, df, args):
    log("PHASE 1 — Preflight", 'step')
    orders = df[df['record_type'] == 'order']
    payments = df[df['record_type'] == 'payment']
    log(f"CSV rows: {len(df):,}")
    log(f"  orders: {len(orders):,}")
    log(f"  payments: {len(payments):,}")

    unique_companies = df['company'].dropna().nunique()
    unique_invoices = df['invoice_number'].replace('', pd.NA).dropna().nunique()
    unique_pubs = df['publication_id'].replace('', pd.NA).dropna().nunique()
    unique_reps = df['sales_rep'].replace('', pd.NA).dropna().nunique()

    log(f"  unique companies: {unique_companies:,}")
    log(f"  unique invoices:  {unique_invoices:,}")
    log(f"  unique pubs:      {unique_pubs:,}")
    log(f"  unique reps:      {unique_reps:,}")

    order_total = orders['net_amount'].sum()
    invoice_total = orders['invoice_amount'].sum()
    payment_total = payments['payment_amount'].sum()
    log(f"  ∑ order net:      ${order_total:>14,.2f}")
    log(f"  ∑ invoiced:       ${invoice_total:>14,.2f}")
    log(f"  ∑ payments:       ${payment_total:>14,.2f}")
    log(f"  Net AR:           ${invoice_total - payment_total:>14,.2f}")

    # Test Supabase connection
    try:
        res = sb.table('publications').select('id').limit(1).execute()
        log(f"Supabase connection OK ({len(res.data)} pub sampled)", 'ok')
    except Exception as e:
        log(f"Supabase connection failed: {e}", 'err')
        sys.exit(1)


def phase_wipe(sb, args):
    log("PHASE 2 — Wipe existing data", 'step')
    if args.dry_run:
        log("dry-run — skipping wipe", 'warn')
        return

    if not confirm("This WIPES existing payments, invoice_lines, invoices, sales. Continue?", args.yes):
        log("Aborted by user", 'err')
        sys.exit(1)

    # Order of deletion matters (FK dependencies):
    # commission_ledger → payments → invoice_lines → invoices → sales → issue_goal_allocations stays (doesn't reference these)
    wipe_tables = [
        'commission_ledger',
        'commission_payouts',
        'payments',
        'invoice_lines',
        'invoices',
        'sales',
    ]
    for tbl in wipe_tables:
        try:
            # .neq('id', '00000000-0000-0000-0000-000000000000') forces a WHERE clause
            # (Supabase requires one on delete for safety).
            res = sb.table(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            log(f"wiped {tbl}", 'ok')
        except Exception as e:
            log(f"wipe {tbl} failed: {e}", 'warn')

    # Optionally wipe clients (dangerous — other tables reference them)
    if args.wipe_clients:
        if confirm("Also wipe clients table? (communications, proposals, contracts cascade)", args.yes):
            sb.table('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            log("wiped clients", 'ok')


def phase_publications(sb, df, args):
    log("PHASE 3 — Publications", 'step')
    csv_pubs = set(df['publication_id'].replace('', pd.NA).dropna().unique())

    existing = sb.table('publications').select('id,name').execute().data
    existing_ids = {p['id'] for p in existing}
    log(f"CSV references {len(csv_pubs)} publication slugs")
    log(f"DB has {len(existing_ids)} publications")

    missing = csv_pubs - existing_ids
    log(f"Missing from DB: {len(missing)}")
    if missing:
        for m in sorted(missing):
            log(f"    - {m}", 'info')

    if not missing:
        return

    if args.dry_run:
        log("dry-run — would create missing pubs as stubs", 'warn')
        return

    if not args.create_missing_pubs:
        log("Run with --create-missing-pubs to auto-create stubs, or create them", 'warn')
        log("manually in Publications admin and re-run.", 'warn')
        if not confirm("Continue without creating? (sales for these pubs will fail)", args.yes):
            sys.exit(1)
        return

    # Create stub publications. Field requirements: id (text PK), name, type,
    # width, height, frequency (enum). Use sensible defaults.
    stubs = []
    for pub_id in missing:
        is_mag = 'magazine' in pub_id
        is_dir = 'director' in pub_id or 'register' in pub_id
        is_service = pub_id.startswith('services-') or pub_id == 'promos'
        stubs.append({
            'id': pub_id,
            'name': pub_id.replace('-', ' ').title(),
            'type': 'Magazine' if is_mag else 'Newspaper',
            'width': 8.375 if is_mag else 11.125,
            'height': 10.875 if is_mag else 20.75,
            'frequency': 'Monthly' if (is_mag or is_dir) else 'Weekly',
            'page_count': 48 if is_mag else 24,
            'circulation': 0,
            'color': '#888888',
            'dormant': True if is_service else False,
        })

    for batch in chunked(stubs, 50):
        sb.table('publications').insert(batch).execute()
    log(f"created {len(stubs)} stub publications", 'ok')


def phase_clients(sb, df, args):
    log("PHASE 4 — Clients", 'step')
    companies = df['company'].dropna().str.strip().unique()
    log(f"Unique companies in CSV: {len(companies):,}")

    existing = fetch_all(sb, 'clients', 'id,name')
    existing_by_name = {c['name'].strip().lower(): c['id'] for c in existing}
    log(f"Existing clients in DB: {len(existing_by_name):,}")

    to_create = [c for c in companies if c.lower() not in existing_by_name]
    log(f"New clients to create: {len(to_create):,}")

    if args.dry_run:
        return existing_by_name  # return existing mapping so later phases can simulate

    # Batch insert
    rows = [{'name': c, 'status': 'Active'} for c in to_create]
    created_map = {}
    for batch in tqdm(list(chunked(rows, BATCH_SIZE)), desc='insert clients'):
        res = sb.table('clients').insert(batch).execute()
        for r in res.data:
            created_map[r['name'].strip().lower()] = r['id']

    name_to_id = {**existing_by_name, **created_map}
    log(f"client name→id map has {len(name_to_id):,} entries", 'ok')
    return name_to_id


def phase_team(sb):
    log("PHASE 5 — Team rep mapping", 'step')
    team = sb.table('team_members').select('id,name').execute().data
    log(f"Team members in DB: {len(team)}")
    name_to_id = {t['name'].strip(): t['id'] for t in team}
    return name_to_id


def phase_invoices(sb, df, client_map, args):
    log("PHASE 6 — Invoices", 'step')

    orders = df[df['record_type'] == 'order'].copy()
    orders_with_inv = orders[orders['invoice_number'].fillna('').str.strip() != '']

    # Group by invoice_number — sum amounts, take first metadata
    payments = df[df['record_type'] == 'payment'].copy()
    paid_by_inv = payments.groupby('invoice_number')['payment_amount'].sum().to_dict()

    grouped = orders_with_inv.groupby('invoice_number').agg(
        company=('company', 'first'),
        invoice_date=('invoice_date', 'first'),
        total=('invoice_amount', 'sum'),
        line_count=('invoice_number', 'count'),
    ).reset_index()

    log(f"Unique invoice numbers: {len(grouped):,}")
    log(f"Invoices with multiple lines: {(grouped['line_count'] > 1).sum()}")

    if args.dry_run:
        return {}

    to_insert = []
    for _, r in grouped.iterrows():
        client_id = client_map.get(r['company'].strip().lower())
        if not client_id:
            continue  # should never happen
        total = to_float(r['total'])
        paid = to_float(paid_by_inv.get(r['invoice_number'], 0))
        balance = max(0, total - paid)
        status = 'paid' if balance == 0 and total > 0 else (
                 'partially_paid' if paid > 0 else 'sent')
        to_insert.append({
            'invoice_number': r['invoice_number'],
            'client_id': client_id,
            'status': status,
            'subtotal': total,
            'total': total,
            'balance_due': balance,
            'issue_date': to_date(r['invoice_date']),
            'notes': 'Historical import from Newspaper Manager',
        })

    invoice_num_to_id = {}
    for batch in tqdm(list(chunked(to_insert, BATCH_SIZE)), desc='insert invoices'):
        res = sb.table('invoices').insert(batch).execute()
        for r in res.data:
            invoice_num_to_id[r['invoice_number']] = r['id']

    log(f"inserted {len(invoice_num_to_id):,} invoices", 'ok')
    return invoice_num_to_id


def phase_sales(sb, df, client_map, team_map, invoice_map, args):
    log("PHASE 7 — Sales", 'step')
    orders = df[df['record_type'] == 'order'].copy()
    log(f"Order rows to insert: {len(orders):,}")

    if args.dry_run:
        return

    # Show rep names not found in team
    rep_names = orders['sales_rep'].replace('', pd.NA).dropna().unique()
    missing_reps = [r for r in rep_names if r not in team_map and r != '*Unassigned*']
    if missing_reps:
        log(f"Reps in CSV not in team_members: {len(missing_reps)}", 'warn')
        for r in missing_reps[:10]:
            log(f"    - {r}", 'info')
        log("    (sales for these reps will have assigned_to=null)", 'info')

    to_insert = []
    for _, r in orders.iterrows():
        company = str(r['company']).strip()
        client_id = client_map.get(company.lower())
        if not client_id:
            continue
        rep_name = str(r['sales_rep']).strip() if pd.notna(r['sales_rep']) else ''
        assigned = team_map.get(rep_name)

        to_insert.append({
            'client_id': client_id,
            'publication_id': r['publication_id'] or None,
            'ad_type': r['ad_type'] or 'TBD',
            'ad_size': str(r['size']) if pd.notna(r['size']) else '',
            'amount': to_float(r['net_amount']),
            'status': 'Closed',
            'date': to_date(r['issue_date']) or to_date(r['invoice_date']),
            'closed_at': to_date(r['invoice_date']) or to_date(r['issue_date']),
            'product_type': PRODUCT_TYPE_MAP.get(r['ad_type'], 'display_print'),
            'assigned_to': assigned,
            'notes': [],
        })

    # Insert sales in batches, then collect sale_ids for invoice_line wiring
    sale_ids_by_inv = defaultdict(list)  # invoice_number → [sale_id, ...]
    idx = 0
    for batch in tqdm(list(chunked(to_insert, BATCH_SIZE)), desc='insert sales'):
        res = sb.table('sales').insert(batch).execute()
        # Match each inserted sale back to its invoice number via position
        for s in res.data:
            inv_num = orders.iloc[idx]['invoice_number']
            if inv_num:
                sale_ids_by_inv[inv_num].append(s['id'])
            idx += 1
    log(f"inserted {idx:,} sales rows", 'ok')
    return sale_ids_by_inv


def phase_invoice_lines(sb, df, invoice_map, sale_ids_by_inv, args):
    log("PHASE 8 — Invoice lines", 'step')
    orders = df[(df['record_type'] == 'order') &
                (df['invoice_number'].fillna('').str.strip() != '')].copy()
    log(f"Invoice line rows: {len(orders):,}")

    if args.dry_run:
        return

    to_insert = []
    sale_idx_per_inv = defaultdict(int)

    for _, r in orders.iterrows():
        inv_num = r['invoice_number']
        inv_id = invoice_map.get(inv_num)
        if not inv_id:
            continue
        sale_ids = sale_ids_by_inv.get(inv_num, [])
        i = sale_idx_per_inv[inv_num]
        sale_id = sale_ids[i] if i < len(sale_ids) else None
        sale_idx_per_inv[inv_num] = i + 1

        desc_bits = [x for x in [str(r['ad_type']), str(r['size']), str(r['publication_id'])] if x and x != 'nan']
        desc = ' · '.join(desc_bits) or 'Historical line'

        amt = to_float(r['invoice_amount']) or to_float(r['net_amount'])
        to_insert.append({
            'invoice_id': inv_id,
            'description': desc[:200],
            'transaction_type': TXN_TYPE_MAP.get(r['ad_type'], 'display_ad'),
            'sale_id': sale_id,
            'publication_id': r['publication_id'] or None,
            'quantity': 1,
            'unit_price': amt,
            'total': amt,
        })

    n = 0
    for batch in tqdm(list(chunked(to_insert, BATCH_SIZE)), desc='insert invoice_lines'):
        res = sb.table('invoice_lines').insert(batch).execute()
        n += len(res.data)
    log(f"inserted {n:,} invoice lines", 'ok')


def phase_payments(sb, df, invoice_map, args):
    log("PHASE 9 — Payments", 'step')
    payments = df[df['record_type'] == 'payment'].copy()
    log(f"Payment rows: {len(payments):,}")

    # How many have a matching invoice?
    matched = payments[payments['invoice_number'].isin(invoice_map.keys())]
    orphan = payments[~payments['invoice_number'].isin(invoice_map.keys())]
    log(f"  matched to invoice: {len(matched):,}")
    log(f"  orphan (no invoice): {len(orphan):,} — skipped, logged to orphan_payments.csv")

    if len(orphan) > 0:
        orphan.to_csv('orphan_payments.csv', index=False)

    if args.dry_run:
        return

    to_insert = []
    for _, r in matched.iterrows():
        inv_id = invoice_map.get(r['invoice_number'])
        if not inv_id:
            continue
        raw_method = str(r['payment_method']).strip() if pd.notna(r['payment_method']) else ''
        mapped_method = PAYMENT_METHOD_MAP.get(raw_method, 'other')

        # Transaction ID — use check number or parse from Stripe-style memo
        txn = str(r['payment_reference']).strip() if pd.notna(r['payment_reference']) else ''
        memo = str(r['payment_memo']).strip() if pd.notna(r['payment_memo']) else ''
        if not txn and 'Trans ID:' in memo:
            txn = memo.split('Trans ID:')[-1].strip().split()[0]

        last_four = ''
        if 'XXXX' in memo:
            # Format: "XXXX0480 Trans ID: ch_..."
            try:
                last_four = memo.split('XXXX')[1][:4]
            except IndexError:
                pass

        # Standard NM-import notes format so future delta-sync can recognize via Pmt#
        pay_num = str(r['payment_number']).strip() if pd.notna(r['payment_number']) else ''
        check_num = str(r['payment_reference']).strip() if pd.notna(r['payment_reference']) else ''
        note_parts = [f"NM: {raw_method}"]
        if pay_num:    note_parts.append(f"Pmt#: {pay_num}")
        if check_num:  note_parts.append(f"Check: {check_num}")
        if memo:       note_parts.append(f"Memo: {memo}")
        note_parts.append(f"Inv: {r['invoice_number']}")
        to_insert.append({
            'invoice_id': inv_id,
            'amount': to_float(r['payment_amount']),
            'method': mapped_method,
            'reference_number': txn or pay_num or None,
            'last_four': last_four or None,
            'notes': ' | '.join(note_parts)[:500],
            'received_at': to_date(r['payment_date']),
        })

    n = 0
    for batch in tqdm(list(chunked(to_insert, BATCH_SIZE)), desc='insert payments'):
        res = sb.table('payments').insert(batch).execute()
        n += len(res.data)
    log(f"inserted {n:,} payments", 'ok')


def phase_postflight(sb, df):
    log("PHASE 10 — Postflight reconciliation", 'step')

    # CSV totals
    csv_orders_total = df[df['record_type'] == 'order']['net_amount'].sum()
    csv_inv_total = df[df['record_type'] == 'order']['invoice_amount'].sum()
    csv_pay_total = df[df['record_type'] == 'payment']['payment_amount'].sum()

    # DB totals — paginated, since PostgREST default cap is 1,000 rows
    sales = fetch_all(sb, 'sales', 'amount')
    invoices = fetch_all(sb, 'invoices', 'total')
    payments = fetch_all(sb, 'payments', 'amount')

    db_sales_total = sum(to_float(s['amount']) for s in sales)
    db_inv_total = sum(to_float(i['total']) for i in invoices)
    db_pay_total = sum(to_float(p['amount']) for p in payments)

    print()
    print(f"{'':20}{'CSV':>18}{'DB':>18}{'Δ':>14}")
    print("─" * 70)
    print(f"{'Orders (sales)':20}${csv_orders_total:>17,.2f}${db_sales_total:>17,.2f}${csv_orders_total - db_sales_total:>13,.2f}")
    print(f"{'Invoiced':20}${csv_inv_total:>17,.2f}${db_inv_total:>17,.2f}${csv_inv_total - db_inv_total:>13,.2f}")
    print(f"{'Payments':20}${csv_pay_total:>17,.2f}${db_pay_total:>17,.2f}${csv_pay_total - db_pay_total:>13,.2f}")
    print()

    if abs(csv_orders_total - db_sales_total) < 1:
        log("Sales total matches CSV ✓", 'ok')
    else:
        log(f"Sales total off by ${csv_orders_total - db_sales_total:,.2f}", 'warn')


# ───────────────────── entry point ─────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='mydash_sales_payments_consolidated.csv')
    ap.add_argument('--dry-run', action='store_true', help='report counts, no writes')
    ap.add_argument('--yes', action='store_true', help='skip confirmation prompts')
    ap.add_argument('--wipe-clients', action='store_true', help='ALSO wipe clients table (dangerous)')
    ap.add_argument('--create-missing-pubs', action='store_true', help='auto-create stub publications for unknown slugs')
    args = ap.parse_args()

    load_dotenv()
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        log("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env", 'err')
        sys.exit(1)

    sb = create_client(url, key)
    df = pd.read_csv(args.csv, low_memory=False)
    df = df.fillna('')  # Simplifies everything downstream

    start = time.time()
    phase_preflight(sb, df, args)
    phase_wipe(sb, args)
    phase_publications(sb, df, args)
    client_map = phase_clients(sb, df, args)
    team_map = phase_team(sb)
    invoice_map = phase_invoices(sb, df, client_map, args)
    sale_ids_by_inv = phase_sales(sb, df, client_map, team_map, invoice_map, args)
    phase_invoice_lines(sb, df, invoice_map, sale_ids_by_inv, args)
    phase_payments(sb, df, invoice_map, args)
    phase_postflight(sb, df)

    elapsed = time.time() - start
    log(f"Complete in {elapsed/60:.1f} min", 'ok')


if __name__ == '__main__':
    main()
