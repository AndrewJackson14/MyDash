"""
Streams CSVs once to compute majority rep per client, then generates
client INSERT batches with synthetic UUIDs + client_codes.

Writes:
  /tmp/nm_client_ids.json   — {company_name: {id, client_code, rep_id}}
  /tmp/nm_client_inserts.sql  — batched INSERT INTO clients statements
"""
import csv, glob, json, uuid, re
from collections import defaultdict, Counter

CSV_DIR = "FullSales"
FILES = sorted(glob.glob(f"{CSV_DIR}/Sheet*.csv"))

rep_map = json.load(open("/tmp/nm_rep_map.json"))

# Majority rep per client via streaming
client_reps = defaultdict(Counter)
client_last_ad = {}  # client_name -> latest issue_date for last_ad_date

from datetime import datetime
def parse_issuedate(s):
    if not s: return None
    s = s.strip()
    if not s: return None
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y"):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def norm(s):
    return re.sub(r"\s+", " ", s.strip())

for fn in FILES:
    with open(fn, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row or row[0] == "Company" or len(row) < 11: continue
            company = norm(row[0])
            rep = row[10].strip()
            issue_date = parse_issuedate(row[6])
            if rep:
                client_reps[company][rep] += 1
            if issue_date:
                prior = client_last_ad.get(company)
                if prior is None or issue_date > prior:
                    client_last_ad[company] = issue_date

# Generate client records
client_ids = {}
used_codes = set()

def make_client_code(name):
    # 6-char code: first 3 letters of name + 3-digit suffix (1000 per base)
    base = re.sub(r"[^A-Z]", "", name.upper())[:3].ljust(3, "X")
    for suffix in range(999):
        code = f"{base}{suffix:03d}"
        if code not in used_codes:
            used_codes.add(code)
            return code
    # Absolute fallback: random 6 chars
    import random, string
    while True:
        code = base + "".join(random.choices(string.digits + string.ascii_uppercase, k=3))
        if code not in used_codes:
            used_codes.add(code)
            return code

for company in sorted(client_reps.keys() | set(client_last_ad.keys())):
    rep_counter = client_reps.get(company, Counter())
    top_rep_name = rep_counter.most_common(1)[0][0] if rep_counter else None
    rep_id = rep_map.get(top_rep_name, {}).get("team_id") if top_rep_name else None
    client_ids[company] = {
        "id": str(uuid.uuid4()),
        "client_code": make_client_code(company),
        "rep_id": rep_id,
        "last_ad_date": client_last_ad.get(company),
    }

with open("/tmp/nm_client_ids.json", "w") as f:
    json.dump(client_ids, f, indent=2)

# Generate SQL inserts in batches of 500
def sql_escape(s):
    if s is None: return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

batches = []
companies = sorted(client_ids.keys())
BATCH = 500
for i in range(0, len(companies), BATCH):
    chunk = companies[i:i+BATCH]
    values = []
    for company in chunk:
        c = client_ids[company]
        v = f"({sql_escape(c['id'])}, {sql_escape(company)}, 'Active', {sql_escape(c['client_code'])}, "
        v += f"{sql_escape(c['rep_id'])}, {sql_escape(c['last_ad_date'])})"
        values.append(v)
    sql = (
        "INSERT INTO clients (id, name, status, client_code, rep_id, last_ad_date) VALUES\n"
        + ",\n".join(values) + ";"
    )
    batches.append(sql)

with open("/tmp/nm_client_inserts.sql", "w") as f:
    f.write("\n\n".join(batches))

print(f"generated {len(client_ids)} clients in {len(batches)} batch(es)")
print(f"  with rep_id: {sum(1 for c in client_ids.values() if c['rep_id'])}")
print(f"  without rep_id: {sum(1 for c in client_ids.values() if not c['rep_id'])}")
