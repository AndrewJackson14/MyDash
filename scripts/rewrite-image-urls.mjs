#!/usr/bin/env node
/**
 * rewrite-image-urls.mjs
 * ──────────────────────
 * Third and final pass of the image migration. Now that the canonical
 * WP originals live at cdn.13stars.media/<pub-prefix>/<YYYY>/<MM>/<file>,
 * rewrite stories.featured_image_url and stories.body to point at them.
 *
 * Pass 1 (featured_image_url):
 *   For each story with legacy_url set, look up the WP attachment
 *   manifest entry whose featured_for_slug matches the story's slug and
 *   rewrite to the new CDN URL. Overwrites the known-stale
 *   cdn.13stars.media/<pub>/<weird-hashed-filename>.jpg rows that all
 *   404'd before the nuke.
 *
 * Pass 2 (body):
 *   - strip -NNNxMMM size suffixes from any <img src> pointing at
 *     wp-content/uploads/ (responsive rendering is a CSS/srcset
 *     concern, not a DB-duplication concern)
 *   - rewrite <host>/wp-content/uploads/<path> → CDN_BASE/<prefix>/<path>
 *     so body images don't rely on the nginx /wp-content/uploads/
 *     fallback (which still stays in place as belt-and-suspenders).
 *
 * Safe to re-run: idempotent when a row is already at the target URL.
 *
 * Usage:
 *   node --env-file=.env scripts/rewrite-image-urls.mjs \
 *     --manifest=pasoroblespress.com:/tmp/prp_attachments.ndjson \
 *     --manifest=atascaderonews.com:/tmp/atn_attachments.ndjson \
 *     [--apply]
 *
 * Without --apply, runs as a dry report (counts + sample diffs).
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const CDN_BASE = 'https://cdn.13stars.media';

// legacy host → CDN top-level prefix (matches what the bulk uploader used)
const HOST_PREFIX = {
  'pasoroblespress.com': 'paso-robles-press',
  'atascaderonews.com':  'atascadero-news',
};

// ─── Args ──────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v = true] = a.slice(2).split('=');
    return [k, v];
  })
);
const APPLY = !!args.apply;
const manifestSpecs = process.argv
  .filter(a => a.startsWith('--manifest='))
  .map(a => a.slice('--manifest='.length));
if (manifestSpecs.length === 0) {
  console.error('At least one --manifest=<host>:<path> required');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── Load manifests into slug → relative_path maps, keyed by host ──
const slugToRel = {};  // host → Map(slug → relative_path)
for (const spec of manifestSpecs) {
  const [host, path] = spec.split(':', 2);
  if (!HOST_PREFIX[host]) {
    console.error(`Unknown host "${host}" — add to HOST_PREFIX map`);
    process.exit(1);
  }
  const map = new Map();
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
  for (const line of lines) {
    const r = JSON.parse(line);
    if (r.featured_for_slug && r.relative_path && !map.has(r.featured_for_slug)) {
      map.set(r.featured_for_slug, r.relative_path);
    }
  }
  slugToRel[host] = map;
  console.error(`Loaded ${map.size} featured-image entries for ${host}`);
}

// ─── Pass 1 target URL for a story ─────────────────────
function newFeaturedUrl(legacyUrl, slug) {
  if (!legacyUrl) return null;
  let host;
  try { host = new URL(legacyUrl).hostname; } catch { return null; }
  const prefix = HOST_PREFIX[host];
  if (!prefix) return null;
  const rel = slugToRel[host]?.get(slug);
  if (!rel) return null;
  return `${CDN_BASE}/${prefix}/${rel}`;
}

// ─── Pass 2 body rewrite ───────────────────────────────
// Strip -NNNxMMM suffixes ON wp-content/uploads img srcs. Keep the
// suffix alone on other URLs (not our files, don't touch them).
const SIZE_RE = /(\/wp-content\/uploads\/[^"'\s>]+?)-\d+x\d+(\.(?:jpe?g|png|gif|webp|svg|avif|heic))/gi;
// Rewrite host-prefixed wp-content paths to CDN.
const HOST_UPLOAD_RE_ALL = Object.keys(HOST_PREFIX).map(host => ({
  host,
  prefix: HOST_PREFIX[host],
  re: new RegExp(`https?:\\/\\/(?:www\\.)?${host.replace(/\./g, '\\.')}\\/wp-content\\/uploads\\/`, 'gi'),
}));
// Protocol-relative + root-relative: same host as the story (derived
// from legacy_url's host).
function rewriteBody(body, legacyHost) {
  if (!body) return body;
  let out = body;

  // (a) strip -NNNxMMM from wp-content/uploads img srcs
  out = out.replace(SIZE_RE, '$1$2');

  // (b) for each known host, rewrite absolute host-prefixed /wp-content/uploads
  for (const { re, prefix } of HOST_UPLOAD_RE_ALL) {
    out = out.replace(re, `${CDN_BASE}/${prefix}/`);
  }

  // (c) root-relative /wp-content/uploads/ → CDN for this story's host
  if (legacyHost && HOST_PREFIX[legacyHost]) {
    const rootRel = /(["'(])\/wp-content\/uploads\//g;
    out = out.replace(rootRel, `$1${CDN_BASE}/${HOST_PREFIX[legacyHost]}/`);
  }

  return out;
}

function hostOfLegacy(legacyUrl) {
  if (!legacyUrl) return null;
  try { return new URL(legacyUrl).hostname; } catch { return null; }
}

// ─── Load all relevant stories ─────────────────────────
async function loadStories() {
  const out = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('stories')
      .select('id,slug,publication_id,legacy_url,featured_image_url,body')
      .not('legacy_url', 'is', null)
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

// ─── Main ──────────────────────────────────────────────
async function main() {
  console.error('Loading stories with legacy_url set…');
  const stories = await loadStories();
  console.error(`  ${stories.length} stories loaded`);

  const fiUpdates = [];       // featured_image_url
  const bodyUpdates = [];     // body
  const stats = {
    fi_match: 0, fi_unchanged: 0, fi_no_manifest: 0,
    body_changed: 0, body_unchanged: 0, body_empty: 0,
  };

  for (const s of stories) {
    // Pass 1
    const targetFi = newFeaturedUrl(s.legacy_url, s.slug);
    if (targetFi) {
      if (s.featured_image_url !== targetFi) {
        fiUpdates.push({ id: s.id, featured_image_url: targetFi });
        stats.fi_match++;
      } else {
        stats.fi_unchanged++;
      }
    } else {
      stats.fi_no_manifest++;
    }

    // Pass 2
    if (!s.body) { stats.body_empty++; continue; }
    const newBody = rewriteBody(s.body, hostOfLegacy(s.legacy_url));
    if (newBody !== s.body) {
      bodyUpdates.push({ id: s.id, body: newBody });
      stats.body_changed++;
    } else {
      stats.body_unchanged++;
    }
  }

  console.error('\nPass 1 (featured_image_url):');
  console.error(`  would update:       ${stats.fi_match}`);
  console.error(`  already at target:  ${stats.fi_unchanged}`);
  console.error(`  no manifest match:  ${stats.fi_no_manifest}`);

  console.error('\nPass 2 (body):');
  console.error(`  would update:       ${stats.body_changed}`);
  console.error(`  unchanged:          ${stats.body_unchanged}`);
  console.error(`  empty body:         ${stats.body_empty}`);

  if (fiUpdates[0]) {
    const s = stories.find(x => x.id === fiUpdates[0].id);
    console.error('\nSample fi change:');
    console.error(`  slug: ${s.slug}`);
    console.error(`  from: ${s.featured_image_url || '(null)'}`);
    console.error(`  to:   ${fiUpdates[0].featured_image_url}`);
  }
  if (bodyUpdates[0]) {
    const s = stories.find(x => x.id === bodyUpdates[0].id);
    // Show one diffing substring from before/after.
    const oldStr = s.body;
    const newStr = bodyUpdates[0].body;
    const diffIdx = [...oldStr].findIndex((c, i) => c !== newStr[i]);
    console.error('\nSample body change (around first diff):');
    console.error(`  slug: ${s.slug}`);
    console.error(`  old: …${oldStr.slice(Math.max(0, diffIdx - 40), diffIdx + 100)}…`);
    console.error(`  new: …${newStr.slice(Math.max(0, diffIdx - 40), diffIdx + 100)}…`);
  }

  if (!APPLY) {
    console.error('\n(dry run — pass --apply to write)');
    return;
  }

  // ─── Apply ───────────────────────────────────────────
  async function applyBatch(updates, label) {
    let written = 0, failed = 0;
    for (let i = 0; i < updates.length; i += 20) {
      const chunk = updates.slice(i, i + 20);
      const results = await Promise.all(chunk.map(u => {
        const { id, ...patch } = u;
        return sb.from('stories').update(patch).eq('id', id);
      }));
      for (const r of results) {
        if (r.error) { failed++; if (failed <= 5) console.error(`  ${label} fail: ${r.error.message}`); }
        else written++;
      }
      if ((i + 20) % 500 === 0 || i + 20 >= updates.length) {
        process.stderr.write(`  ${label}: ${Math.min(i + 20, updates.length)}/${updates.length}\r`);
      }
    }
    console.error(`\n  ${label}: wrote ${written}, failed ${failed}`);
  }

  if (fiUpdates.length) await applyBatch(fiUpdates, 'featured_image_url');
  if (bodyUpdates.length) await applyBatch(bodyUpdates, 'body');
  console.error('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
