"""
Calls Supabase RPC endpoints via PostgREST using the anon key.
The RPCs are SECURITY DEFINER so they bypass RLS.
"""
import json, os, urllib.request, urllib.error

SUPABASE_URL = "https://hqywacyhpllapdwccmaw.supabase.co"
# Read anon key from .env (walk up from cwd)
def _find_env():
    cur = os.path.abspath(".")
    while cur and cur != "/":
        p = os.path.join(cur, ".env")
        if os.path.exists(p): return p
        cur = os.path.dirname(cur)
    return None
ANON_KEY = None
env_path = _find_env()
if env_path:
    for line in open(env_path):
        if line.startswith("VITE_SUPABASE_ANON_KEY="):
            ANON_KEY = line.split("=", 1)[1].strip()
            break

def call_rpc(name, body, timeout=120):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{name}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("apikey", ANON_KEY)
    req.add_header("Authorization", f"Bearer {ANON_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "params=single-object")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8')[:500]}")
        raise

if __name__ == "__main__":
    import sys
    print(call_rpc(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}))
