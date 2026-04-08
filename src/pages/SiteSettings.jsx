import { useState, useEffect, useCallback } from "react";
import { Z, COND, DISPLAY, FS, FW, LABEL, INPUT, INV } from "../lib/theme";
import { Ic, Btn, Inp, TA } from "../components/ui";
import MediaModal from "../components/MediaModal";
import { supabase, isOnline } from "../lib/supabase";

// ── Upload via Edge Function ─────────────────────────────────────
async function uploadImage(file, path) {
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const filename = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch("https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/upload-image", {
    method: "POST",
    headers: { "Authorization": "Bearer " + session.access_token, "x-upload-path": path || "uploads", "x-file-name": filename, "x-content-type": file.type || "image/jpeg" },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed: " + res.status); }
  return (await res.json()).url;
}

// ── Ad Locations ────────────────────────────────────────────────
const AD_LOCATIONS = [
  { slug: "leaderboard", name: "Leaderboard", width: 728, height: 90 },
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
const ImageField = ({ value, onChange, uploadPath, label }) => {
  const [uploading, setUploading] = useState(false);
  const handleUpload = async () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setUploading(true);
      try { const url = await uploadImage(f, uploadPath || "sites"); onChange(url); }
      catch (err) { alert("Upload failed: " + err.message); }
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

// ══════════════════════════════════════════════════════════════════
// SITE SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════
export default function SiteSettings({ pubs, setPubs }) {
  const [sites, setSites] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [houseAds, setHouseAds] = useState({}); // { [zone_slug]: [{ id?, zone_id?, creative_url, click_url, alt_text }] }
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState(null); // { zone, idx } — which ad slot is picking
  const [adUploading, setAdUploading] = useState(null); // "zone:idx" while uploading

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
    issuu_enabled: site.settings?.issuu_enabled ?? false,
    breaking_news: site.settings?.breaking_news || "",
    ga_measurement_id: site.settings?.ga_measurement_id || "",
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
    const { data: zones } = await supabase.from("ad_zones").select("id, slug").eq("publication_id", siteId).eq("is_active", true);
    if (!zones?.length) { setHouseAds({}); return; }
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
    AD_LOCATIONS.forEach(loc => {
      result[loc.slug] = zoneMap[loc.slug]?.placements?.map(p => ({
        id: p.id, zone_id: zoneMap[loc.slug].zone_id,
        creative_url: p.creative_url || "", click_url: p.click_url || "", alt_text: p.alt_text || "",
      })) || [];
    });
    setHouseAds(result);
  };

  const selectSite = (id) => {
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
      issuu_enabled: draft.issuu_enabled,
      breaking_news: draft.breaking_news,
      ga_measurement_id: draft.ga_measurement_id,
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

      // Save house ads
      for (const loc of AD_LOCATIONS) {
        const ads = houseAds[loc.slug] || [];
        // Ensure zone exists
        let { data: zone } = await supabase.from("ad_zones").select("id").eq("publication_id", selectedId).eq("slug", loc.slug).maybeSingle();
        if (!zone) {
          const { data: newZone } = await supabase.from("ad_zones").insert({ publication_id: selectedId, name: loc.name, slug: loc.slug, zone_type: "display", is_active: true }).select("id").single();
          zone = newZone;
        }
        if (!zone) continue;
        // Get existing placements for this zone
        const { data: existing } = await supabase.from("ad_placements").select("id").eq("ad_zone_id", zone.id).eq("is_active", true);
        const existingIds = (existing || []).map(e => e.id);
        const keepIds = ads.filter(a => a.id).map(a => a.id);
        // Deactivate removed placements
        const removeIds = existingIds.filter(id => !keepIds.includes(id));
        if (removeIds.length) await supabase.from("ad_placements").update({ is_active: false }).in("id", removeIds);
        // Upsert placements
        for (const ad of ads) {
          if (ad.id) {
            await supabase.from("ad_placements").update({ creative_url: ad.creative_url, click_url: ad.click_url, alt_text: ad.alt_text }).eq("id", ad.id);
          } else if (ad.creative_url) {
            await supabase.from("ad_placements").insert({ ad_zone_id: zone.id, creative_url: ad.creative_url, click_url: ad.click_url, alt_text: ad.alt_text, start_date: new Date().toISOString().split("T")[0], end_date: "2027-12-31", is_active: true });
          }
        }
      }
      await loadHouseAds(selectedId);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert("Save failed: " + error.message);
    }
    setSaving(false);
  }, [selectedId, draft, sites, houseAds]);

  const site = sites.find(s => s.id === selectedId);

  const websitePubs = (pubs || []).filter(p => p.hasWebsite);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading sites...</div>;
  if (sites.length === 0 && websitePubs.length === 0) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>No publications with websites. Enable "Has Website" in Publications to get started.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>MyWebsites</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

      {/* Site selector tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {sites.map(s => (
          <button key={s.id} onClick={() => selectSite(s.id)} style={{
            padding: "6px 14px", borderRadius: 3, fontSize: 12, fontWeight: selectedId === s.id ? 700 : 500,
            border: "1px solid " + (selectedId === s.id ? Z.ac : Z.bd),
            background: selectedId === s.id ? Z.ac + "12" : "transparent",
            color: selectedId === s.id ? Z.ac : Z.tm, cursor: "pointer", fontFamily: COND,
          }}>{s.name}</button>
        ))}
      </div>

      {draft && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* LEFT COLUMN */}
          <div>
            <Section title="Branding">
              <ImageField label="Logo" value={draft.logo_url} onChange={v => update("logo_url", v)} uploadPath={"sites/" + (site?.slug || "general")} />
              <ImageField label="Favicon" value={draft.favicon_url} onChange={v => update("favicon_url", v)} uploadPath={"sites/" + (site?.slug || "general")} />
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
              <Field label="Google Analytics Measurement ID">
                <input value={draft.ga_measurement_id} onChange={e => update("ga_measurement_id", e.target.value)} placeholder="G-XXXXXXXXXX" style={getInputStyle()} />
              </Field>
            </Section>

            <Section title="House Ads">
              {AD_LOCATIONS.map(loc => {
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
                            const url = await uploadImage(f, "house-ads/" + (site?.slug || "general"));
                            updateAd(i, "creative_url", url);
                          } catch (err) { alert("Upload failed: " + err.message); }
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
                                <button onClick={() => { setMediaTarget({ zone: loc.slug, idx: i }); setMediaOpen(true); }} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.bg, color: Z.tm, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
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
              <Toggle checked={draft.issuu_enabled} onChange={v => update("issuu_enabled", v)} label="Issuu E-Edition Enabled" />
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
      <MediaModal
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
      />
    </div>
  );
}
