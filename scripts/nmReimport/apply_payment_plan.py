"""
Parses PaymentPlan_Job20308_01.pdf and applies the overlay:
  - Same invoice header + line format as the Invoice_Job* PDFs
  - Match by (client_id, invoice_date) to existing DB invoices
  - Create standalone invoices for unmatched entries
  - Insert partial payment rows where applicable
"""
from pypdf import PdfReader
import json, re
from datetime import datetime
from exec_rpc import call_rpc

import os
PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "FullSales", "PaymentPlan_Job20308_01.pdf")

INV_RE = re.compile(r'Invoice Number:\s*([\w\-]+)')
IDATE_RE = re.compile(r'Invoice Date:\s*([\d/]+)')
DDATE_RE = re.compile(r'Due Date:\s*([\d/]+)')
ADV_RE = re.compile(r'Advertiser\s*\n\s*(.+)')
REP_RE = re.compile(r'Sales Rep\s*\n\s*(.+)')
TOTAL_RE = re.compile(r'^Total\s*\$([\d,\.]+)', re.M)
BAL_TOTAL_RE = re.compile(r'Account Balance Total \(Including this invoice\):\s*\$([\d,\.\-]+)')
PAY_RE = re.compile(r'Customer Account payment posted on ([\d/]+)\s*\(\$?([\d,\.\-]+)\)')
DUE_AFTER_RE = re.compile(r'Total Due After Payments\s*\$([\d,\.\-]+)')

def parse_iso(s):
    if not s: return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def parse_block(text):
    inv = {}
    m = INV_RE.search(text); inv['number'] = m.group(1) if m else None
    m = IDATE_RE.search(text); inv['date'] = parse_iso(m.group(1) if m else None)
    m = DDATE_RE.search(text); inv['due_date'] = parse_iso(m.group(1) if m else None)
    m = ADV_RE.search(text); inv['advertiser'] = m.group(1).strip() if m else None
    m = REP_RE.search(text); inv['rep'] = m.group(1).strip() if m else None
    m = BAL_TOTAL_RE.search(text); inv['account_balance'] = m.group(1) if m else None
    m = DUE_AFTER_RE.search(text); inv['due_after_pay'] = m.group(1) if m else None
    inv['payments'] = [(d, a) for d, a in PAY_RE.findall(text)]
    totals = TOTAL_RE.findall(text)
    inv['total'] = totals[-1] if totals else None
    return inv

# Parse PDF with continuation-page merge
reader = PdfReader(PDF_PATH)
invoices = []
i = 0
while i < len(reader.pages):
    text = reader.pages[i].extract_text() or ""
    j = i + 1
    while j < len(reader.pages):
        nxt = reader.pages[j].extract_text() or ""
        if "Invoice Number" in nxt: break
        text += "\n" + nxt
        j += 1
    if "Invoice Number" in text:
        inv = parse_block(text)
        inv['_pdf'] = PDF_PATH.split('/')[-1]
        inv['_page'] = i + 1
        invoices.append(inv)
    i = j

print(f"parsed {len(invoices)} invoices from payment plan PDF")
print(f"  missing number: {sum(1 for x in invoices if not x['number'])}")
print(f"  missing total:  {sum(1 for x in invoices if not x['total'])}")
print(f"  with payments:  {sum(1 for x in invoices if x['payments'])}")

def f(s):
    if s is None: return 0
    return float(str(s).replace(',', ''))

tot = sum(f(i['total']) for i in invoices)
bal = sum(f(i['due_after_pay']) if i['due_after_pay'] else f(i['total']) for i in invoices)
print(f"  sum total:   ${tot:,.2f}")
print(f"  sum balance: ${bal:,.2f}")

# Build matched entries against clients
client_ids = json.load(open("/tmp/nm_client_ids.json"))
def norm(s): return re.sub(r"\s+", " ", s.strip()).lower()
def fuzzy(s): return norm(s).replace("•", "").replace("  ", " ").strip()
client_by_name = {norm(k): v["id"] for k, v in client_ids.items()}
client_fuzzy = {fuzzy(k): v["id"] for k, v in client_ids.items()}

matched = []
unmatched = []
partial_payments = []
today = datetime.now().strftime("%Y-%m-%d")

for inv in invoices:
    adv = inv.get('advertiser') or ''
    cid = client_by_name.get(norm(adv)) or client_fuzzy.get(fuzzy(adv))
    if not cid or not inv.get('date'):
        unmatched.append(inv)
        continue
    total = f(inv['total'])
    due_after = f(inv['due_after_pay']) if inv['due_after_pay'] else total
    status = "overdue" if inv.get('due_date') and inv['due_date'] < today else "sent"
    matched.append({
        "pdf_number": inv['number'],
        "client_id": cid,
        "invoice_date": inv['date'],
        "due_date": inv.get('due_date'),
        "pdf_total": total,
        "balance_due": due_after,
        "status": status,
        "advertiser": adv,
    })
    for pd_, pa_ in inv.get('payments', []):
        partial_payments.append({
            "client_id": cid,
            "invoice_date": inv['date'],
            "received_at": parse_iso(pd_) or "2026-04-12",
            "amount": f(pa_),
            "notes": f"Payment plan — posted on {pd_}",
        })

print(f"\nmatched to client:    {len(matched)}")
print(f"unmatched clients:    {len(unmatched)}")
print(f"partial payments:     {len(partial_payments)}")

# Save for audit
with open("/tmp/nm_paymentplan_matched.json", "w") as fo:
    json.dump(matched, fo)

# Apply the overlay (RPC already exists from main run)
result = call_rpc("nm_apply_pdf_batch", {"p_matches": matched})
print(f"\napply result: {result}")
applied_matched = result[0]["matched"]
applied_missing = result[0]["missing"]

# For any that didn't find an existing invoice, check against DB and create standalone
if applied_missing > 0:
    sales_map = json.load(open("/tmp/nm_sales_map.json"))
    db_keys = set()
    for s in sales_map:
        if s["invoice_date"]:
            db_keys.add((s["client_id"], s["invoice_date"]))
    needs_standalone = [m for m in matched if (m["client_id"], m["invoice_date"]) not in db_keys]
    if needs_standalone:
        print(f"creating {len(needs_standalone)} standalone invoices for unmatched payment plan entries")
        r2 = call_rpc("nm_create_standalone_invoices", {"p_invoices": needs_standalone})
        print(f"standalone inserted: {r2}")

# Insert partial payments
if partial_payments:
    r3 = call_rpc("nm_insert_partial_payments", {"p_payments": partial_payments})
    print(f"partial payments inserted: {r3}")

# Report unmatched (no client)
if unmatched:
    print(f"\nUNMATCHED PAYMENT PLAN ENTRIES (no client match):")
    for u in unmatched:
        print(f"  {u.get('number')} {u.get('advertiser')} date={u.get('date')} total={u.get('total')}")
