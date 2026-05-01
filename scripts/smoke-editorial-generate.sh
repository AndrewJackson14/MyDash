#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Smoke test for the editorial_generate Edge Function (v3).
#
# Exercises both modes (in_place, new_draft) and verifies the
# response shape additions from spec v2:
#   - voice_profile_slug field present
#   - model field present
#
# Usage:
#   1. Open MyDash in the browser, sign in as nic@13stars.media
#      (or any Publisher / Content Editor / Editor-in-Chief / admin).
#   2. DevTools → Application → Local Storage → mydash.media →
#      copy the access_token from sb-...-auth-token JSON.
#   3. JWT=… ./scripts/smoke-editorial-generate.sh
#
# Or paste the JWT inline:
#   JWT=eyJhbGc... ./scripts/smoke-editorial-generate.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${JWT:-}" ]]; then
  echo "ERROR: set JWT env var to a valid authenticated user token."
  exit 1
fi

FN_URL="https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/editorial_generate"

# Pick a real published story to use as source. Easiest: query
# Supabase via the REST API if you have a published story id, or
# substitute one manually below.
SOURCE_STORY_ID="${SOURCE_STORY_ID:-REPLACE_WITH_REAL_STORY_ID}"

# Sample source body (a sketched press release). Real test should
# paste a real source body to exercise the full prompt size.
SOURCE_BODY='<p>The 2025 Colony Days Parade rolled down El Camino Real on Saturday, October 19, drawing thousands of spectators and dozens of floats. Mayor Heather Moreno served as grand marshal.</p><p>Festivities continued at Sunken Gardens with live music and the annual barbecue.</p>'

UPDATES='Date: Saturday, October 18, 2026
Time: 10am parade, 1pm BBQ in Sunken Gardens
Grand marshal: Lt. Gov. Eleni Kounalakis
Quote — Mayor Heather Moreno: "Colony Days is the heartbeat of Atascadero."'

echo "─── Test A: in_place mode ─────────────────────────────"
echo "Calling editorial_generate with mode=in_place..."
RESP_A=$(curl -sS -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "$(jq -n --arg sid "$SOURCE_STORY_ID" --arg body "$SOURCE_BODY" --arg upd "$UPDATES" '{
    mode: "in_place",
    story_id: $sid,
    source_body: $body,
    updates_text: $upd
  }')")

echo "$RESP_A" | jq '{
  has_revised_html: (.revised_html | type == "string" and length > 50),
  revised_html_length: (.revised_html // "" | length),
  voice_profile_used,
  voice_profile_slug,
  model,
  error
}'

echo
echo "─── Test B: new_draft mode ────────────────────────────"
echo "Calling editorial_generate with mode=new_draft..."
RESP_B=$(curl -sS -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "$(jq -n --arg sid "$SOURCE_STORY_ID" --arg body "$SOURCE_BODY" --arg upd "$UPDATES" '{
    mode: "new_draft",
    source_story_id: $sid,
    source_body: $body,
    updates_text: $upd
  }')")

echo "$RESP_B" | jq '{
  has_revised_html: (.revised_html | type == "string" and length > 50),
  revised_html_length: (.revised_html // "" | length),
  voice_profile_used,
  voice_profile_slug,
  model,
  error
}'

echo
echo "─── Test C: validation — in_place without story_id ────"
curl -sS -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "$(jq -n --arg body "$SOURCE_BODY" --arg upd "$UPDATES" '{
    mode: "in_place",
    source_body: $body,
    updates_text: $upd
  }')" | jq

echo
echo "─── Test D: validation — new_draft without source_story_id ──"
curl -sS -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "$(jq -n --arg body "$SOURCE_BODY" --arg upd "$UPDATES" '{
    mode: "new_draft",
    source_body: $body,
    updates_text: $upd
  }')" | jq

echo
echo "─── Test E: legacy v1 (no mode field) defaults to in_place ──"
curl -sS -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "$(jq -n --arg sid "$SOURCE_STORY_ID" --arg body "$SOURCE_BODY" --arg upd "$UPDATES" '{
    story_id: $sid,
    source_body: $body,
    updates_text: $upd
  }')" | jq '{
    has_revised_html: (.revised_html | type == "string" and length > 50),
    voice_profile_used,
    voice_profile_slug,
    model
  }'
