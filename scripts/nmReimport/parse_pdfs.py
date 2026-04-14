"""
Parses all PDFs in FullSales/ with continuation-page merge.
Writes:
  /tmp/nm_pdf_invoices.json  — list of open invoices with header + totals + payments
"""
from pypdf import PdfReader
import glob, re, json

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
    from datetime import datetime
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def is_continuation(text):
    return "INVOICE" not in text.split("\n")[0:3].__str__() and "Invoice Number" not in text

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

all_invoices = []
continuation_pages = []

for pdf in sorted(glob.glob("FullSales/Invoice_*.pdf")):
    r = PdfReader(pdf)
    i = 0
    while i < len(r.pages):
        text = r.pages[i].extract_text() or ""
        # Merge any continuation pages that follow
        j = i + 1
        while j < len(r.pages):
            next_text = r.pages[j].extract_text() or ""
            if "Invoice Number" in next_text:
                break
            text += "\n" + next_text
            continuation_pages.append((pdf, j + 1))
            j += 1
        if "Invoice Number" in text:
            inv = parse_block(text)
            inv['_pdf'] = pdf.split('/')[-1]
            inv['_page'] = i + 1
            all_invoices.append(inv)
        i = j

print(f"invoices parsed:      {len(all_invoices)}")
print(f"continuation merges:  {len(continuation_pages)}")
print(f"missing number:       {sum(1 for x in all_invoices if not x['number'])}")
print(f"missing total:        {sum(1 for x in all_invoices if not x['total'])}")
print(f"with payments:        {sum(1 for x in all_invoices if x['payments'])}")

def f(s):
    if not s: return 0
    return float(str(s).replace(',', ''))

tot_billed = sum(f(i['total']) for i in all_invoices)
tot_balance = sum(f(i['due_after_pay']) if i['due_after_pay'] else f(i['total']) for i in all_invoices)
print(f"sum billed:   ${tot_billed:,.2f}")
print(f"sum balance:  ${tot_balance:,.2f}")

with open('/tmp/nm_pdf_invoices.json', 'w') as f:
    json.dump(all_invoices, f, indent=2, default=str)
print("wrote /tmp/nm_pdf_invoices.json")
