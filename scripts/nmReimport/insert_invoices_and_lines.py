"""
Inserts invoices then invoice_lines via RPCs in batches.
"""
import json
from exec_rpc import call_rpc

invoices = json.load(open("/tmp/nm_invoices.json"))
sale_to_inv = json.load(open("/tmp/nm_sale_to_invoice.json"))
sales_map = json.load(open("/tmp/nm_sales_map.json"))

# Insert invoices
BATCH = 1000
total = 0
for i in range(0, len(invoices), BATCH):
    chunk = invoices[i:i+BATCH]
    n = call_rpc("nm_bulk_insert_invoices", {"p_invoices": chunk})
    total += n
    print(f"invoices batch {i//BATCH + 1}: {n} (total {total})")
print(f"INVOICES INSERTED: {total}")

# Build invoice_lines from sales_map
sales_by_id = {s["sale_id"]: s for s in sales_map}
lines = []
for sale_id, inv_id in sale_to_inv.items():
    s = sales_by_id[sale_id]
    lines.append({
        "invoice_id": inv_id,
        "sale_id": sale_id,
        "description": f"NM import — {s.get('nm_inv_num') or 'sale'}",
        "unit_price": s["amount"],
        "total": s["amount"],
    })

total_lines = 0
for i in range(0, len(lines), BATCH):
    chunk = lines[i:i+BATCH]
    n = call_rpc("nm_bulk_insert_invoice_lines", {"p_lines": chunk})
    total_lines += n
    if (i // BATCH) % 5 == 0 or i + BATCH >= len(lines):
        print(f"lines batch {i//BATCH + 1}: {n} (total {total_lines})")
print(f"INVOICE_LINES INSERTED: {total_lines}")
