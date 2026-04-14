"""
Applies the v2InvoicePayments file as single source of truth:
- Deduplicates rows by (invoice_number, date, amount, method)
- Matches by nm_inv_num → DB invoice
- Aggregates payments per invoice
- Computes final status (paid / partially_paid / sent / overdue)
- Inserts payments rows (with fields mapped per schema)
- Creates synthetic historical invoices for orphan invoice numbers
- Writes /tmp/nm_pmt_flags.json with unexplained overpays + orphans

Run after `reconcile_payments.py` (which only reports) to mutate DB.
"""
import csv, json, re, uuid, os
from collections import defaultdict
from datetime import datetime, timedelta
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exec_rpc import call_rpc

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PMT_FILE = os.path.join(REPO, "FullSales", "v2InvoicePayments_Export_04132026_234428.csv")
TODAY = datetime.now().strftime("%Y-%m-%d")

sales_map = json.load(open("/tmp/nm_sales_map.json"))
sale_to_inv = json.load(open("/tmp/nm_sale_to_invoice.json"))
client_ids = json.load(open("/tmp/nm_client_ids.json"))
invoices = json.load(open("/tmp/nm_invoices.json"))

# Build lookups
nm_to_invoices = defaultdict(set)
for s in sales_map:
    if s["nm_inv_num"]:
        iid = sale_to_inv.get(s["sale_id"])
        if iid: nm_to_invoices[s["nm_inv_num"]].add(iid)

invoice_total_by_id = {i["id"]: float(i["total"]) for i in invoices}
invoice_due_by_id = {i["id"]: i.get("due_date") for i in invoices}
invoice_client_by_id = {i["id"]: i["client_id"] for i in invoices}

def norm(s): return re.sub(r"\s+", " ", (s or "").strip()).lower()
client_by_name = {norm(k): v for k, v in client_ids.items()}

def f(s):
    v = str(s or 0).replace("$","").replace(",","").strip()
    if not v: return 0
    if v.startswith("(") and v.endswith(")"): v = "-" + v[1:-1]
    return float(v)

def parse_date(s):
    if not s: return None
    for fmt in ("%m/%d/%Y","%m/%d/%y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def map_method(src):
    s = (src or "").lower()
    if s in ("visa", "master card", "mastercard", "amex", "discover"): return "card"
    if s == "cash": return "cash"
    if s == "check": return "check"
    if s == "ach/elec": return "ach"
    return "other"

def method_last_four(src):
    return None  # source file doesn't include last4

# Phase 1: parse + dedupe
raw_count = 0
seen = set()
deduped_rows = []
with open(PMT_FILE, newline='', encoding='utf-8-sig') as fh:
    r = csv.DictReader(fh)
    for row in r:
        raw_count += 1
        key = (
            row.get("Invoice Number") or "",
            row.get("Payment Date") or "",
            row.get("Payment Amount") or "",
            row.get("Payment Method") or "",
        )
        if key in seen:
            continue
        seen.add(key)
        deduped_rows.append(row)
print(f"raw rows: {raw_count}")
print(f"after dedupe: {len(deduped_rows)}")
print(f"removed dupes: {raw_count - len(deduped_rows)}")

# Phase 2: bucket rows by (matched invoice_id) OR as orphans
invoice_payments = defaultdict(list)  # iid -> [payment dicts]
orphan_payments_by_nm = defaultdict(list)  # nm_num -> [payment dicts]
orphans_missing_customer = []

def row_to_payment(row, nm, pay_date, method):
    orig_method = row.get("Payment Method") or ""
    check = (row.get("Check Number") or "").strip()
    memo = (row.get("Payment Memo") or "").strip()
    pmt_num = (row.get("Payment Number") or "").strip()
    notes_parts = [f"NM: {orig_method}"]
    if pmt_num: notes_parts.append(f"Pmt#: {pmt_num}")
    if check: notes_parts.append(f"Check: {check}")
    if memo: notes_parts.append(f"Memo: {memo}")
    notes_parts.append(f"Inv: {nm}")
    return {
        "amount": f(row.get("Payment Amount")),
        "method": map_method(orig_method),
        "received_at": pay_date,
        "notes": " | ".join(notes_parts),
        "stripe_fee": f(row.get("ProcessingFee")),
        "reference_number": pmt_num or None,
        "nm_num": nm,
        "customer": (row.get("Customer Detail") or "").strip(),
    }

for row in deduped_rows:
    nm = (row.get("Invoice Number") or "").strip()
    pay_date = parse_date(row.get("Payment Date") or "") or TODAY
    method = map_method(row.get("Payment Method") or "")
    payment = row_to_payment(row, nm, pay_date, method)

    if not nm:
        orphans_missing_customer.append(payment)
        continue
    inv_ids = nm_to_invoices.get(nm)
    if not inv_ids:
        orphan_payments_by_nm[nm].append(payment)
        continue
    # Apply to each matched DB invoice
    share = payment["amount"] / len(inv_ids)
    for iid in inv_ids:
        copy = dict(payment)
        copy["amount"] = share
        invoice_payments[iid].append(copy)

print(f"\nDB invoices receiving payments: {len(invoice_payments)}")
print(f"Orphan invoice numbers: {len(orphan_payments_by_nm)}")
print(f"  orphan rows: {sum(len(v) for v in orphan_payments_by_nm.values())}")

# Phase 3: build payment insert list + compute status updates
# Also identify unexplained overpayments for the flag report.
payment_inserts = []
status_updates = []  # (iid, status, balance_due)
unexplained_overpays = []

for iid, pmts in invoice_payments.items():
    total = invoice_total_by_id[iid]
    total_paid = sum(p["amount"] for p in pmts)
    for p in pmts:
        payment_inserts.append({
            "invoice_id": iid,
            "amount": round(p["amount"], 2),
            "method": p["method"],
            "received_at": p["received_at"],
            "notes": p["notes"],
            "reference_number": p["reference_number"],
            "stripe_fee": round(p["stripe_fee"], 2) if p["stripe_fee"] else 0,
        })
    if total_paid >= total - 0.01:
        status = "paid"
        balance = 0
        if total_paid > total + 0.01:
            unexplained_overpays.append({
                "invoice_id": iid,
                "total": total,
                "paid": round(total_paid, 2),
                "overpay": round(total_paid - total, 2),
            })
    elif total_paid > 0:
        status = "partially_paid"
        balance = round(total - total_paid, 2)
    else:
        status = "overdue" if invoice_due_by_id.get(iid) and invoice_due_by_id[iid] < TODAY else "sent"
        balance = total
    status_updates.append({"invoice_id": iid, "status": status, "balance_due": balance})

# Invoices with NO payments in the file stay as sent/overdue (not paid)
for iid, total in invoice_total_by_id.items():
    if iid in invoice_payments: continue
    status = "overdue" if invoice_due_by_id.get(iid) and invoice_due_by_id[iid] < TODAY else "sent"
    status_updates.append({"invoice_id": iid, "status": status, "balance_due": total})

print(f"\npayment inserts: {len(payment_inserts)}")
print(f"status updates: {len(status_updates)}")
print(f"unexplained overpays (after dedupe): {len(unexplained_overpays)}")
print(f"  total unexplained overpay $: ${sum(x['overpay'] for x in unexplained_overpays):,.2f}")

# Phase 4: synthesize historical invoices for orphan nm_nums
# One DB invoice per orphan nm_num, total = sum of payments, status = paid
# Client_id lookup: from "Customer Detail" on any of the payment rows
synthetic_invoices = []
synthetic_payment_inserts = []
unmatched_orphan_nms = []

for nm, pmts in orphan_payments_by_nm.items():
    # Pick the customer from first row
    cust = pmts[0]["customer"]
    client_rec = client_by_name.get(norm(cust))
    if not client_rec:
        unmatched_orphan_nms.append({"nm_num": nm, "customer": cust, "rows": len(pmts)})
        continue
    total = sum(p["amount"] for p in pmts)
    earliest = min(p["received_at"] for p in pmts)
    due = (datetime.strptime(earliest, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d")
    new_iid = str(uuid.uuid4())
    synthetic_invoices.append({
        "id": new_iid,
        "client_id": client_rec["id"],
        "invoice_number": nm,
        "issue_date": earliest,
        "due_date": due,
        "subtotal": round(total, 2),
        "total": round(total, 2),
        "balance_due": 0,  # paid
        "status": "paid",
        "billing_schedule": "per_issue",
        "notes": "NM historical — reconstructed from v2InvoicePayments file, no sales backing",
    })
    for p in pmts:
        synthetic_payment_inserts.append({
            "invoice_id": new_iid,
            "amount": round(p["amount"], 2),
            "method": p["method"],
            "received_at": p["received_at"],
            "notes": p["notes"],
            "reference_number": p["reference_number"],
            "stripe_fee": round(p["stripe_fee"], 2) if p["stripe_fee"] else 0,
        })

print(f"\nsynthetic invoices to create: {len(synthetic_invoices)}")
print(f"synthetic payment rows: {len(synthetic_payment_inserts)}")
print(f"orphan nm_nums with no customer match: {len(unmatched_orphan_nms)}")

# Phase 5: execute via RPC
print("\n--- EXECUTING ---")

# Payment insert RPC
def call_batch(rpc_name, param_key, items, batch=1000):
    total = 0
    for i in range(0, len(items), batch):
        chunk = items[i:i+batch]
        n = call_rpc(rpc_name, {param_key: chunk})
        total += n
    return total

# Insert synthetic invoices first
if synthetic_invoices:
    n = call_batch("nm_bulk_insert_invoices", "p_invoices", synthetic_invoices)
    print(f"synthetic invoices inserted: {n}")

# Apply status updates + balances (upsert-style)
# We'll reuse a new RPC to bulk-update statuses
n = call_batch("nm_bulk_update_invoice_status", "p_updates", status_updates, batch=2000)
print(f"status updates applied: {n}")

# Insert all payments (matched + synthetic)
all_payments = payment_inserts + synthetic_payment_inserts
if all_payments:
    n = call_batch("nm_bulk_insert_payments", "p_payments", all_payments, batch=2000)
    print(f"payments inserted: {n}")

# Write flag report
flags = {
    "dedupe_removed": raw_count - len(deduped_rows),
    "unexplained_overpays": unexplained_overpays,
    "orphan_nms_missing_customer": unmatched_orphan_nms,
    "synthetic_invoices_created": len(synthetic_invoices),
    "synthetic_payment_rows": len(synthetic_payment_inserts),
    "orphan_missing_invoice_number": orphans_missing_customer,
}
with open("/tmp/nm_pmt_flags.json", "w") as f_:
    json.dump(flags, f_, indent=2, default=str)
print(f"\nwrote /tmp/nm_pmt_flags.json")
