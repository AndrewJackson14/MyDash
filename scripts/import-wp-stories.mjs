#!/usr/bin/env node
/**
 * import-wp-stories.mjs
 * ────────────────────
 * Imports legacy WordPress posts (extracted as NDJSON from the WP DB on
 * the stellarpress host) into MyDash's `stories` table so unmigrated
 * articles become reachable via the existing redirect map.
 *
 * Each NDJSON row comes from the extraction SQL and carries:
 *   slug, title, body, excerpt, author, published_at, modified_at,
 *   category_path, category_root, category_slug, featured_image_path,
 *   seo_title, seo_description
 *
 * Usage:
 *   # dry run (default)
 *   node --env-file=.env scripts/import-wp-stories.mjs \
 *     --input=/tmp/atn_import.ndjson \
 *     --legacy-host=atascaderonews.com \
 *     --default-pub=pub-atascadero-news \
 *     --magazine-pub=pub-atascadero-news-maga \
 *     --magazine-cat-root=atascadero-news-magazine
 *
 *   # actually write
 *   ... --apply
 *
 * Safety invariants:
 *   - Skips slugs starting with "__trashed"
 *   - Skips posts with empty title or body
 *   - Skips any slug that already exists in the target publication
 *     (even if the existing story is linked to a different legacy_url)
 *   - `sent_to_web=true` + `status=Ready` so the SPA renders these
 *     immediately; the bare-slug canonical form activates the existing
 *     redirect map entry only after running generate-legacy-redirect-map
 *     and redeploying the map.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const args = Object.fromEntries(process.argv.slice(2)
  .filter(a => a.startsWith('--'))
  .map(a => {
    const [k, v = true] = a.slice(2).split('=');
    return [k, v];
  }));

const INPUT = args.input;
const LEGACY_HOST = args['legacy-host'];
const DEFAULT_PUB = args['default-pub'];
const MAG_PUB = args['magazine-pub'];
const MAG_ROOT = args['magazine-cat-root'];
const APPLY = !!args.apply;

for (const [name, val] of [
  ['--input', INPUT],
  ['--legacy-host', LEGACY_HOST],
  ['--default-pub', DEFAULT_PUB],
]) {
  if (!val) { console.error(`Missing ${name}`); process.exit(1); }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Title-case a slug for the display `category` column, matching the
// pattern we saw on existing rows ("veterans" → "Veterans").
function titleCase(slug) {
  if (!slug) return '';
  return slug.split(/[-_/]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function buildLegacyUrl(host, catPath, slug) {
  const path = catPath ? `${catPath}/${slug}` : `uncategorized/${slug}`;
  return `https://${host}/${path}/`;
}

function buildRow(r) {
  if (!r.slug || r.slug.startsWith('__trashed')) return null;
  if (!r.title || !r.body) return null;

  const pub = (r.category_root === MAG_ROOT && MAG_PUB) ? MAG_PUB : DEFAULT_PUB;
  const catSlug = r.category_slug || r.category_root || null;
  const categoryDisplay = catSlug ? titleCase(catSlug) : null;
  const legacyUrl = buildLegacyUrl(LEGACY_HOST, r.category_path, r.slug);

  return {
    publication_id: pub,
    site_id: pub,
    title: r.title,
    slug: r.slug,
    body: r.body,
    excerpt: r.excerpt || null,
    author: r.author || null,
    category: categoryDisplay,
    category_slug: catSlug,
    status: 'Ready',
    web_status: 'published',
    sent_to_web: true,
    published_at: r.published_at,
    first_published_at: r.published_at,
    seo_title: r.seo_title || r.title,
    seo_description: r.seo_description || r.excerpt || null,
    legacy_url: legacyUrl,
    story_type: 'article',
    content_type: 'article',
    priority: 'normal',
    audience: 'public',
    is_premium: false,
    is_featured: false,
    is_page: false,
    is_sponsored: false,
    sent_to_print: false,
    web_approved: true,   // these are already published articles
  };
}

async function existingSlugsInPubs(pubs) {
  const out = new Set();
  for (const pub of pubs) {
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await sb
        .from('stories')
        .select('slug')
        .eq('publication_id', pub)
        .not('slug', 'is', null)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) out.add(`${pub}:${r.slug}`);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return out;
}

async function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').trim().split('\n');
  console.error(`Loaded ${lines.length} NDJSON rows from ${INPUT}`);

  const rows = [];
  const dropReasons = {};
  for (const line of lines) {
    let r;
    try { r = JSON.parse(line); } catch { dropReasons.parse_fail = (dropReasons.parse_fail || 0) + 1; continue; }
    const row = buildRow(r);
    if (!row) {
      const reason = !r.slug || r.slug.startsWith('__trashed') ? 'trashed_or_no_slug'
        : !r.title ? 'no_title' : !r.body ? 'no_body' : 'other';
      dropReasons[reason] = (dropReasons[reason] || 0) + 1;
      continue;
    }
    rows.push(row);
  }
  console.error(`  ${rows.length} rows survived filter`);
  for (const [k, v] of Object.entries(dropReasons)) console.error(`    dropped · ${k}: ${v}`);

  // Dedup: skip rows whose (pub, slug) already exists.
  const pubSet = [...new Set(rows.map(r => r.publication_id))];
  const existing = await existingSlugsInPubs(pubSet);
  console.error(`Existing slugs in target pubs: ${existing.size}`);
  const toInsert = rows.filter(r => !existing.has(`${r.publication_id}:${r.slug}`));
  console.error(`  ${toInsert.length} rows to insert, ${rows.length - toInsert.length} already present`);

  // Breakdown
  const byPub = {};
  for (const r of toInsert) byPub[r.publication_id] = (byPub[r.publication_id] || 0) + 1;
  for (const [p, n] of Object.entries(byPub)) console.error(`    ${p}: ${n}`);

  if (!APPLY) {
    console.error('(dry run — pass --apply to insert)');
    if (toInsert[0]) {
      console.error('First row preview:');
      const preview = { ...toInsert[0] };
      if (preview.body?.length > 160) preview.body = preview.body.slice(0, 160) + '…';
      console.error(JSON.stringify(preview, null, 2));
    }
    return;
  }

  // Insert in chunks of 100 to keep request bodies reasonable.
  let inserted = 0, failed = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { data, error } = await sb.from('stories').insert(batch).select('id');
    if (error) {
      // Fall back to per-row inserts so one bad row doesn't kill the batch.
      for (const row of batch) {
        const { error: rowErr } = await sb.from('stories').insert(row);
        if (rowErr) { failed++; console.error(`  fail · ${row.slug}: ${rowErr.message}`); }
        else inserted++;
      }
    } else {
      inserted += data?.length || 0;
    }
    process.stderr.write(`  ${Math.min(i + 100, toInsert.length)}/${toInsert.length}\r`);
  }
  console.error(`\nInserted ${inserted} stories · ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
