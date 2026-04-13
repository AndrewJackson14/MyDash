#!/usr/bin/env node
/**
 * backfill-media-assets.mjs
 * ────────────────────────
 * Recursively lists every file in BunnyCDN storage, and for each file that
 * doesn't already have a media_assets row, inserts one with publication_id
 * inferred from the top-level folder name. Safe to re-run — uses storage_path
 * as the dedupe key.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-media-assets.mjs [--dry-run]
 *
 * Inference rules:
 *   - Top-level folder "malibu-times"            → publication_id 'pub-the-malibu-times'
 *   - Top-level folder "paso-robles-press"       → 'pub-paso-robles-press'
 *   - Top-level folder "atascadero-news"         → 'pub-atascadero-news'
 *   - (etc. — see PUB_FOLDER_MAP below)
 *   - Anything else (general/, shared/, /media/) → publication_id NULL
 *   - Category defaults to 'general' on backfill — users can re-tag later
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = 'https://hqywacyhpllapdwccmaw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY in env');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Bunny Storage API — writes require the storage zone access key. Reads work
// via the CDN pull-zone but we need the LIST endpoint which needs the storage
// API key. Grab it from the env.
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_REGION = process.env.BUNNY_REGION || ''; // e.g. 'la' — blank = default (NY)
if (!BUNNY_STORAGE_ZONE || !BUNNY_ACCESS_KEY) {
  console.error('Missing BUNNY_STORAGE_ZONE or BUNNY_ACCESS_KEY in env');
  console.error('Add these to .env before running (Bunny dashboard → Storage Zone → Connect).');
  process.exit(1);
}
const BUNNY_HOST = BUNNY_REGION ? `${BUNNY_REGION}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
const CDN_BASE = process.env.BUNNY_CDN_BASE || 'https://cdn.13stars.media';

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
  return 'general';
}

// ── Bunny LIST API ─────────────────────────────────────
async function bunnyList(path) {
  const url = `https://${BUNNY_HOST}/${BUNNY_STORAGE_ZONE}/${path}${path.endsWith('/') ? '' : '/'}`;
  const res = await fetch(url, { headers: { AccessKey: BUNNY_ACCESS_KEY, Accept: 'application/json' } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Bunny list failed for ${path}: ${res.status}`);
  }
  return res.json();
}

// Recursively walk every folder, yielding leaf files (not directories).
async function* walk(path = '') {
  const items = await bunnyList(path).catch(err => { console.warn(`skip ${path}: ${err.message}`); return []; });
  for (const item of items) {
    const name = item.ObjectName;
    if (item.IsDirectory) {
      yield* walk(path ? `${path}/${name}` : name);
    } else {
      yield { ...item, fullPath: path ? `${path}/${name}` : name };
    }
  }
}

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log(`Backfill ${DRY_RUN ? '(DRY RUN) ' : ''}starting...`);

  // Load existing storage_path set so we can skip
  const existingPaths = new Set();
  let pg = 0;
  while (true) {
    const { data, error } = await sb.from('media_assets').select('storage_path').not('storage_path', 'is', null).range(pg * 1000, (pg + 1) * 1000 - 1);
    if (error) { console.error('Failed to read media_assets:', error); process.exit(1); }
    if (!data?.length) break;
    data.forEach(r => r.storage_path && existingPaths.add(r.storage_path));
    if (data.length < 1000) break;
    pg++;
  }
  console.log(`Existing media_assets rows: ${existingPaths.size}`);

  // Walk Bunny and collect new rows
  const toInsert = [];
  let scanned = 0;
  for await (const file of walk('')) {
    scanned++;
    if (scanned % 500 === 0) console.log(`  scanned ${scanned}, queued ${toInsert.length}`);
    if (existingPaths.has(file.fullPath)) continue;
    toInsert.push({
      file_name: file.ObjectName,
      mime_type: null,
      file_type: null,
      file_size: file.Length || null,
      storage_path: file.fullPath,
      cdn_url: `${CDN_BASE}/${file.fullPath}`,
      file_url: `${CDN_BASE}/${file.fullPath}`,
      width: null,
      height: null,
      publication_id: inferPublicationId(file.fullPath),
      category: inferCategory(file.fullPath),
      tags: [],
      created_at: file.DateCreated || new Date().toISOString(),
    });
  }
  console.log(`Scanned ${scanned} Bunny files. Inserting ${toInsert.length} new rows.`);

  if (DRY_RUN) {
    console.log('DRY RUN — showing first 5 rows that would be inserted:');
    toInsert.slice(0, 5).forEach(r => console.log('  ', r.storage_path, '→', r.publication_id || '(none)', r.category));
    return;
  }

  // Batch insert (1000 at a time)
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 1000) {
    const batch = toInsert.slice(i, i + 1000);
    const { error } = await sb.from('media_assets').insert(batch);
    if (error) { console.error(`Batch ${i} insert failed:`, error.message); continue; }
    inserted += batch.length;
    console.log(`  inserted ${inserted}/${toInsert.length}`);
  }
  console.log(`Done. Inserted ${inserted} rows.`);
}

main().catch(err => { console.error(err); process.exit(1); });
