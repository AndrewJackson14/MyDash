"""
Cross-references v2InvoicePayments_Export_04132026_234428.csv against the
reimported data and produces a discrepancy report BEFORE any mutation.

Source of truth: the payment file. Anything in the DB that disagrees
will be adjusted in a follow-up apply step.

Writes:
  /tmp/nm_pmt_report.json    — full reconciliation plan
  /tmp/nm_pmt_orphans.json   — payment rows with no matching nm_inv_num
"""
import csv, json, re, os
from collections import defaultdict, Counter
from datetime import datetime

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PMT_FILE = os.path.join(REPO, "FullSales", "v2InvoicePayments_Export_04132026_234428.csv")

sales_map = json.load(open("/tmp/nm_sales_map.json"))
sale_to_inv = json.load(open("/tmp/nm_sale_to_invoice.json"))
client_ids = json.load(open("/tmp/nm_client_ids.json"))
invoices = json.load(open("/tmp/nm_invoices.json"))

# Build lookup: nm_inv_num → [sale_id, ...]
nm_to_sales = defaultdict(list)
for s in sales_map:
    if s["nm_inv_num"]:
        nm_to_sales[s["nm_inv_num"]].append(s["sale_id"])

# Build lookup: nm_inv_num → set of DB invoice_ids it touches
nm_to_invoices = defaultdict(set)
for nm, sids in nm_to_sales.items():
    for sid in sids:
        iid = sale_to_inv.get(sid)
        if iid: nm_to_invoices[nm].add(iid)

# Invoice totals by DB id
invoice_total_by_id = {i["id"]: float(i["total"]) for i in invoices}
invoice_client_by_id = {i["id"]: i["client_id"] for i in invoices}

# Customer name → client_id
def norm(s): return re.sub(r"\s+", " ", s.strip()).lower()
client_by_name = {norm(k): v["id"] for k, v in client_ids.items()}

def f(s):
    v = str(s or 0).replace("$","").replace(",","").strip()
    if not v: return 0
    # Handle accounting negatives like "(250.00)"
    if v.startswith("(") and v.endswith(")"): v = "-" + v[1:-1]
    return float(v)
def parse_date(s):
    if not s: return None
    for fmt in ("%m/%d/%Y","%m/%d/%y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

# Stream payment file
row_count = 0
matched_nm = 0
orphan_rows = []
matched_amount = 0.0
orphan_amount = 0.0
method_breakdown = Counter()
unmatched_customers = Counter()

# Per-DB-invoice payment aggregation
pmt_by_invoice = defaultdict(lambda: {"amount": 0.0, "rows": []})
# Unique nm_inv_nums touched
nm_hit = set()
nm_miss = set()

with open(PMT_FILE, newline='', encoding='utf-8-sig') as fh:
    r = csv.DictReader(fh)
    for row in r:
        row_count += 1
        cust = (row.get("Customer Detail") or "").strip()
        pay_date = parse_date(row.get("Payment Date") or "")
        nm_num = (row.get("Invoice Number") or "").strip()
        amt = f(row.get("Payment Amount") or 0)
        method = (row.get("Payment Method") or "").strip()
        method_breakdown[method] += 1

        if not nm_num:
            orphan_rows.append({"reason": "no_invoice_num", "row": row})
            orphan_amount += amt
            continue

        # Match by nm_inv_num
        inv_ids = nm_to_invoices.get(nm_num)
        if not inv_ids:
            nm_miss.add(nm_num)
            orphan_rows.append({"reason": "nm_num_not_in_sales", "customer": cust,
                                "nm_num": nm_num, "date": pay_date, "amount": amt, "method": method})
            orphan_amount += amt
            if cust and norm(cust) not in client_by_name:
                unmatched_customers[cust] += 1
            continue

        nm_hit.add(nm_num)
        matched_nm += 1
        matched_amount += amt

        # If one nm_num maps to multiple DB invoices (shouldn't be common),
        # split evenly. In practice we expect 1:1 since nm_inv_num is per-ad
        # and sales→invoice is many-to-one.
        for iid in inv_ids:
            share = amt / len(inv_ids)
            pmt_by_invoice[iid]["amount"] += share
            pmt_by_invoice[iid]["rows"].append({
                "customer": cust, "date": pay_date, "nm_num": nm_num,
                "amount": share, "method": method,
                "check": (row.get("Check Number") or "").strip(),
                "memo": (row.get("Payment Memo") or "").strip(),
                "pmt_num": (row.get("Payment Number") or "").strip(),
            })

# Compute status per invoice
will_paid = 0
will_partial = 0
will_open = 0
overpaid = 0
overpay_total = 0.0
final_open_total = 0.0

for iid, total in invoice_total_by_id.items():
    rec = pmt_by_invoice.get(iid)
    paid = rec["amount"] if rec else 0
    if paid >= total - 0.01 and paid > 0:
        will_paid += 1
        if paid > total + 0.01:
            overpaid += 1
            overpay_total += paid - total
    elif paid > 0:
        will_partial += 1
        final_open_total += (total - paid)
    else:
        will_open += 1
        final_open_total += total

# Save full report
report = {
    "payment_rows_total": row_count,
    "matched_by_nm_num": matched_nm,
    "matched_amount": round(matched_amount, 2),
    "orphan_rows": len(orphan_rows),
    "orphan_amount": round(orphan_amount, 2),
    "unique_nm_nums_hit": len(nm_hit),
    "unique_nm_nums_missed": len(nm_miss),
    "method_breakdown": dict(method_breakdown),
    "unmatched_customers_top": dict(unmatched_customers.most_common(20)),
    "db_invoice_count": len(invoice_total_by_id),
    "db_invoices_will_paid": will_paid,
    "db_invoices_will_partial": will_partial,
    "db_invoices_will_open": will_open,
    "db_invoices_overpaid": overpaid,
    "db_overpay_total": round(overpay_total, 2),
    "final_open_ar_projection": round(final_open_total, 2),
}

with open("/tmp/nm_pmt_report.json", "w") as fo:
    json.dump(report, fo, indent=2)
with open("/tmp/nm_pmt_orphans.json", "w") as fo:
    json.dump(orphan_rows[:500], fo, indent=2)  # first 500 for inspection
with open("/tmp/nm_pmt_by_invoice.json", "w") as fo:
    # Save the apply-plan: { invoice_id: {amount, rows} }
    json.dump({k: v for k, v in pmt_by_invoice.items()}, fo)

# Print summary
print(json.dumps(report, indent=2))
