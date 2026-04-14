"""
Inserts all clients via nm_bulk_insert_clients RPC in batches.
"""
import json
from exec_rpc import call_rpc

client_ids = json.load(open("/tmp/nm_client_ids.json"))

BATCH_SIZE = 500
clients = [
    {
        "id": c["id"],
        "name": name,
        "client_code": c["client_code"],
        "rep_id": c["rep_id"] or "",
        "last_ad_date": c["last_ad_date"] or "",
    }
    for name, c in client_ids.items()
]

total = 0
for i in range(0, len(clients), BATCH_SIZE):
    chunk = clients[i:i+BATCH_SIZE]
    n = call_rpc("nm_bulk_insert_clients", {"p_clients": chunk})
    total += n
    print(f"batch {i//BATCH_SIZE + 1}: inserted {n} (running total: {total})")

print(f"\nTOTAL CLIENTS INSERTED: {total}")
