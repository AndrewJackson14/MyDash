#!/usr/bin/env node
/**
 * backfill-media-assets.mjs
 * ────────────────────────
 * Recursively walks every file in the BunnyCDN storage zone (via the
 * existing `bunny-storage` edge function — no local Bunny credentials
 * needed) and inserts a media_assets row for any file that doesn't
 * already have one. Publication is inferred from the top-level folder
 * name; category is inferred from path heuristics. Re-run safe — uses
 * storage_path as the dedupe key.
 *
 * Why the edge function: the Bunny Storage API key is a Supabase
 * secret, not something we want duplicated in local env files. The
 * edge function already holds it, and its LIST endpoint is exactly
 * what we need here.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-media-assets.mjs [--dry-run]
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY   — required for media_assets INSERT
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = 'https://hqywacyhpllapdwccmaw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in env. Get it from');
  console.error('  Supabase dashboard → Project Settings → API → service_role');
  console.error('Then:  SUPABASE_SERVICE_ROLE_KEY=... node --env-file=.env scripts/backfill-media-assets.mjs');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const EDGE_URL = `${SUPABASE_URL}/functions/v1/bunny-storage`;
const CDN_BASE = 'https://cdn.13stars.media';

// ── Folder → publication_id inference ──────────────────
const PUB_FOLDER_MAP = {
  'malibu-times': 'pub-the-malibu-times',
  'the-malibu-times': 'pub-the-malibu-times',
  'paso-robles-press': 'pub-paso-robles-press',
  'atascadero-news': 'pub-atascadero-news',
  'paso-magazine': 'pub-paso-magazine',
  'paso-robles-magazine': 'pub-paso-magazine',
  'atascadero-news-magazine': 'pub-atascadero-news-maga',
  'atascadero-magazine': 'pub-atascadero-news-maga',
  'santa-ynez-valley-star': 'pub-santa-ynez-valley-st',
  'malibu-magazine': 'pub-malibu-magazine',
};
function inferPublicationId(storagePath) {
  const firstSeg = storagePath.split('/')[0].toLowerCase();
  return PUB_FOLDER_MAP[firstSeg] || null;
}
function inferCategory(storagePath) {
  const lower = storagePath.toLowerCase();
  if (lower.includes('/logo') || lower.includes('/logos/')) return 'pub_logo';
  if (lower.includes('/featured/') || lower.includes('story') || lower.includes('article')) return 'story_image';
  if (lower.includes('/ads/') || lower.includes('/ad-')) return 'ad_creative';
  if (lower.includes('/legal') || lower.includes('/notice')) return 'legal_scan';
  if (lower.includes('/proof')) return 'ad_proof';
  if (lower.includes('/clients/') && lower.includes('/assets')) return 'client_logo';
  return 'general';
}

// ── List via bunny-storage edge function ──────────────
// The edge function enriches each file with `fullPath` and `cdnUrl`
// so we get exactly what media_assets needs.
async function bunnyList(path) {
  const res = await fetch(EDGE_URL, {
    method: 'GET',
    headers: {
      'x-action': 'list',
      'x-path': path || '',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`list ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function* walk(path = '') {
  let items;
  try { items = await bunnyList(path); }
  catch (err) { console.warn(`  skip ${path || '/'}: ${err.message}`); return; }
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item.IsDirectory) {
      yield* walk(path ? `${path}/${item.ObjectName}` : item.ObjectName);
    } else {
      yield item;
    }
  }
}

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log(`Backfill ${DRY_RUN ? '(DRY RUN) ' : ''}starting...`);
  console.log(`  Edge function: ${EDGE_URL}`);

  // Load existing storage_path set so we skip anything already tagged
  const existingPaths = new Set();
  let pg = 0;
  while (true) {
    const { data, error } = await sb.from('media_assets')
      .select('storage_path')
      .not('storage_path', 'is', null)
      .range(pg * 1000, (pg + 1) * 1000 - 1);
    if (error) { console.error('Failed to read media_assets:', error); process.exit(1); }
    if (!data?.length) break;
    data.forEach(r => r.storage_path && existingPaths.add(r.storage_path));
    if (data.length < 1000) break;
    pg++;
  }
  console.log(`  Existing media_assets rows: ${existingPaths.size}`);

  // Walk Bunny via the edge function and queue new rows
  const toInsert = [];
  let scanned = 0;
  for await (const file of walk('')) {
    scanned++;
    if (scanned % 500 === 0) console.log(`  scanned ${scanned}, queued ${toInsert.length}`);
    const storagePath = file.fullPath;
    if (!storagePath || existingPaths.has(storagePath)) continue;
    toInsert.push({
      file_name: file.ObjectName,
      mime_type: null,
      file_type: null,
      file_size: file.Length || null,
      storage_path: storagePath,
      cdn_url: file.cdnUrl || `${CDN_BASE}/${storagePath}`,
      file_url: file.cdnUrl || `${CDN_BASE}/${storagePath}`,
      width: null,
      height: null,
      publication_id: inferPublicationId(storagePath),
      category: inferCategory(storagePath),
      tags: [],
      created_at: file.DateCreated || new Date().toISOString(),
    });
  }
  console.log(`  Scanned ${scanned} Bunny files. New rows to insert: ${toInsert.length}`);

  // Summary breakdown — by top-level folder, inferred publication, category
  const byTopFolder = {};
  const byPub = {};
  const byCat = {};
  for (const row of toInsert) {
    const seg = row.storage_path.split('/')[0] || '(root)';
    byTopFolder[seg] = (byTopFolder[seg] || 0) + 1;
    byPub[row.publication_id || '(none)'] = (byPub[row.publication_id || '(none)'] || 0) + 1;
    byCat[row.category] = (byCat[row.category] || 0) + 1;
  }
  const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  console.log('\nBreakdown by top-level folder:');
  sortEntries(byTopFolder).slice(0, 20).forEach(([k, v]) => console.log(`  ${String(v).padStart(8)}  ${k}`));
  console.log('\nBreakdown by inferred publication:');
  sortEntries(byPub).forEach(([k, v]) => console.log(`  ${String(v).padStart(8)}  ${k}`));
  console.log('\nBreakdown by inferred category:');
  sortEntries(byCat).forEach(([k, v]) => console.log(`  ${String(v).padStart(8)}  ${k}`));

  if (DRY_RUN) {
    console.log('\nDRY RUN — first 10 row paths:');
    toInsert.slice(0, 10).forEach(r =>
      console.log(`  ${r.storage_path}  → ${r.publication_id || '(none)'}  ${r.category}`)
    );
    if (toInsert.length === 0) console.log('  (nothing new — everything already tagged)');
    return;
  }

  // Batch insert 1000 at a time
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 1000) {
    const batch = toInsert.slice(i, i + 1000);
    const { error } = await sb.from('media_assets').insert(batch);
    if (error) { console.error(`  Batch ${i}-${i + batch.length} insert failed:`, error.message); continue; }
    inserted += batch.length;
    console.log(`  inserted ${inserted}/${toInsert.length}`);
  }
  console.log(`Done. Inserted ${inserted} rows.`);
}

main().catch(err => { console.error(err); process.exit(1); });
