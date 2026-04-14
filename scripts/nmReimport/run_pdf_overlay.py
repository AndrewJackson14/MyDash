"""Execute the PDF overlay in one call."""
import json
from exec_rpc import call_rpc

matched = json.load(open("/tmp/nm_pdf_matched.json"))
result = call_rpc("nm_apply_pdf_batch", {"p_matches": matched})
print(f"PDF overlay result: {result}")
