"""
Streams the NM sales CSVs row by row and writes:
  /tmp/nm_unique_clients.json   — unique company names with first rep/first date
  /tmp/nm_unique_pubs.json       — unique publication names
  /tmp/nm_unique_reps.json       — unique rep names with sale counts
  /tmp/nm_row_stats.json         — counts for audit
No bulk CSV data held in memory.
"""
import csv, glob, json, re, sys, os
from collections import defaultdict
from datetime import datetime

CSV_DIR = "FullSales"
FILES = sorted(glob.glob(f"{CSV_DIR}/Sheet*.csv"))

def norm_company(n):
    n = re.sub(r"\s+", " ", n.strip())
    return n

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
    # "2/16/2023 12:00:00 AM"
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y"):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

unique_clients = {}     # company_name -> {count, first_rep, total_gross}
unique_pubs = defaultdict(int)
unique_reps = defaultdict(int)
row_count = 0
blank_inv_count = 0
total_gross = 0.0
total_amount = 0.0
min_idate = None
max_idate = None
parse_errors = 0

for fn in FILES:
    with open(fn, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row: continue
            if row[0] == "Company": continue
            if len(row) < 11:
                parse_errors += 1
                continue
            company = norm_company(row[0])
            pub = row[1].strip()
            try: gross = float(row[2] or 0)
            except: gross = 0
            try: amount = float(row[8] or 0)
            except: amount = 0
            rep = row[10].strip()
            inv_num = row[7].strip()
            invdate = parse_invdate(row[9])

            if company not in unique_clients:
                unique_clients[company] = {"first_rep": rep, "sale_count": 0, "total_gross": 0.0}
            unique_clients[company]["sale_count"] += 1
            unique_clients[company]["total_gross"] += gross

            unique_pubs[pub] += 1
            if rep: unique_reps[rep] += 1

            row_count += 1
            if not inv_num: blank_inv_count += 1
            total_gross += gross
            total_amount += amount
            if invdate:
                if min_idate is None or invdate < min_idate: min_idate = invdate
                if max_idate is None or invdate > max_idate: max_idate = invdate

with open("/tmp/nm_unique_clients.json", "w") as f:
    json.dump(unique_clients, f, indent=2)
with open("/tmp/nm_unique_pubs.json", "w") as f:
    json.dump(dict(unique_pubs), f, indent=2)
with open("/tmp/nm_unique_reps.json", "w") as f:
    json.dump(dict(unique_reps), f, indent=2)
stats = {
    "row_count": row_count,
    "blank_invoice_rows": blank_inv_count,
    "unique_clients": len(unique_clients),
    "unique_pubs": len(unique_pubs),
    "unique_reps": len(unique_reps),
    "total_gross": round(total_gross, 2),
    "total_amount": round(total_amount, 2),
    "invoice_date_range": [min_idate, max_idate],
    "parse_errors": parse_errors,
}
with open("/tmp/nm_row_stats.json", "w") as f:
    json.dump(stats, f, indent=2)
print(json.dumps(stats, indent=2))
