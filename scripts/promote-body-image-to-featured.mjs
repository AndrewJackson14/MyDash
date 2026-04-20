#!/usr/bin/env node
/**
 * promote-body-image-to-featured.mjs
 * ──────────────────────────────────
 * For stories whose featured_image_url is NULL but whose body carries
 * at least one <img>, promote the first CDN-hosted <img src> to
 * featured_image_url. Matches legacy WordPress rendering behavior
 * where the first in-body image implicitly served as the hero when
 * no _thumbnail_id was set.
 *
 * Safety:
 *   - Only touches rows where featured_image_url IS NULL
 *   - Only accepts src URLs already on cdn.13stars.media (verified
 *     live by the rewrite pass). Skips wp-content/uploads and other
 *     hosts we haven't migrated — those get picked up when their
 *     source site is migrated later.
 *   - Strips -NNNxMMM size suffix if present (belt-and-suspenders;
 *     the rewrite pass already did this, but cheap to repeat).
 *   - Dry-run by default; --apply writes.
 *
 * Usage:
 *   node --env-file=.env scripts/promote-body-image-to-featured.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const CDN_HOST = 'cdn.13stars.media';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// First <img src="..."> whose src is on our CDN.
const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

function pickFirstCdnImg(body) {
  if (!body) return null;
  const m = body.match(IMG_RE);
  if (!m) return null;
  let src = m[1].trim();
  // Skip obvious non-image embeds (shouldn't happen but safe).
  if (!src || src.startsWith('data:')) return null;
  // Normalize protocol-relative to https.
  if (src.startsWith('//')) src = 'https:' + src;
  // Only accept CDN-hosted images — anything else may still be a
  // dead link, and we don't want to swap "missing FI" for "broken FI".
  let u;
  try { u = new URL(src); } catch { return null; }
  if (u.hostname !== CDN_HOST) return null;
  // Strip any residual size suffix (should already be gone post-rewrite).
  const cleaned = u.pathname.replace(/-(\d+)x(\d+)(\.[a-z0-9]+)$/i, '$3');
  u.pathname = cleaned;
  return u.toString();
}

async function loadCandidates() {
  const out = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('stories')
      .select('id,slug,publication_id,body')
      .is('featured_image_url', null)
      .ilike('body', '%<img %')
      .range(from, from + pageSize - 1)
      .order('id');
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function main() {
  console.error('Loading stories with null featured_image_url + body <img>…');
  const rows = await loadCandidates();
  console.error(`  ${rows.length} candidates`);

  const updates = [];
  const stats = { picked: 0, no_cdn_img: 0 };
  const byPub = {};
  for (const r of rows) {
    const url = pickFirstCdnImg(r.body);
    if (!url) { stats.no_cdn_img++; continue; }
    updates.push({ id: r.id, featured_image_url: url });
    stats.picked++;
    byPub[r.publication_id] = (byPub[r.publication_id] || 0) + 1;
  }
  console.error(`\nPromotable:      ${stats.picked}`);
  console.error(`No CDN img src:  ${stats.no_cdn_img} (other-host or unmigrated)`);
  for (const [p, n] of Object.entries(byPub)) console.error(`  ${p}: ${n}`);

  if (updates[0]) {
    const r = rows.find(x => x.id === updates[0].id);
    console.error('\nSample:');
    console.error(`  slug: ${r.slug}`);
    console.error(`  →     ${updates[0].featured_image_url}`);
  }

  if (!APPLY) { console.error('\n(dry run — pass --apply to write)'); return; }

  let written = 0, failed = 0;
  for (let i = 0; i < updates.length; i += 20) {
    const chunk = updates.slice(i, i + 20);
    const results = await Promise.all(chunk.map(u => {
      const { id, ...patch } = u;
      // Extra is("featured_image_url", null) guard so we never clobber a
      // row that got an FI set since we fetched it.
      return sb.from('stories').update(patch).eq('id', id).is('featured_image_url', null);
    }));
    for (const r of results) {
      if (r.error) { failed++; if (failed <= 5) console.error(`  fail: ${r.error.message}`); }
      else written++;
    }
    if ((i + 20) % 200 === 0 || i + 20 >= updates.length) {
      process.stderr.write(`  ${Math.min(i + 20, updates.length)}/${updates.length}\r`);
    }
  }
  console.error(`\nWrote ${written}, failed ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
