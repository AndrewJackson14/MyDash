"""
Matches PDF invoices to DB invoices by (client_id, invoice_date) and applies:
  - update invoice_number to PDF's ci-number (if matched)
  - set status (sent/overdue)
  - set balance_due from PDF
  - insert payments rows for partial payments

Unmatched PDFs are reported for manual review.

Strategy: call an RPC nm_apply_pdf_invoice that does the lookup+update
for each PDF invoice. Client_id is resolved by advertiser name via
clients map we already have.
"""
import json, re, uuid
from datetime import datetime
from exec_rpc import call_rpc

pdfs = json.load(open("/tmp/nm_pdf_invoices.json"))
client_ids = json.load(open("/tmp/nm_client_ids.json"))

def norm(s):
    s = s.strip()
    # Strip trailing punctuation and extra whitespace
    s = re.sub(r"\s+", " ", s)
    return s

# Build advertiser → client_id map. Use norm(advertiser) == norm(csv_company).
client_by_name = {norm(k).lower(): v["id"] for k, v in client_ids.items()}

# Also try stripping bullet chars and "-" prefixes
def fuzzy(s):
    s = norm(s).lower()
    s = s.replace("•", "").replace("  ", " ").strip()
    return s

# Extra fuzzy map
client_fuzzy = {fuzzy(k): v["id"] for k, v in client_ids.items()}

def f(s):
    if s is None: return 0
    return float(str(s).replace(',', ''))

def parse_pay_date(s):
    if not s: return None
    for fmt in ("%m/%d/%Y",):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

matched = []
unmatched_no_client = []
unmatched_no_invoice = []
partial_payments = []

for p in pdfs:
    adv = p.get("advertiser")
    if not adv:
        unmatched_no_client.append({"reason": "no advertiser", "pdf": p})
        continue
    client_id = client_by_name.get(norm(adv).lower()) or client_fuzzy.get(fuzzy(adv))
    if not client_id:
        unmatched_no_client.append({"advertiser": adv, "pdf_number": p.get("number"), "total": p.get("total")})
        continue
    if not p.get("date"):
        unmatched_no_invoice.append({"advertiser": adv, "reason": "no invoice date"})
        continue

    total = f(p.get("total"))
    due_after = f(p.get("due_after_pay")) if p.get("due_after_pay") else total
    balance = due_after
    status = "overdue" if p.get("due_date") and p["due_date"] < datetime.now().strftime("%Y-%m-%d") else "sent"

    matched.append({
        "pdf_number": p["number"],
        "client_id": client_id,
        "invoice_date": p["date"],
        "due_date": p.get("due_date"),
        "pdf_total": total,
        "balance_due": balance,
        "status": status,
        "advertiser": adv,
    })

    for pay_date, pay_amt in p.get("payments", []):
        partial_payments.append({
            "client_id": client_id,
            "invoice_date": p["date"],
            "received_at": parse_pay_date(pay_date) or "2026-04-12",
            "amount": f(pay_amt),
            "notes": f"PDF reconciliation — payment posted on {pay_date}",
        })

print(f"PDF invoices parsed:          {len(pdfs)}")
print(f"  matched to DB client:       {len(matched)}")
print(f"  unmatched (no client):      {len(unmatched_no_client)}")
print(f"  unmatched (no invoice date):{len(unmatched_no_invoice)}")
print(f"  with partial payments:      {len(partial_payments)}")

with open("/tmp/nm_pdf_matched.json", "w") as f_:
    json.dump(matched, f_)
with open("/tmp/nm_pdf_partial_payments.json", "w") as f_:
    json.dump(partial_payments, f_)
with open("/tmp/nm_pdf_unmatched.json", "w") as f_:
    json.dump({"no_client": unmatched_no_client, "no_invoice_date": unmatched_no_invoice}, f_, indent=2)

print("saved matched, partial_payments, unmatched")
