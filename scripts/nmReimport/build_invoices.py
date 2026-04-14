"""
Groups sales by (client_id, invoice_date) → forms invoices.
Forward-booked rows with no invoice_date → no invoice (sales-only).

Writes:
  /tmp/nm_invoices.json   — list of invoice rows to insert
  /tmp/nm_sale_to_invoice.json — {sale_id: invoice_id} for invoice_lines step
"""
import json, uuid
from collections import defaultdict
from datetime import datetime, timedelta

client_ids = json.load(open("/tmp/nm_client_ids.json"))
sales_map = json.load(open("/tmp/nm_sales_map.json"))

# Reverse client id → code lookup
client_code_by_id = {c["id"]: c["client_code"] for c in client_ids.values()}

# Group by (client_id, invoice_date)
groups = defaultdict(list)
forward_booked = 0
for s in sales_map:
    if not s["invoice_date"]:
        forward_booked += 1
        continue  # no invoice for forward-booked rows
    key = (s["client_id"], s["invoice_date"])
    groups[key].append(s)

print(f"forward-booked rows (no invoice): {forward_booked}")
print(f"unique (client, invoice_date) groups: {len(groups)}")

# Build invoice records + sale-to-invoice map
invoices = []
sale_to_inv = {}
used_invoice_numbers = set()

def make_invoice_number(client_code, invoice_date):
    base = f"{client_code}-{invoice_date.replace('-','')}"
    if base not in used_invoice_numbers:
        used_invoice_numbers.add(base)
        return base
    for seq in range(1, 1000):
        candidate = f"{base}-{seq}"
        if candidate not in used_invoice_numbers:
            used_invoice_numbers.add(candidate)
            return candidate
    raise RuntimeError(f"collision overflow for {base}")

for (client_id, inv_date), rows in groups.items():
    inv_id = str(uuid.uuid4())
    client_code = client_code_by_id[client_id]
    inv_num = make_invoice_number(client_code, inv_date)
    subtotal = round(sum(r["amount"] for r in rows), 2)
    dd = (datetime.strptime(inv_date, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d")
    invoices.append({
        "id": inv_id,
        "client_id": client_id,
        "invoice_number": inv_num,
        "issue_date": inv_date,
        "due_date": dd,
        "subtotal": subtotal,
        "total": subtotal,
        "balance_due": 0,         # default paid
        "status": "paid",         # default; PDF overlay will flip opens
        "billing_schedule": "per_issue",
    })
    for r in rows:
        sale_to_inv[r["sale_id"]] = inv_id

with open("/tmp/nm_invoices.json", "w") as f:
    json.dump(invoices, f)
with open("/tmp/nm_sale_to_invoice.json", "w") as f:
    json.dump(sale_to_inv, f)

print(f"invoices to insert: {len(invoices)}")
print(f"sale→invoice links: {len(sale_to_inv)}")
total_inv_value = sum(i["total"] for i in invoices)
print(f"sum of invoice totals: ${total_inv_value:,.2f}")
