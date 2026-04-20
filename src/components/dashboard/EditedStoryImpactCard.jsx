// ============================================================
// EditedStoryImpactCard — closes the feedback loop between editing
// and audience reach. Shows the content editor how many stories they
// moved through the pipeline in the last 30 days, how many made it to
// the web, and (when page view data is available) which one is doing
// best on the site.
//
// Page view attribution is non-trivial because daily_page_views joins
// to StellarPress articles by article_id, and MyDash stories don't
// carry that key. We fall back to a slug-in-path match so the card
// works best-effort without requiring a schema migration. If no
// matches are found the tile stays useful — it still reports edit
// count and web-published count without inventing traffic numbers.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;

export default function EditedStoryImpactCard({
  stories, currentUserId,
  userId, onOpenStory,
}) {
  const myStoriesLast30 = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS;
    // We can't perfectly attribute "edited by" because status_activity
    // isn't loaded here — use updated_at on stories the editor has seen
    // in a post-draft state. Conservative; undercounts rather than over.
    return (stories || []).filter(s => {
      if (!["Edited", "Approved", "Ready", "Published", "Web Published"].includes(s.status)) return false;
      const updatedBy = s.updated_by || s.updatedBy;
      if (currentUserId && updatedBy && updatedBy !== currentUserId) return false;
      const ts = new Date(s.updatedAt || s.updated_at || 0).getTime();
      return ts >= cutoff;
    });
  }, [stories, currentUserId]);

  const publishedOfMine = useMemo(() => {
    return myStoriesLast30.filter(s => s.sent_to_web || s.sentToWeb);
  }, [myStoriesLast30]);

  // Try to fetch page views for the published stories. We attempt two
  // strategies per story:
  //   1) if the story has a stellarpress_article_id column, match by that
  //   2) otherwise match by `path ILIKE '%/slug'`
  // We cap the fanout at 20 stories and run the queries in parallel.
  const [viewsByStoryId, setViewsByStoryId] = useState({});
  const [viewsLoading, setViewsLoading] = useState(false);

  useEffect(() => {
    const ids = publishedOfMine.slice(0, 20);
    if (ids.length === 0) { setViewsByStoryId({}); return; }
    let cancelled = false;
    setViewsLoading(true);

    const sinceISO = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);

    (async () => {
      const entries = await Promise.all(ids.map(async s => {
        const slug = s.slug;
        const articleId = s.stellarpress_article_id || s.article_id;
        try {
          let q = supabase.from("daily_page_views").select("view_count").gte("view_date", sinceISO);
          if (articleId) q = q.eq("article_id", articleId);
          else if (slug) q = q.ilike("path", `%/${slug}%`);
          else return [s.id, 0];
          const { data } = await q;
          const total = (data || []).reduce((sum, r) => sum + (r.view_count || 0), 0);
          return [s.id, total];
        } catch (e) {
          return [s.id, 0];
        }
      }));
      if (!cancelled) {
        setViewsByStoryId(Object.fromEntries(entries));
        setViewsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [publishedOfMine]);

  const totalViews = useMemo(
    () => Object.values(viewsByStoryId).reduce((s, v) => s + v, 0),
    [viewsByStoryId]
  );

  const topStory = useMemo(() => {
    let best = null;
    publishedOfMine.forEach(s => {
      const v = viewsByStoryId[s.id] || 0;
      if (!best || v > best.views) best = { story: s, views: v };
    });
    return best && best.views > 0 ? best : null;
  }, [publishedOfMine, viewsByStoryId]);

  const hasAnyViews = totalViews > 0;
  const edited = myStoriesLast30.length;
  const published = publishedOfMine.length;
  const pubRate = edited > 0 ? Math.round((published / edited) * 100) : 0;

  return (
    <DashboardModule
      id="edited-story-impact"
      userId={userId}
      title="Your impact (30d)"
      subtitle={`${edited} edited · ${published} published · ${pubRate}% reach`}
    >
      {/* Counts */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        marginBottom: 12,
      }}>
        <Stat label="Edited" value={edited} />
        <Stat label="Published" value={published} color={Z.go} />
        <Stat
          label="Views"
          value={viewsLoading ? "…" : hasAnyViews ? totalViews.toLocaleString() : "—"}
          color={hasAnyViews ? Z.go : Z.tm}
        />
      </div>

      {/* Top story */}
      {topStory && (
        <div
          onClick={() => onOpenStory?.(topStory.story.id)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: Z.go + "12",
            border: `1px solid ${Z.go}33`,
            cursor: onOpenStory ? "pointer" : "default",
          }}
        >
          <div style={{
            fontSize: FS.micro, fontWeight: FW.heavy, color: Z.go,
            fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5,
            marginBottom: 2,
          }}>Top-performing edit</div>
          <div style={{
            fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{topStory.story.title || "Untitled"}</div>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
            {topStory.views.toLocaleString()} views
          </div>
        </div>
      )}

      {!hasAnyViews && published > 0 && !viewsLoading && (
        <div style={{
          padding: "10px 12px",
          fontSize: FS.xs, color: Z.tm, fontFamily: COND,
          fontStyle: "italic",
        }}>
          Page view data didn't match any published stories. Link MyDash stories to StellarPress articles (or verify slugs) to unlock per-story traffic.
        </div>
      )}
    </DashboardModule>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      textAlign: "center", padding: "10px 6px",
      background: Z.sa, borderRadius: 8,
    }}>
      <div style={{
        fontSize: FS.lg, fontWeight: FW.black, color: color || Z.tx,
        lineHeight: 1.1,
      }}>{value}</div>
      <div style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm,
        fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6,
        marginTop: 4,
      }}>{label}</div>
    </div>
  );
}
