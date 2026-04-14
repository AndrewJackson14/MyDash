"""
Builds match maps:
  /tmp/nm_rep_map.json   — {csv_rep_name: {match: "exact|fuzzy|none", team_id}}
  /tmp/nm_pub_map.json   — {csv_pub_name: {match, pub_id}}
Reports unmatched for user review.
"""
import json, re

# Current DB team_members (hardcoded from MCP query result — only 25 rows)
TEAM = {
    "Amberly Lahr": "c841eba8-a3db-4433-830f-bd582c0836d6",
    "Anthony Atkins": "23fdfa71-200c-45d1-81b3-7c92494c99d6",
    "Anthony McDemas": "925a188b-3038-489c-bd82-577cba505a0d",
    "Barbara Burke": "d7daaabf-f8b5-4ff3-b2e2-2736eae2e5c6",
    "Barbara Calandra": "5402cc0f-a58a-4164-a983-3f979ac70a27",
    "Cami Martin": "314af1e4-1336-43f8-adcb-b2ce92cf79cb",
    "Camille DeVaul": "f762f64d-adc7-425e-9b04-9c53467f7edc",
    "Christie Coyes": "4cd0de8a-528f-4748-ac56-18700b8707ee",
    "Dana McGraw": "7e7cb743-290a-488c-bfa6-0c4463d15546",
    "Dorie Leo": "6b61ccf5-30b0-4bf6-8e1f-3223bb5c515d",
    "Ellie Baisch": "750dac85-2d4e-4778-b1f5-5d0667c6fdd3",
    "Hayley Mattson": "2dbe04c8-7a44-40d4-ab5a-faa6661bad2a",
    "Jamie Self": "a380f3bf-618b-43c7-bb7d-b6dda8e49f2a",
    "Jennifer Rodman": "4656f31d-6c9d-4a39-9033-699dce5c7c09",
    "Kaleb Rich-Harris": "30a253d4-14f0-4a6c-9d64-41392915c513",
    "Karen Kagan": "aa07b28f-2d5c-419f-8670-4e8dd2107e7c",
    "Linda Perry": "c065e8ee-0d44-498f-bfeb-377dc92d81ef",
    "Lonna Weber": "a607f859-d7e3-41d5-8933-21bfeb267b38",
    "Lukas Johnson": "bf1ed050-206f-4b5c-ad94-be93c603a131",
    "Marie Tabela": "f7de8ff3-ace3-4e78-adff-c3d32ee78507",
    "Mary Abbott": "09fca9d5-c087-4501-9ca8-e76d7a8f99c1",
    "Mary Hogan": "441096c0-f013-42f4-bbdc-74509e37b030",
    "Mike Chaldu": "f9790423-2419-42c4-b28c-dd22d1d70232",
    "Neil Schumaker": "d4f51915-88a5-4553-a07b-5f253514c9c8",
    "Nicholas Mattson": "828a3f23-cf4b-4054-98c1-db1577ecad4c",
}

PUBS = {
    "Admin Services": "pub-admin",
    "Annual Wall Calendar": "pub-awc",
    "Atascadero News": "pub-atascadero-news",
    "Atascadero News Magazine": "pub-atascadero-news-maga",
    "Avila Beach Life": "pub-abl",
    "Calabasas Style Magazine": "pub-calabasas-style",
    "California Mid-State Fair Guide": "pub-california-mid-state",
    "Central Coast Journal": "pub-cc-journal",
    "Central Coast Living": "pub-central-coast-living",
    "Central Coast Ranch Life™": "pub-ccrl",
    "Central Coast TRVLR™": "pub-cctv",
    "CMSF Daily Schedule": "pub-cmsf",
    "Colony Days Tab": "pub-cdt",
    "Crimson Tab": "pub-ct",
    "Digital Ad Services": "pub-digital-ad-svc",
    "Hidden Hills Community Register": "pub-hidden-hills-register",
    "Hidden Hills Magazine": "pub-hidden-hills-mag",
    "Malibu Magazine": "pub-malibu-magazine",
    "Morro Bay Life": "pub-morro-bay-life",
    "OpenDoor Directories": "pub-opendoor-directories",
    "Palisades Magazine": "pub-palisades-magazine",
    "Paso Robles Magazine": "pub-paso-robles-magazine",
    "Paso Robles Press": "pub-paso-robles-press",
    "Pioneer Day": "pub-pd",
    "Print & Production Services": "pub-pps",
    "Promos": "pub-promos",
    "Santa Ynez Valley Star": "pub-santa-ynez-valley-st",
    "Special Feature Tab": "pub-special-feature",
    "Special Projects": "pub-special-projects",
    "Specialty Guides & Booklets": "pub-sgb",
    "The Malibu Times": "pub-the-malibu-times",
    "What to Do in Malibu": "pub-what-to-do-malibu",
}

def norm(s):
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

team_norm = {norm(k): v for k, v in TEAM.items()}
pub_norm = {norm(k): v for k, v in PUBS.items()}

csv_reps = json.load(open("/tmp/nm_unique_reps.json"))
csv_pubs = json.load(open("/tmp/nm_unique_pubs.json"))

MANUAL_REP_OVERRIDES = {
    "*Unassigned*": None,  # sentinel — leave assigned_to NULL
}

rep_map = {}
rep_unmatched = []
for r in csv_reps:
    if r in MANUAL_REP_OVERRIDES:
        rep_map[r] = {"match": "override", "team_id": MANUAL_REP_OVERRIDES[r]}
        continue
    key = norm(r)
    if key in team_norm:
        rep_map[r] = {"match": "exact", "team_id": team_norm[key]}
    else:
        rep_map[r] = {"match": "none", "team_id": None}
        rep_unmatched.append((r, csv_reps[r]))

MANUAL_PUB_OVERRIDES = {
    "Special Project Magazine": "pub-special-projects",  # fuzzy match to Special Projects
}

pub_map = {}
pub_unmatched = []
for p in csv_pubs:
    if p in MANUAL_PUB_OVERRIDES:
        pub_map[p] = {"match": "override", "pub_id": MANUAL_PUB_OVERRIDES[p]}
        continue
    key = norm(p)
    if key in pub_norm:
        pub_map[p] = {"match": "exact", "pub_id": pub_norm[key]}
    else:
        pub_map[p] = {"match": "none", "pub_id": None}
        pub_unmatched.append((p, csv_pubs[p]))

with open("/tmp/nm_rep_map.json", "w") as f:
    json.dump(rep_map, f, indent=2)
with open("/tmp/nm_pub_map.json", "w") as f:
    json.dump(pub_map, f, indent=2)

print(f"reps:  {len(rep_map)} ({len(rep_unmatched)} unmatched)")
if rep_unmatched:
    for r, c in rep_unmatched: print(f"  UNMATCHED REP: {r!r} ({c} sales)")
print(f"pubs:  {len(pub_map)} ({len(pub_unmatched)} unmatched)")
if pub_unmatched:
    for p, c in pub_unmatched: print(f"  UNMATCHED PUB: {p!r} ({c} sales)")
