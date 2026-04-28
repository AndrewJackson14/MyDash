// ============================================================
// Knowledge Base — internal SOP / process articles
//
// Lists every story tagged audience='internal' (set in StoryEditor).
// Search filter narrows by title + excerpt. Click an article to read
// the full body (or jump to StoryEditor for edits — handled by parent
// nav once the editor learns the audience flag, mig 080).
//
// Bot integration: MyHelper reads the same rows via Supabase service
// role and uses them for grounded answers — no separate KB table.
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Z, COND, FS, FW, R, Ri } from "../lib/theme";
import { Btn, Inp, SB, Modal } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase } from "../lib/supabase";
import { fmtTimeRelative } from "../lib/formatters";

export default function KnowledgeBase({ isActive, team }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) setHeader({ breadcrumb: [{ label: "Home" }, { label: "Knowledge Base" }], title: "Knowledge Base" });
    else clearHeader();
  }, [isActive, setHeader, clearHeader]);

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Lean column set — list view doesn't need full body. Body fetched
      // on-demand when an article opens.
      const { data } = await supabase
        .from("stories")
        .select("id, title, excerpt, updated_at, author, author_id, category_slug")
        .eq("audience", "internal")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (!cancelled) {
        setArticles(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(a =>
      (a.title || "").toLowerCase().includes(q) ||
      (a.excerpt || "").toLowerCase().includes(q)
    );
  }, [search, articles]);

  const openArticle = async (id) => {
    setOpenId(id);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <SB value={search} onChange={setSearch} placeholder="Search articles..." />
      <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
        {loading ? "Loading…" : `${filtered.length} article${filtered.length !== 1 ? "s" : ""}`}
      </div>
    </div>

    {!loading && filtered.length === 0 && (
      <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND, background: Z.sf, borderRadius: R, border: "1px solid " + Z.bd }}>
        {search ? "No articles match." : "No internal articles yet. Create one in Editorial → Story Editor and set Audience = Internal Knowledge Base."}
      </div>
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {filtered.map(a => {
        const author = a.author_id ? (team || []).find(t => t.id === a.author_id)?.name : a.author;
        return (
          <button key={a.id} onClick={() => openArticle(a.id)} style={{
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 14px",
            background: Z.sf,
            border: "1px solid " + Z.bd,
            borderRadius: Ri,
            cursor: "pointer",
            fontFamily: "inherit",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{a.title || "Untitled"}</span>
              <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap" }}>{fmtTimeRelative(a.updated_at)}</span>
            </div>
            {a.excerpt && (
              <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, lineHeight: 1.4 }}>{a.excerpt}</div>
            )}
            {author && (
              <div style={{ fontSize: 11, color: Z.td, fontFamily: COND }}>by {author}</div>
            )}
          </button>
        );
      })}
    </div>

    {openId && <ArticleViewer id={openId} onClose={() => setOpenId(null)} />}
  </div>;
}

// Lazy body fetch — list view skipped this column to keep the wire small.
function ArticleViewer({ id, onClose }) {
  const [article, setArticle] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stories")
        .select("id, title, body, content_json, excerpt, updated_at, author")
        .eq("id", id)
        .single();
      if (!cancelled) setArticle(data);
    })();
    return () => { cancelled = true; };
  }, [id]);

  return <Modal open={true} onClose={onClose} title={article?.title || "Loading…"} width={780}>
    {!article ? (
      <div style={{ padding: 24, color: Z.tm, fontSize: FS.sm }}>Loading…</div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "70vh", overflowY: "auto" }}>
        {article.excerpt && (
          <div style={{ fontSize: FS.sm, color: Z.tm, fontStyle: "italic", lineHeight: 1.5 }}>{article.excerpt}</div>
        )}
        <div style={{ fontSize: FS.base, color: Z.tx, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {article.body || "(No body — open in Editorial → Story Editor to author content.)"}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn v="cancel" onClick={onClose}>Close</Btn>
        </div>
      </div>
    )}
  </Modal>;
}
