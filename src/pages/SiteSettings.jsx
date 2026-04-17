import { useState, useEffect, useCallback, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, LABEL, INPUT, INV, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA } from "../components/ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { uploadMedia } from "../lib/media";

// ── Upload via Edge Function ─────────────────────────────────────
async function uploadImage(file, path) {
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const filename = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch(EDGE_FN_URL + "/upload-image", {
    method: "POST",
    headers: { "Authorization": "Bearer " + session.access_token, "x-upload-path": path || "uploads", "x-file-name": filename, "x-content-type": file.type || "image/jpeg" },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed: " + res.status); }
  return (await res.json()).url;
}

// ── Publication ID → CDN folder slug ────────────────────────────
const PUB_CDN_FOLDER = {
  "pub-paso-robles-press": "paso-robles-press",
  "pub-atascadero-news": "atascadero-news",
  "pub-paso-robles-magazine": "paso-robles-magazine",
  "pub-atascadero-news-maga": "atascadero-news-magazine",
  "pub-morro-bay-life": "morro-bay-life",
  "pub-santa-ynez-valley-st": "santa-ynez-valley-star",
  "pub-the-malibu-times": "malibu-times",
};

// ── Default Ad Locations (used when creating zones for a new site) ──
const DEFAULT_AD_LOCATIONS = [
  { slug: "hero-ads", name: "Hero Ads", width: 120, height: 80 },
  { slug: "leaderboard", name: "Leaderboard", width: 1200, height: 200 },
  { slug: "section-ads", name: "Section Ads", width: 300, height: 250 },
  { slug: "sidebar", name: "Sidebar", width: 300, height: 250 },
  { slug: "in-article", name: "In-Article", width: 300, height: 250 },
];

// ── Helpers ──────────────────────────────────────────────────────
const toSlug = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/^-|-$/g, "");

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: FS.xs, fontWeight: LABEL.fontWeight, textTransform: LABEL.textTransform, letterSpacing: LABEL.letterSpacing, color: Z.tm, fontFamily: COND, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid " + Z.bd }}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: LABEL.fontSize, fontWeight: LABEL.fontWeight, textTransform: LABEL.textTransform, letterSpacing: LABEL.letterSpacing, color: Z.tm, fontFamily: COND, marginBottom: 3 }}>{label}</div>
    {children}
  </div>
);

const getInputStyle = () => ({ width: "100%", padding: INPUT.padSm, borderRadius: INPUT.radius, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND });
const getColorStyle = () => ({ ...getInputStyle(), width: 60, height: 32, padding: 2, cursor: "pointer" });

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontFamily: COND, color: Z.tx }}>
    <div onClick={() => onChange(!checked)} style={{ width: 36, height: 20, borderRadius: 10, background: checked ? (Z.su || "#22c55e") : Z.bd, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: INV.light, position: "absolute", top: 2, left: checked ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
    <span style={{ fontWeight: 600 }}>{label}</span>
  </label>
);

// ── Orderable List (add/remove/reorder) ─────────────────────────
const OrderableList = ({ items, onChange, placeholder, showSlug }) => {
  const [newItem, setNewItem] = useState("");
  const add = () => { const v = newItem.trim(); if (v && !items.includes(v)) { onChange([...items, v]); setNewItem(""); } };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const move = (from, dir) => {
    const to = from + dir;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    [arr[from], arr[to]] = [arr[to], arr[from]];
    onChange(arr);
  };
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: Z.sa, borderRadius: 3, border: "1px solid " + Z.bd }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? Z.bd : Z.tm, fontSize: 8, lineHeight: 1, padding: 0 }}>{"\u25b2"}</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} style={{ background: "none", border: "none", cursor: i === items.length - 1 ? "default" : "pointer", color: i === items.length - 1 ? Z.bd : Z.tm, fontSize: 8, lineHeight: 1, padding: 0 }}>{"\u25bc"}</button>
            </div>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND }}>{item}</span>
            {showSlug && <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{toSlug(item)}</span>}
            <button onClick={() => remove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>{"\u00d7"}</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder || "Add item..."} style={{ ...getInputStyle(), flex: 1 }} />
        <Btn sm onClick={add} disabled={!newItem.trim()}>Add</Btn>
      </div>
    </div>
  );
};

// ── Image Upload Field ──────────────────────────────────────────
const ImageField = ({ value, onChange, uploadPath, publicationId, category, label }) => {
  const dialog = useDialog();
  const [uploading, setUploading] = useState(false);
  const handleUpload = async () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setUploading(true);
      try {
        const row = await uploadMedia(f, {
          category: category || "pub_asset",
          publicationId: publicationId || null,
          caption: label || null,
        });
        onChange(row.cdn_url);
      }
      catch (err) { await dialog.alert("Upload failed: " + err.message); }
      setUploading(false);
    };
    inp.click();
  };
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {value && <img src={value} alt="" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa }} />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder="https://..." style={getInputStyle()} />
          <button onClick={handleUpload} disabled={uploading} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </Field>
  );
};

// ── Site Analytics Summary ──────────────────────────────────────
const SiteAnalytics = ({ siteId }) => {
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState("7d");

  useEffect(() => {
    if (!siteId) return;
    loadStats();
  }, [siteId, range]);

  async function loadStats() {
    try {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const prevSince = new Date(Date.now() - days * 2 * 86400000).toISOString();
    const prevUntil = since;

    const results = await Promise.all([
      supabase.from("page_views").select("path, session_id, referrer, screen_width, created_at").eq("site_id", siteId).gte("created_at", since).order("created_at", { ascending: false }).limit(50000),
      supabase.from("page_views").select("session_id, created_at").eq("site_id", siteId).gte("created_at", prevSince).lt("created_at", prevUntil).limit(50000),
    ]);

    const rows = results[0]?.data || [];
    const prevRows = results[1]?.data || [];

    if (!rows.length) { setStats(null); return; }

    const views = rows.length;
    const sessions = new Set(rows.map(r => r.session_id).filter(Boolean)).size;
    const prevViews = prevRows?.length || 0;
    const prevSessions = new Set(prevRows.map(r => r.session_id).filter(Boolean)).size;

    // Daily chart
    const now = new Date();
    const dailyMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      dailyMap[d] = 0;
    }
    rows.forEach(r => { const d = r.created_at?.slice(0, 10); if (d && dailyMap[d] !== undefined) dailyMap[d]++; });
    const daily = Object.entries(dailyMap).sort().map(([date, count]) => ({ date, count }));

    // Top 5 pages
    const pc = {};
    rows.forEach(r => { pc[r.path] = (pc[r.path] || 0) + 1; });
    const topPages = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count }));

    // Top 5 referrers
    const rc = {};
    rows.forEach(r => { if (!r.referrer) return; try { const h = new URL(r.referrer).hostname; if (h) rc[h] = (rc[h] || 0) + 1; } catch {} });
    const topRefs = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([host, count]) => ({ host, count }));

    // Device
    let mobile = 0, desktop = 0;
    rows.forEach(r => { if ((r.screen_width || 0) < 768) mobile++; else desktop++; });

    const pctChange = (cur, prev) => prev > 0 ? Math.round((cur - prev) / prev * 100) : cur > 0 ? 100 : 0;

    setStats({
      views, sessions, prevViews, prevSessions,
      viewsChange: pctChange(views, prevViews),
      sessionsChange: pctChange(sessions, prevSessions),
      daily, topPages, topRefs,
      mobilePercent: Math.round(mobile / (rows.length || 1) * 100),
      desktopPercent: Math.round(desktop / (rows.length || 1) * 100),
    });
    } catch (e) { console.error("Analytics load error:", e); setStats(null); }
  }

  if (!stats) return null;

  const maxDaily = Math.max(...stats.daily.map(d => d.count), 1);
  const maxPage = stats.topPages[0]?.count || 1;
  const maxRef = stats.topRefs[0]?.count || 1;
  const changeColor = (v) => v > 0 ? (Z.su || "#22c55e") : v < 0 ? (Z.da || "#ef4444") : Z.tm;
  const changeLabel = (v) => (v > 0 ? "+" : "") + v + "%";

  return (
    <div style={{ marginBottom: 20, padding: 16, border: "1px solid " + Z.bd, borderRadius: 6, background: Z.sa }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Web Analytics</div>
        <div style={{ display: "flex", gap: 4 }}>
          {["7d", "30d", "90d"].map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: range === r ? 700 : 500,
              border: "1px solid " + (range === r ? Z.ac : Z.bd), background: range === r ? Z.ac + "18" : "transparent",
              color: range === r ? Z.ac : Z.tm, cursor: "pointer", fontFamily: COND,
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { label: "Views", value: stats.views.toLocaleString(), change: stats.viewsChange },
          { label: "Sessions", value: stats.sessions.toLocaleString(), change: stats.sessionsChange },
          { label: "Mobile", value: stats.mobilePercent + "%" },
          { label: "Desktop", value: stats.desktopPercent + "%" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: Z.tx, fontFamily: COND }}>{s.value}</div>
            <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>
              {s.label}
              {s.change !== undefined && <span style={{ marginLeft: 4, color: changeColor(s.change), fontWeight: 700 }}>{changeLabel(s.change)}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Mini chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 48, marginBottom: 12 }}>
        {stats.daily.map(d => {
          const h = maxDaily > 0 ? Math.max(4, (d.count / maxDaily) * 100) : 4;
          return <div key={d.date} title={`${d.date}: ${d.count} views`} style={{ flex: 1, height: h + "%", background: Z.ac, borderRadius: 1, minHeight: 2, transition: "height 0.3s", cursor: "default" }} />;
        })}
      </div>

      {/* Top pages + referrers side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Top Pages</div>
          {stats.topPages.length > 0 ? stats.topPages.map(p => (
            <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
              <span style={{ fontSize: 10, fontFamily: COND, color: Z.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</span>
              <div style={{ width: 60, height: 5, background: Z.bg, borderRadius: 2, flexShrink: 0 }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${(p.count / maxPage) * 100}%`, background: Z.ac }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: Z.ac, fontFamily: COND, width: 30, textAlign: "right", flexShrink: 0 }}>{p.count}</span>
            </div>
          )) : <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>No data</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Top Referrers</div>
          {stats.topRefs.length > 0 ? stats.topRefs.map(r => (
            <div key={r.host} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
              <span style={{ fontSize: 10, fontFamily: COND, color: Z.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.host}</span>
              <div style={{ width: 60, height: 5, background: Z.bg, borderRadius: 2, flexShrink: 0 }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${(r.count / maxRef) * 100}%`, background: Z.ac }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: Z.ac, fontFamily: COND, width: 30, textAlign: "right", flexShrink: 0 }}>{r.count}</span>
            </div>
          )) : <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>No data</div>}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ORG APPEARANCE PANEL
// Publisher-wide controls for ambient pressure + background image.
// ══════════════════════════════════════════════════════════════════
function OrgAppearancePanel() {
  const DEFAULT_STATUS_COLORS = {
    Pitched:  { bg: "rgba(144,102,232,0.12)", fg: "#7c3aed" },
    Draft:    { bg: "rgba(138,149,168,0.12)", fg: "#8a95a8" },
    Edit:     { bg: "rgba(59,130,246,0.12)",  fg: "#3B82F6" },
    Ready:    { bg: "rgba(34,197,94,0.12)",   fg: "#16a34a" },
    Archived: { bg: "rgba(138,149,168,0.08)", fg: "#9ca3af" },
  };
  const [s, setS] = useState({
    global_pressure_enabled: true,
    serenity_color: "blue",
    background_image_url: "",
    background_image_opacity: 0.30,
    status_colors: DEFAULT_STATUS_COLORS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from("org_settings").select("*").limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) setS({
          global_pressure_enabled: data.global_pressure_enabled ?? true,
          serenity_color: data.serenity_color || "blue",
          background_image_url: data.background_image_url || "",
          background_image_opacity: Number(data.background_image_opacity ?? 0.30),
          status_colors: { ...DEFAULT_STATUS_COLORS, ...(data.status_colors || {}) },
          status_colors_enabled: data.status_colors_enabled !== false,
        });
        setLoading(false);
      });
  }, []);

  const save = async (nextState) => {
    const payload = nextState || s;
    setSaving(true);
    const { error } = await supabase.from("org_settings").update({
      global_pressure_enabled: payload.global_pressure_enabled,
      serenity_color: payload.serenity_color,
      background_image_url: payload.background_image_url || null,
      background_image_opacity: payload.background_image_opacity,
      status_colors: payload.status_colors || {},
      status_colors_enabled: payload.status_colors_enabled !== false,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    setSaving(false);
    if (error) { console.error("org_settings save:", error); return; }
    setSavedAt(Date.now());
    // Let the App.jsx loader know to refresh
    window.dispatchEvent(new Event("org-settings-updated"));
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "app-backgrounds");
      const next = { ...s, background_image_url: url };
      setS(next);
      await save(next);
    } catch (err) {
      console.error("upload error:", err);
      alert("Upload failed: " + err.message);
    }
    setUploading(false);
  };

  if (loading) return null;

  return (
    <div style={{ background: Z.sf, borderRadius: R, border: "1px solid " + Z.bd, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Org Appearance</div>
          <div style={{ fontSize: 11, color: Z.tm }}>Publisher-wide background and ambient pressure settings.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedAt && Date.now() - savedAt < 2500 && <span style={{ fontSize: 11, color: Z.go, fontWeight: FW.bold }}>✓ Saved</span>}
          <Btn sm onClick={() => save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Global Pressure toggle */}
        <div style={{ padding: 12, background: Z.bg, borderRadius: 6, border: "1px solid " + Z.bd }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: Z.tx }}>Global Pressure</div>
              <div style={{ fontSize: 11, color: Z.tm, marginTop: 2 }}>Ambient background tint that reacts to newsroom heat.</div>
            </div>
            <Toggle checked={s.global_pressure_enabled} onChange={(v) => setS(p => ({ ...p, global_pressure_enabled: v }))} label="" />
          </div>
        </div>

        {/* Serenity color */}
        <div style={{ padding: 12, background: Z.bg, borderRadius: 6, border: "1px solid " + Z.bd }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: Z.tx, marginBottom: 8 }}>Serenity Color</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ k: "blue", label: "Blue", color: "#3B82F6" }, { k: "green", label: "Green", color: "#22C55E" }].map(opt => (
              <button key={opt.k} onClick={() => setS(p => ({ ...p, serenity_color: opt.k }))} style={{
                flex: 1, padding: "8px 10px", borderRadius: 4,
                border: `2px solid ${s.serenity_color === opt.k ? opt.color : Z.bd}`,
                background: s.serenity_color === opt.k ? opt.color + "15" : "transparent",
                color: s.serenity_color === opt.k ? opt.color : Z.tm,
                cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: COND,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: opt.color }} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Background image URL + upload */}
        <div style={{ padding: 12, background: Z.bg, borderRadius: 6, border: "1px solid " + Z.bd, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: Z.tx, marginBottom: 8 }}>Background Image</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Paste an image URL, or upload →"
              value={s.background_image_url || ""}
              onChange={e => setS(p => ({ ...p, background_image_url: e.target.value }))}
              style={getInputStyle()}
            />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
            <Btn sm v="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</Btn>
            {s.background_image_url && <Btn sm v="ghost" onClick={() => setS(p => ({ ...p, background_image_url: "" }))}>Clear</Btn>}
          </div>
          {s.background_image_url && (
            <div style={{ marginTop: 10, borderRadius: 4, overflow: "hidden", border: "1px solid " + Z.bd, position: "relative", aspectRatio: "16/6", background: Z.bg }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${s.background_image_url}')`, backgroundSize: "cover", backgroundPosition: "center", opacity: s.background_image_opacity }} />
              <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>Preview @ {Math.round(s.background_image_opacity * 100)}%</div>
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: Z.tm, width: 60 }}>Opacity</span>
            <input
              type="range" min="0" max="1" step="0.01"
              value={s.background_image_opacity}
              onChange={e => setS(p => ({ ...p, background_image_opacity: Number(e.target.value) }))}
              style={{ flex: 1, accentColor: Z.ac }}
            />
            <span style={{ fontSize: 11, color: Z.tx, fontWeight: 700, width: 40, textAlign: "right" }}>{Math.round(s.background_image_opacity * 100)}%</span>
          </div>
        </div>

        {/* Story Status Colors */}
        <div style={{ padding: 12, background: Z.bg, borderRadius: 6, border: "1px solid " + Z.bd, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: Z.tx }}>Story Status Colors</div>
              <div style={{ fontSize: 11, color: Z.tm, marginTop: 2 }}>Colors used for status indicators in the Issue Planner and Story Editor.</div>
            </div>
            <Toggle checked={s.status_colors_enabled !== false} onChange={(v) => setS(p => ({ ...p, status_colors_enabled: v }))} label="" />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(s.status_colors || {}).map(([status, colors]) => (
              <div key={status} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 6,
                background: colors.bg, border: `1px solid ${colors.fg}30`,
                minWidth: 140,
              }}>
                <div style={{ position: "relative", width: 24, height: 24, borderRadius: 4, background: colors.fg, border: `1px solid ${Z.bd}`, cursor: "pointer", flexShrink: 0 }}>
                  <input
                    type="color"
                    value={colors.fg}
                    onChange={e => {
                      const fg = e.target.value;
                      const bg = fg + "1f";
                      setS(p => ({ ...p, status_colors: { ...p.status_colors, [status]: { fg, bg } } }));
                    }}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.fg, fontFamily: COND }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SITE SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════
export default function SiteSettings({ pubs, setPubs }) {
  const dialog = useDialog();
  const [sites, setSites] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [houseAds, setHouseAds] = useState({}); // { [zone_slug]: [{ id?, zone_id?, creative_url, click_url, alt_text }] }
  const [adLocations, setAdLocations] = useState(DEFAULT_AD_LOCATIONS); // per-site zones
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState(null); // { zone, idx } — which ad slot is picking
  const [adUploading, setAdUploading] = useState(null); // "zone:idx" while uploading
  const [MediaModal, setMediaModal] = useState(null); // dynamically loaded
  const openMediaPicker = (zone, idx) => {
    setMediaTarget({ zone, idx });
    if (MediaModal) { setMediaOpen(true); return; }
    import("../components/MediaModal").then(mod => { setMediaModal(() => mod.default); setMediaOpen(true); });
  };

  // Load sites
  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    supabase.from("sites").select("*").eq("is_active", true).order("name")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSites(data);
          setSelectedId(data[0].id);
          setDraft(buildDraft(data[0]));
          loadHouseAds(data[0].id);
        }
        setLoading(false);
      });
  }, []);

  const buildDraft = (site) => ({
    logo_url: site.logo_url || site.settings?.logo_url || "",
    favicon_url: site.favicon_url || "",
    primary_color: site.settings?.primary_color || "#1a202c",
    secondary_color: site.settings?.secondary_color || "#2b6cb0",
    tagline: site.settings?.tagline || "",
    nav_categories: site.settings?.nav_categories || [],
    homepage_main: site.settings?.homepage_main || [],
    homepage_bottom: site.settings?.homepage_bottom || [],
    best_of_slug: site.settings?.best_of_slug || "",
    best_of_label: site.settings?.best_of_label || "",
    facebook_url: site.settings?.facebook_url || "",
    twitter_url: site.settings?.twitter_url || "",
    instagram_url: site.settings?.instagram_url || "",
    contact_email: site.settings?.contact_email || "",
    weather_city: site.settings?.weather_city || "",
    weather_lat: site.settings?.weather_lat ?? "",
    weather_lon: site.settings?.weather_lon ?? "",
    comments_enabled: site.settings?.comments_enabled ?? false,
    breaking_news: site.settings?.breaking_news || "",
    ga_measurement_id: site.settings?.ga_measurement_id || "",
    native_analytics_enabled: site.settings?.native_analytics_enabled ?? true,
    // Advertise page options
    adv_ad_types: site.settings?.advertise_options?.ad_types || ["Digital Display", "Print", "Sponsorship", "Newsletter", "Social Media"],
    adv_zones: site.settings?.advertise_options?.zones || ["Leaderboard", "Sidebar", "In-Article", "Banner"],
    adv_budget_ranges: site.settings?.advertise_options?.budget_ranges || ["Under $250/mo", "$250–$500/mo", "$500–$1,000/mo", "$1,000+/mo"],
    adv_how_heard: site.settings?.advertise_options?.how_heard || ["Search Engine", "Social Media", "Referral", "Print Edition", "Other"],
    adv_intro_text: site.settings?.advertise_options?.intro_text || "",
    adv_enabled: site.settings?.advertise_options?.enabled ?? true,
    // Subscription options
    sub_enabled: site.settings?.subscription_options?.enabled ?? true,
    sub_intro_text: site.settings?.subscription_options?.intro_text || "",
    sub_tiers: site.settings?.subscription_options?.tiers || [],
  });

  const loadHouseAds = async (siteId) => {
    const { data: zones } = await supabase.from("ad_zones").select("id, slug, name").eq("publication_id", siteId).eq("is_active", true);
    if (!zones?.length) { setAdLocations(DEFAULT_AD_LOCATIONS); setHouseAds({}); return; }
    // Build ad locations from this site's actual zones, using DEFAULT_AD_LOCATIONS for dimensions
    const locs = zones.map(z => {
      const def = DEFAULT_AD_LOCATIONS.find(d => d.slug === z.slug);
      return { slug: z.slug, name: z.name, width: def?.width || 300, height: def?.height || 250 };
    });
    setAdLocations(locs);
    const zoneMap = {};
    zones.forEach(z => { zoneMap[z.slug] = { zone_id: z.id, placements: [] }; });
    const { data: placements } = await supabase.from("ad_placements").select("id, ad_zone_id, creative_url, click_url, alt_text").in("ad_zone_id", zones.map(z => z.id)).eq("is_active", true).order("created_at");
    if (placements) {
      placements.forEach(p => {
        const zone = zones.find(z => z.id === p.ad_zone_id);
        if (zone && zoneMap[zone.slug]) zoneMap[zone.slug].placements.push(p);
      });
    }
    const result = {};
    locs.forEach(loc => {
      result[loc.slug] = zoneMap[loc.slug]?.placements?.map(p => ({
        id: p.id, zone_id: zoneMap[loc.slug].zone_id,
        creative_url: p.creative_url || "", click_url: p.click_url || "", alt_text: p.alt_text || "",
      })) || [];
    });
    setHouseAds(result);
  };

  const selectSite = (id) => {
    if (id === "__mydash") { setSelectedId("__mydash"); setDraft(null); setSaved(true); return; }
    const site = sites.find(s => s.id === id);
    if (site) { setSelectedId(id); setDraft(buildDraft(site)); setSaved(false); loadHouseAds(id); }
  };

  const update = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setSaved(false); };

  const save = useCallback(async () => {
    if (!selectedId || !draft) return;
    setSaving(true);
    const settings = {
      primary_color: draft.primary_color,
      secondary_color: draft.secondary_color,
      tagline: draft.tagline,
      nav_categories: draft.nav_categories,
      homepage_main: draft.homepage_main,
      homepage_bottom: draft.homepage_bottom,
      best_of_slug: draft.best_of_slug,
      best_of_label: draft.best_of_label,
      facebook_url: draft.facebook_url,
      twitter_url: draft.twitter_url,
      instagram_url: draft.instagram_url,
      contact_email: draft.contact_email,
      weather_city: draft.weather_city,
      weather_lat: draft.weather_lat ? Number(draft.weather_lat) : null,
      weather_lon: draft.weather_lon ? Number(draft.weather_lon) : null,
      comments_enabled: draft.comments_enabled,
      breaking_news: draft.breaking_news,
      ga_measurement_id: draft.ga_measurement_id,
      native_analytics_enabled: draft.native_analytics_enabled,
      advertise_options: {
        ad_types: draft.adv_ad_types,
        zones: draft.adv_zones,
        budget_ranges: draft.adv_budget_ranges,
        how_heard: draft.adv_how_heard,
        intro_text: draft.adv_intro_text,
        enabled: draft.adv_enabled,
      },
      subscription_options: {
        enabled: draft.sub_enabled,
        intro_text: draft.sub_intro_text,
        tiers: draft.sub_tiers,
      },
    };

    // Merge settings jsonb (preserve keys we don't manage)
    const site = sites.find(s => s.id === selectedId);
    const merged = { ...(site?.settings || {}), ...settings };

    const { error } = await supabase.from("sites").update({
      logo_url: draft.logo_url || null,
      favicon_url: draft.favicon_url || null,
      settings: merged,
      updated_at: new Date().toISOString(),
    }).eq("id", selectedId);

    if (!error) {
      setSites(prev => prev.map(s => s.id === selectedId ? { ...s, logo_url: draft.logo_url, favicon_url: draft.favicon_url, settings: merged } : s));

      // Save house ads — only for zones that have placements edited
      try {
        const hasAnyAds = Object.values(houseAds).some(arr => arr?.length > 0);
        if (hasAnyAds) {
          await Promise.all(adLocations.map(async (loc) => {
            const ads = houseAds[loc.slug] || [];
            if (!ads.length) return;
            // Ensure zone exists
            let { data: zone } = await supabase.from("ad_zones").select("id").eq("publication_id", selectedId).eq("slug", loc.slug).maybeSingle();
            if (!zone) {
              const { data: newZone, error: zErr } = await supabase.from("ad_zones").insert({ publication_id: selectedId, name: loc.name, slug: loc.slug, zone_type: "display", is_active: true }).select("id").single();
              if (zErr) { console.error("Zone create error:", zErr); return; }
              zone = newZone;
            }
            if (!zone) return;
            // Upsert placements
            await Promise.all(ads.map(async (ad) => {
              if (ad.id) {
                await supabase.from("ad_placements").update({ creative_url: ad.creative_url, click_url: ad.click_url, alt_text: ad.alt_text }).eq("id", ad.id);
              } else if (ad.creative_url) {
                await supabase.from("ad_placements").insert({ ad_zone_id: zone.id, creative_url: ad.creative_url, click_url: ad.click_url, alt_text: ad.alt_text, start_date: new Date().toISOString().split("T")[0], end_date: "2027-12-31", is_active: true });
              }
            }));
          }));
          loadHouseAds(selectedId);
        }
      } catch (e) { console.error("House ads save error:", e); }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      await dialog.alert("Save failed: " + error.message);
    }
    setSaving(false);
  }, [selectedId, draft, sites, houseAds, adLocations, dialog]);

  const site = sites.find(s => s.id === selectedId);

  // ─── Site Errors ────────────────────────────────────────
  const [siteErrors, setSiteErrors] = useState([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [redirectFormId, setRedirectFormId] = useState(null);
  const [redirectNewPath, setRedirectNewPath] = useState('');

  useEffect(() => {
    if (!selectedId || !isOnline()) return;
    setErrorsLoading(true);
    supabase.from("site_errors").select("*").eq("publication_id", selectedId).eq("resolved", showResolved).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { setSiteErrors(data || []); setErrorsLoading(false); });
  }, [selectedId, showResolved]);

  const resolveError = async (errorId) => {
    await supabase.from("site_errors").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", errorId);
    setSiteErrors(prev => prev.filter(e => e.id !== errorId));
  };

  const is404 = (e) => (e.error_type || '').includes('404') || e.status_code === 404;
  const extractPath = (url) => { try { return new URL(url).pathname; } catch { return url || '/'; } };
  const submitRedirect = async (err) => {
    const oldPath = extractPath(err.url);
    if (!redirectNewPath.trim()) return;
    await supabase.from("redirects").insert({ publication_id: err.publication_id || selectedId, old_path: oldPath, new_path: redirectNewPath.trim(), status_code: 301 });
    await resolveError(err.id);
    setRedirectFormId(null);
    setRedirectNewPath('');
  };

  const websitePubs = (pubs || []).filter(p => p.hasWebsite);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading sites...</div>;
  if (sites.length === 0 && websitePubs.length === 0) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>No publications with websites. Enable "Has Website" in Publications to get started.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>MyWebsites</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Sel value={selectedId || ""} onChange={e => selectSite(e.target.value)} options={[{ value: "__mydash", label: "MyDash Appearance" }, ...sites.map(s => ({ value: s.id, label: s.name }))]} />
          {site?.domain && (
            <a href={"https://" + site.domain} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: Z.ac, fontFamily: COND, textDecoration: "none", padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd }}>
              Preview {site.domain} {"\u2197"}
            </a>
          )}
          <Btn sm onClick={save} disabled={saving}>
            {saving ? "Saving..." : saved ? "\u2713 Saved" : "Save Changes"}
          </Btn>
        </div>
      </div>

      {/* ─── Org Appearance (when MyDash selected) ────── */}
      {selectedId === "__mydash" && <OrgAppearancePanel />}

      {draft && selectedId && selectedId !== "__mydash" && <SiteAnalytics siteId={selectedId} />}

      {/* ─── Site Errors Panel ─── */}
      {selectedId && (
        <div style={{ background: Z.sf, borderRadius: R, border: "1px solid " + Z.bd, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Ic.alert size={16} color={siteErrors.length > 0 && !showResolved ? "#DC2626" : Z.tm} />
              <span style={{ fontSize: 14, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Site Errors</span>
              {!showResolved && siteErrors.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "#DC262615", padding: "2px 8px", borderRadius: 10 }}>{siteErrors.length} unresolved</span>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Toggle checked={showResolved} onChange={setShowResolved} label={showResolved ? "Showing resolved" : "Showing open"} />
            </div>
          </div>
          {errorsLoading ? <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: 12 }}>Loading...</div>
          : siteErrors.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: 12, fontFamily: COND }}>{showResolved ? "No resolved errors" : "No errors — all clear"}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
              {siteErrors.map(e => {
                const typeColors = { runtime: "#DC2626", "404": "#D97706", api: "#7C3AED", render: "#2563EB", network: "#6B7280" };
                const tc = typeColors[e.error_type] || Z.tm;
                return <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: Z.sa, borderRadius: 4, borderLeft: "3px solid " + tc }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tc, textTransform: "uppercase", fontFamily: COND }}>{e.error_type}</span>
                        {e.status_code && <span style={{ fontSize: 10, fontWeight: 600, color: Z.tm, fontFamily: COND }}>{e.status_code}</span>}
                        <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginLeft: "auto" }}>{new Date(e.created_at || e.first_detected_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.message || "No message"}</div>
                      <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.url}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {!e.resolved && is404(e) && <Btn sm v="ghost" onClick={() => { setRedirectFormId(redirectFormId === e.id ? null : e.id); setRedirectNewPath(''); }} style={{ fontSize: 10, padding: "2px 6px", color: Z.ac }}>{"\u2192"} Redirect</Btn>}
                      {!e.resolved && <Btn sm v="ghost" onClick={() => resolveError(e.id)} style={{ flexShrink: 0 }}>Resolve</Btn>}
                    </div>
                  </div>
                  {redirectFormId === e.id && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 12px 6px 18px", background: Z.bg, borderRadius: 4 }}>
                      <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND, flexShrink: 0 }}>{extractPath(e.url)}</span>
                      <span style={{ fontSize: 10, color: Z.td }}>{"\u2192"}</span>
                      <input value={redirectNewPath} onChange={ev => setRedirectNewPath(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter") submitRedirect(e); }} placeholder="/new-path" autoFocus style={{ flex: 1, padding: "4px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND, outline: "none" }} />
                      <Btn sm onClick={() => submitRedirect(e)} style={{ fontSize: 10, padding: "2px 8px" }}>Save</Btn>
                      <button onClick={() => setRedirectFormId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: 12 }}>{"\u2715"}</button>
                    </div>
                  )}
                </div>;
              })}
            </div>}
        </div>
      )}

      {draft && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* LEFT COLUMN */}
          <div>
            <Section title="Branding">
              <ImageField label="Logo" value={draft.logo_url} onChange={v => update("logo_url", v)} publicationId={site?.id} category="pub_logo" />
              <ImageField label="Favicon" value={draft.favicon_url} onChange={v => update("favicon_url", v)} publicationId={site?.id} category="pub_asset" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Primary Color">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="color" value={draft.primary_color} onChange={e => update("primary_color", e.target.value)} style={getColorStyle()} />
                    <input value={draft.primary_color} onChange={e => update("primary_color", e.target.value)} style={{ ...getInputStyle(), flex: 1 }} />
                  </div>
                </Field>
                <Field label="Secondary Color">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="color" value={draft.secondary_color} onChange={e => update("secondary_color", e.target.value)} style={getColorStyle()} />
                    <input value={draft.secondary_color} onChange={e => update("secondary_color", e.target.value)} style={{ ...getInputStyle(), flex: 1 }} />
                  </div>
                </Field>
              </div>
              <Field label="Tagline">
                <input value={draft.tagline} onChange={e => update("tagline", e.target.value)} placeholder="Your site tagline..." style={getInputStyle()} />
              </Field>
            </Section>

            <Section title="Social & Contact">
              <Field label="Facebook URL">
                <input value={draft.facebook_url} onChange={e => update("facebook_url", e.target.value)} placeholder="https://facebook.com/..." style={getInputStyle()} />
              </Field>
              <Field label="Twitter / X URL">
                <input value={draft.twitter_url} onChange={e => update("twitter_url", e.target.value)} placeholder="https://x.com/..." style={getInputStyle()} />
              </Field>
              <Field label="Instagram URL">
                <input value={draft.instagram_url} onChange={e => update("instagram_url", e.target.value)} placeholder="https://instagram.com/..." style={getInputStyle()} />
              </Field>
              <Field label="Contact Email">
                <input type="email" value={draft.contact_email} onChange={e => update("contact_email", e.target.value)} placeholder="editor@..." style={getInputStyle()} />
              </Field>
            </Section>

            <Section title="Weather">
              <Field label="City Name">
                <input value={draft.weather_city} onChange={e => update("weather_city", e.target.value)} placeholder="e.g. Atascadero" style={getInputStyle()} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Latitude">
                  <input type="number" step="0.0001" value={draft.weather_lat} onChange={e => update("weather_lat", e.target.value)} placeholder="35.4894" style={getInputStyle()} />
                </Field>
                <Field label="Longitude">
                  <input type="number" step="0.0001" value={draft.weather_lon} onChange={e => update("weather_lon", e.target.value)} placeholder="-120.6707" style={getInputStyle()} />
                </Field>
              </div>
            </Section>

            <Section title="Analytics">
              <Toggle checked={draft.native_analytics_enabled && !draft.ga_measurement_id} onChange={v => update("native_analytics_enabled", v)} label={draft.ga_measurement_id ? "Native Analytics (disabled — using Google Analytics)" : "Native Analytics Enabled"} />
              {!draft.ga_measurement_id && draft.native_analytics_enabled && (
                <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: -4 }}>Tracking page views, sessions, referrers, and top pages natively.</div>
              )}
              <Field label="Google Analytics Measurement ID">
                <input value={draft.ga_measurement_id} onChange={e => update("ga_measurement_id", e.target.value)} placeholder="G-XXXXXXXXXX" style={getInputStyle()} />
              </Field>
              {draft.ga_measurement_id && (
                <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: -4 }}>Native analytics is automatically disabled when Google Analytics is configured.</div>
              )}
            </Section>

            <Section title="House Ads">
              {adLocations.map(loc => {
                const ads = houseAds[loc.slug] || [];
                const updateAd = (idx, key, value) => {
                  setHouseAds(prev => {
                    const updated = { ...prev };
                    const arr = [...(updated[loc.slug] || [])];
                    arr[idx] = { ...arr[idx], [key]: value };
                    updated[loc.slug] = arr;
                    return updated;
                  });
                  setSaved(false);
                };
                const removeAd = (idx) => {
                  setHouseAds(prev => {
                    const updated = { ...prev };
                    updated[loc.slug] = (updated[loc.slug] || []).filter((_, i) => i !== idx);
                    return updated;
                  });
                  setSaved(false);
                };
                const addAd = () => {
                  if (ads.length >= 2) return;
                  setHouseAds(prev => ({
                    ...prev,
                    [loc.slug]: [...(prev[loc.slug] || []), { creative_url: "", click_url: "", alt_text: "" }],
                  }));
                  setSaved(false);
                };
                return (
                  <div key={loc.slug} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: Z.tx, fontFamily: COND }}>
                        {loc.name} <span style={{ fontWeight: 400, color: Z.tm }}>({loc.width}×{loc.height})</span>
                      </div>
                      <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{ads.length}/2</span>
                    </div>
                    {ads.map((ad, i) => {
                      const uploadKey = loc.slug + ":" + i;
                      const handleAdUpload = async () => {
                        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
                        inp.onchange = async (e) => {
                          const f = e.target.files[0]; if (!f) return;
                          setAdUploading(uploadKey);
                          try {
                            const row = await uploadMedia(f, {
                              category: "ad_creative",
                              publicationId: selectedId || null,
                              caption: `${loc.name} ad creative`,
                            });
                            updateAd(i, "creative_url", row.cdn_url);
                          } catch (err) { await dialog.alert("Upload failed: " + err.message); }
                          setAdUploading(null);
                        };
                        inp.click();
                      };
                      return (
                      <div key={i} style={{ padding: 8, border: "1px solid " + Z.bd, borderRadius: 4, background: Z.sa, marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          {ad.creative_url ? (
                            <img src={ad.creative_url} alt="" style={{ width: 80, height: 54, objectFit: "cover", borderRadius: 3, border: "1px solid " + Z.bd, flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 80, height: 54, borderRadius: 3, border: "1px dashed " + Z.bd, background: Z.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: Z.td, fontFamily: COND }}>No image</div>
                          )}
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Creative</div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={handleAdUpload} disabled={adUploading === uploadKey} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.bg, color: Z.tx, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
                                  {adUploading === uploadKey ? "Uploading..." : "Upload"}
                                </button>
                                <button onClick={() => openMediaPicker(loc.slug, i)} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.bg, color: Z.tm, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
                                  Media Library
                                </button>
                                {ad.creative_url && <button onClick={() => updateAd(i, "creative_url", "")} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 11, fontFamily: COND, fontWeight: 600 }}>Clear</button>}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 1 }}>Click URL</div>
                              <input value={ad.click_url || ""} onChange={e => updateAd(i, "click_url", e.target.value)} placeholder="https://..." style={getInputStyle()} />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 1 }}>Alt Text</div>
                              <input value={ad.alt_text || ""} onChange={e => updateAd(i, "alt_text", e.target.value)} placeholder="Ad description..." style={getInputStyle()} />
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", marginTop: 4 }}>
                          <button onClick={() => removeAd(i)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 11, fontFamily: COND, fontWeight: 700 }}>Remove</button>
                        </div>
                      </div>
                      );
                    })}
                    {ads.length < 2 && (
                      <button onClick={addAd} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tm, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>+ Add House Ad</button>
                    )}
                  </div>
                );
              })}
            </Section>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <Section title="Navigation & Layout">
              <Field label="Nav Categories">
                <OrderableList items={draft.nav_categories} onChange={v => update("nav_categories", v)} placeholder="Add category (e.g. News)..." showSlug />
              </Field>
              <Field label="Homepage Main Grid (top section)">
                <OrderableList items={draft.homepage_main} onChange={v => update("homepage_main", v)} placeholder="Add category slug (e.g. news)..." />
              </Field>
              <Field label="Homepage Bottom Grid">
                <OrderableList items={draft.homepage_bottom} onChange={v => update("homepage_bottom", v)} placeholder="Add category slug..." />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Best Of Slug">
                  <input value={draft.best_of_slug} onChange={e => update("best_of_slug", e.target.value)} placeholder="e.g. best-of-north-slo-county" style={getInputStyle()} />
                </Field>
                <Field label="Best Of Label">
                  <input value={draft.best_of_label} onChange={e => update("best_of_label", e.target.value)} placeholder="Best of North SLO County 2026" style={getInputStyle()} />
                </Field>
              </div>
            </Section>

            <Section title="Features">
              <Toggle checked={draft.comments_enabled} onChange={v => update("comments_enabled", v)} label="Comments Enabled" />
              <Field label="Breaking News Banner">
                <input value={draft.breaking_news} onChange={e => update("breaking_news", e.target.value)} placeholder="Leave empty to hide. Text or JSON {text, url}" style={getInputStyle()} />
              </Field>
            </Section>

            <Section title="Advertise Page">
              <Toggle checked={draft.adv_enabled} onChange={v => update("adv_enabled", v)} label="Advertise Page Enabled" />
              <Field label="Intro Text">
                <textarea value={draft.adv_intro_text} onChange={e => update("adv_intro_text", e.target.value)} placeholder="Reach our engaged local audience..." rows={3} style={{ ...getInputStyle(), resize: "vertical" }} />
              </Field>
              <Field label="Ad Types">
                <OrderableList items={draft.adv_ad_types} onChange={v => update("adv_ad_types", v)} placeholder="Add ad type (e.g. Print)..." />
              </Field>
              <Field label="Ad Zones / Placements">
                <OrderableList items={draft.adv_zones} onChange={v => update("adv_zones", v)} placeholder="Add zone (e.g. Sidebar)..." />
              </Field>
              <Field label="Budget Ranges">
                <OrderableList items={draft.adv_budget_ranges} onChange={v => update("adv_budget_ranges", v)} placeholder="Add range (e.g. $500–$1,000/mo)..." />
              </Field>
              <Field label="How Did You Hear Options">
                <OrderableList items={draft.adv_how_heard} onChange={v => update("adv_how_heard", v)} placeholder="Add option (e.g. Referral)..." />
              </Field>
            </Section>

            <Section title="Subscriptions">
              <Toggle checked={draft.sub_enabled} onChange={v => update("sub_enabled", v)} label="Subscribe Page Enabled" />
              <Field label="Intro Text">
                <textarea value={draft.sub_intro_text} onChange={e => update("sub_intro_text", e.target.value)} placeholder="Subscribe to support local journalism..." rows={3} style={{ ...getInputStyle(), resize: "vertical" }} />
              </Field>
              <Field label="Subscription Tiers">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(draft.sub_tiers || []).map((tier, i) => (
                    <div key={i} style={{ padding: 10, border: "1px solid " + Z.bd, borderRadius: 4, background: Z.sa }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Name</div>
                          <input value={tier.name || ""} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], name: e.target.value }; update("sub_tiers", t); }} style={getInputStyle()} placeholder="Print — Annual" />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Type</div>
                          <select value={tier.type || "digital"} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], type: e.target.value, requires_address: e.target.value !== "digital" }; update("sub_tiers", t); }} style={getInputStyle()}>
                            <option value="digital">Digital</option>
                            <option value="print">Print</option>
                            <option value="print_digital">Print + Digital</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Price (cents)</div>
                          <input type="number" value={tier.price ?? 0} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], price: Number(e.target.value) }; update("sub_tiers", t); }} style={getInputStyle()} placeholder="9900" />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Interval</div>
                          <select value={tier.interval || "year"} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], interval: e.target.value }; update("sub_tiers", t); }} style={getInputStyle()}>
                            <option value="month">Monthly</option>
                            <option value="year">Annual</option>
                            <option value="one_time">One-time</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Stripe Price ID</div>
                          <input value={tier.stripe_price_id || ""} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], stripe_price_id: e.target.value }; update("sub_tiers", t); }} style={getInputStyle()} placeholder="price_xxx" />
                        </div>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Description</div>
                        <input value={tier.description || ""} onChange={e => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], description: e.target.value }; update("sub_tiers", t); }} style={getInputStyle()} placeholder="Weekly print edition delivered to your door" />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Toggle checked={tier.requires_address ?? false} onChange={v => { const t = [...draft.sub_tiers]; t[i] = { ...t[i], requires_address: v }; update("sub_tiers", t); }} label="Requires Address" />
                        <button onClick={() => { const t = draft.sub_tiers.filter((_, idx) => idx !== i); update("sub_tiers", t); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 12, fontFamily: COND, fontWeight: 700 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <Btn sm onClick={() => update("sub_tiers", [...(draft.sub_tiers || []), { id: "tier-" + Date.now(), name: "", type: "digital", interval: "year", price: 0, stripe_price_id: "", description: "", requires_address: false }])}>+ Add Tier</Btn>
                </div>
              </Field>
            </Section>

            {/* Live preview card */}
            {site && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 6, border: "1px solid " + Z.bd, background: Z.sa }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 10 }}>Preview</div>
                <div style={{ background: draft.primary_color, borderRadius: 4, padding: "12px 16px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {draft.logo_url && <img src={draft.logo_url} alt="" style={{ height: 28, objectFit: "contain" }} />}
                    <span style={{ color: INV.light, fontSize: 14, fontWeight: 700, fontFamily: COND }}>{site.name}</span>
                  </div>
                  {draft.nav_categories.length > 0 && (
                    <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                      {draft.nav_categories.slice(0, 6).map(c => (
                        <span key={c} style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: 600, fontFamily: COND }}>{c}</span>
                      ))}
                      {draft.nav_categories.length > 6 && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: COND }}>+{draft.nav_categories.length - 6}</span>}
                    </div>
                  )}
                </div>
                {draft.tagline && <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>{draft.tagline}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 10, color: Z.tm, fontFamily: COND }}>
                  <span>{site.domain}</span>
                  {draft.contact_email && <span>| {draft.contact_email}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Library Modal for House Ad image selection */}
      {mediaOpen && MediaModal && <MediaModal
        open={mediaOpen}
        onClose={() => { setMediaOpen(false); setMediaTarget(null); }}
        onSelect={(asset) => {
          if (mediaTarget) {
            setHouseAds(prev => {
              const updated = { ...prev };
              const arr = [...(updated[mediaTarget.zone] || [])];
              arr[mediaTarget.idx] = { ...arr[mediaTarget.idx], creative_url: asset.url };
              updated[mediaTarget.zone] = arr;
              return updated;
            });
            setSaved(false);
          }
          setMediaOpen(false);
          setMediaTarget(null);
        }}
        pubs={pubs}
      />}
    </div>
  );
}
