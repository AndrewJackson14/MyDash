#!/usr/bin/env node
/**
 * audit-legacy-migration.mjs
 * ──────────────────────────
 * Diffs a legacy WordPress site's article URLs (from its sitemap) against
 * MyDash's `stories` table and emits a CSV so we can see which articles
 * have migrated, which haven't, and which are ambiguous.
 *
 * How it works:
 *   1. Walk the legacy sitemap (including nested sub-sitemaps) and collect
 *      every <loc> URL. WordPress + Yoast/RankMath typically serve a
 *      sitemap_index.xml that lists per-content-type sitemaps (posts,
 *      pages, categories). We only keep URLs that look like articles —
 *      2+ path segments past the host, excluding known category/tag
 *      index paths.
 *   2. Pull every story from MyDash with a slug set. Service role key
 *      required because drafts/unpublished rows are hidden from anon.
 *   3. Match legacy URL → MyDash story by slug (last path segment).
 *      Multiple legacy URLs can collide on the same slug; we flag that.
 *   4. Emit CSV with legacy_url, slug, migrated?, match_type, story_id,
 *      story_status, story_publication, mydash_path.
 *
 * Usage:
 *   # laptop terminal, with .env in project root containing:
 *   #   SUPABASE_URL=...
 *   #   SUPABASE_SERVICE_ROLE_KEY=...
 *   node --env-file=.env scripts/audit-legacy-migration.mjs > legacy_audit.csv
 *
 *   # different site:
 *   LEGACY_SITE=https://atascaderonews.com node --env-file=.env \
 *     scripts/audit-legacy-migration.mjs > atn_audit.csv
 *
 * Env:
 *   SUPABASE_URL                — required
 *   SUPABASE_SERVICE_ROLE_KEY   — required
 *   LEGACY_SITE                 — default https://pasoroblespress.com
 *   SITEMAP_PATH                — default /sitemap.xml
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_SITE = (process.env.LEGACY_SITE || 'https://pasoroblespress.com').replace(/\/$/, '');
const SITEMAP_PATH = process.env.SITEMAP_PATH || '/sitemap.xml';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Segment denylist — URL paths whose last segment matches any of these
// are indices, not articles. Tune if you hit false negatives.
const NON_ARTICLE_SEGMENTS = new Set([
  '', 'page', 'category', 'tag', 'author', 'feed', 'search',
  'contact', 'about', 'advertise', 'subscribe', 'privacy', 'terms',
]);

// ─── Sitemap crawl ─────────────────────────────────────────────
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'mydash-legacy-audit/1.0' } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

// Pull every <loc>...</loc> from a sitemap body. Works for both the
// index and leaf sitemap formats since they share the <loc> element.
function extractLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

async function walkSitemap(sitemapUrl, seen = new Set(), depth = 0) {
  if (seen.has(sitemapUrl) || depth > 4) return [];
  seen.add(sitemapUrl);
  let xml;
  try { xml = await fetchText(sitemapUrl); }
  catch (e) { console.error(`  skip ${sitemapUrl}: ${e.message}`); return []; }

  const locs = extractLocs(xml);
  const isIndex = /<sitemapindex/i.test(xml);
  if (isIndex) {
    const out = [];
    for (const sub of locs) {
      const nested = await walkSitemap(sub, seen, depth + 1);
      out.push(...nested);
    }
    return out;
  }
  return locs;
}

// ─── URL → slug ────────────────────────────────────────────────
function parseLegacy(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return null; }
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;                 // site root or top index
  const last = segs[segs.length - 1];
  if (NON_ARTICLE_SEGMENTS.has(last.toLowerCase())) return null;
  // WordPress permalink tail is typically a dated or kebab slug. Skip
  // numeric-only (usually pagination like /page/2/).
  if (/^\d+$/.test(last)) return null;
  return {
    url: urlStr,
    slug: last,
    hintPub: segs[0] || null,              // first segment — often a pub folder
    hintCategory: segs.length >= 3 ? segs.slice(1, -1).join('/') : null,
  };
}

// ─── MyDash stories ────────────────────────────────────────────
async function loadAllStories() {
  const out = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb
      .from('stories')
      .select('id,slug,title,status,publication_id,category_slug,sent_to_web,published_at')
      .not('slug', 'is', null)
      .range(from, from + pageSize - 1)
      .order('slug');
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// ─── CSV ───────────────────────────────────────────────────────
function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.error(`Walking sitemap at ${LEGACY_SITE}${SITEMAP_PATH} …`);
  const allLocs = await walkSitemap(LEGACY_SITE + SITEMAP_PATH);
  console.error(`  found ${allLocs.length} URLs`);

  const legacyArticles = allLocs.map(parseLegacy).filter(Boolean);
  console.error(`  ${legacyArticles.length} look like articles`);

  console.error('Loading MyDash stories…');
  const stories = await loadAllStories();
  console.error(`  ${stories.length} stories with slugs`);

  // Bucket MyDash stories by slug (may collide across pubs).
  const bySlug = new Map();
  for (const s of stories) {
    const arr = bySlug.get(s.slug) || [];
    arr.push(s);
    bySlug.set(s.slug, arr);
  }

  // Emit CSV
  const headers = [
    'legacy_url', 'legacy_slug', 'legacy_pub_hint', 'legacy_category_hint',
    'migrated', 'match_type', 'story_id', 'story_title', 'story_status',
    'story_publication_id', 'story_sent_to_web',
  ];
  process.stdout.write(headers.join(',') + '\n');

  let hit = 0, miss = 0, ambig = 0;
  for (const a of legacyArticles) {
    const matches = bySlug.get(a.slug) || [];
    let matched = null;
    let matchType;
    if (matches.length === 0) {
      matchType = 'missing';
      miss++;
    } else if (matches.length === 1) {
      matched = matches[0];
      matchType = 'single-slug';
      hit++;
    } else {
      // Prefer a match where the legacy pub hint matches the story pub.
      matched = matches.find(m => m.publication_id && a.hintPub && m.publication_id.includes(a.hintPub)) || matches[0];
      matchType = 'ambiguous-slug';
      ambig++;
    }
    process.stdout.write([
      csvField(a.url),
      csvField(a.slug),
      csvField(a.hintPub),
      csvField(a.hintCategory),
      csvField(matched ? 'yes' : 'no'),
      csvField(matchType),
      csvField(matched?.id),
      csvField(matched?.title),
      csvField(matched?.status),
      csvField(matched?.publication_id),
      csvField(matched?.sent_to_web ? 'yes' : 'no'),
    ].join(',') + '\n');
  }

  console.error(`\nDone: ${hit} migrated · ${miss} missing · ${ambig} ambiguous`);
}

main().catch(e => { console.error(e); process.exit(1); });
