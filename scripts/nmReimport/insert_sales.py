"""
Streams Sheet CSVs and inserts sales in batches via nm_bulk_insert_sales RPC.
Also tracks the sale_id ↔ (client, invoice_date, nm_inv_num, amount) mapping
to /tmp/nm_sales_map.json for invoice grouping + invoice_lines linking.
"""
import csv, glob, json, uuid, re, sys
from datetime import datetime

from exec_rpc import call_rpc

CSV_DIR = "FullSales"
FILES = sorted(glob.glob(f"{CSV_DIR}/Sheet*.csv"))

client_ids = json.load(open("/tmp/nm_client_ids.json"))
rep_map = json.load(open("/tmp/nm_rep_map.json"))
pub_map = json.load(open("/tmp/nm_pub_map.json"))

def norm(s): return re.sub(r"\s+", " ", s.strip())

def parse_invdate(s):
    if not s: return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def parse_issuedate(s):
    if not s: return None
    s = s.strip()
    if not s: return None
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y"):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

BATCH_SIZE = 2000
batch = []
sales_map = []  # (id, client_id, invoice_date, nm_inv_num, amount, gross)
total_inserted = 0
issues = {"no_client": 0, "no_pub": 0, "no_date": 0, "skipped": 0}

def flush():
    global total_inserted
    if not batch: return
    try:
        n = call_rpc("nm_bulk_insert_sales", {"p_sales": batch})
        total_inserted += n
        print(f"  inserted batch ({len(batch)} rows, total {total_inserted})")
    except Exception as e:
        print(f"  ERROR inserting batch: {e}")
        raise
    batch.clear()

for fn in FILES:
    print(f"processing {fn}")
    with open(fn, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row or row[0] == "Company" or len(row) < 11:
                continue
            company = norm(row[0])
            pub_name = row[1].strip()
            try: gross = float(row[2] or 0)
            except: gross = 0
            try: amount = float(row[8] or 0)
            except: amount = 0
            issue_label = row[3].strip()
            issue_year = row[4].strip()
            ad_size = row[5].strip()
            issue_date = parse_issuedate(row[6])  # issue/publication date
            nm_inv_num = row[7].strip()
            invoice_date = parse_invdate(row[9])  # billing date
            rep_name = row[10].strip()

            client = client_ids.get(company)
            if not client:
                issues["no_client"] += 1
                continue
            pub_entry = pub_map.get(pub_name)
            if not pub_entry or not pub_entry.get("pub_id"):
                issues["no_pub"] += 1
                continue
            # sale.date uses issue_date (the actual publication date). Fallback to invoice_date.
            sale_date = issue_date or invoice_date
            if not sale_date:
                issues["no_date"] += 1
                continue

            sale_id = str(uuid.uuid4())
            rep_entry = rep_map.get(rep_name, {})
            assigned_to = rep_entry.get("team_id") or ""

            # ad_type = publication name (matches convention used by proposal RPC)
            batch.append({
                "id": sale_id,
                "client_id": client["id"],
                "publication_id": pub_entry["pub_id"],
                "ad_type": pub_name,
                "ad_size": ad_size,
                "amount": amount,
                "date": sale_date,
                "assigned_to": assigned_to,
            })
            sales_map.append({
                "sale_id": sale_id,
                "client_id": client["id"],
                "invoice_date": invoice_date,  # may be None for forward-booked $0 rows
                "nm_inv_num": nm_inv_num,
                "amount": amount,
                "gross": gross,
            })
            if len(batch) >= BATCH_SIZE:
                flush()

flush()

with open("/tmp/nm_sales_map.json", "w") as f:
    json.dump(sales_map, f)

print(f"\nTOTAL SALES INSERTED: {total_inserted}")
print(f"ISSUES: {issues}")
