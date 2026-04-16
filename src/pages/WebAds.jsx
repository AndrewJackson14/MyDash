import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Toggle, Modal, GlassCard, GlassStat, PageHeader, TabRow, TB, DataTable, SB } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";

const WebAds = ({ pubs, clients, sales }) => {
  const dialog = useDialog();
  const [tab, setTab] = useState("Active Ads");
  const [placements, setPlacements] = useState([]);
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fPub, setFPub] = useState("all");

  // Create form
  const [form, setForm] = useState({
    publicationId: "", zoneId: "", clientId: "", saleId: "",
    creativeUrl: "", creativeHtml: "", clickUrl: "", altText: "",
    startDate: "", endDate: "",
  });
  const [creativeMode, setCreativeMode] = useState("image"); // image | html
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("ad_placements").select("*").order("created_at", { ascending: false }),
      supabase.from("ad_zones").select("*").order("sort_order"),
      supabase.from("web_ad_rates").select("*").eq("is_active", true).order("sort_order"),
    ]).then(([plRes, zRes, rRes]) => {
      setPlacements(plRes.data || []);
      setZones(zRes.data || []);
      setRates(rRes.data || []);
      setLoading(false);
    });
  }, []);

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "\u2014";
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "\u2014";
  const zn = (id) => zones.find(z => z.id === id)?.name || "\u2014";

  const websitePubs = (pubs || []).filter(p => p.hasWebsite);
  const pubZones = form.publicationId ? zones.filter(z => z.publication_id === form.publicationId && z.is_active) : [];
  const clientWebSales = form.clientId ? (sales || []).filter(s => s.clientId === form.clientId && s.productType === "web" && s.status === "Closed") : [];

  const activePlacements = placements.filter(p => p.is_active);
  const totalImpressions = activePlacements.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalClicks = activePlacements.reduce((s, p) => s + (p.clicks || 0), 0);
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  const filteredPlacements = fPub === "all" ? placements : placements.filter(p => {
    const zone = zones.find(z => z.id === p.ad_zone_id);
    return zone?.publication_id === fPub;
  });

  const toggleActive = async (id, current) => {
    await supabase.from("ad_placements").update({ is_active: !current }).eq("id", id);
    setPlacements(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `web-ads/${Date.now()}-${file.name}`;
    const reader = new FileReader();
    const base64 = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });
    const res = await fetch(EDGE_FN_URL + "/bunny-storage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, body: base64, contentType: file.type }),
    });
    if (res.ok) {
      const cdnUrl = `https://cdn.13stars.media/${path}`;
      setForm(f => ({ ...f, creativeUrl: cdnUrl }));
    }
    setUploading(false);
  };

  const createPlacement = async () => {
    if (!form.zoneId || !form.clientId || !form.startDate || !form.endDate) return;
    if (!form.creativeUrl && !form.creativeHtml) { await dialog.alert("Please upload an image or enter HTML for the creative."); return; }
    const { data, error } = await supabase.from("ad_placements").insert({
      ad_zone_id: form.zoneId, client_id: form.clientId,
      sale_id: form.saleId || null,
      creative_url: form.creativeUrl || null,
      creative_html: form.creativeHtml || null,
      click_url: form.clickUrl || null,
      alt_text: form.altText || null,
      start_date: form.startDate, end_date: form.endDate,
      is_active: true, impressions: 0, clicks: 0,
    }).select().single();
    if (error) { await dialog.alert("Error: " + error.message); return; }
    if (data) setPlacements(prev => [data, ...prev]);
    setForm({ publicationId: "", zoneId: "", clientId: "", saleId: "", creativeUrl: "", creativeHtml: "", clickUrl: "", altText: "", startDate: "", endDate: "" });
    setTab("Active Ads");
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading web ads...</div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Web Ads" />
    <TabRow><TB tabs={["Active Ads", "Create Placement", "Zones & Rates"]} active={tab} onChange={setTab} /></TabRow>

    {tab === "Active Ads" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Active Placements" value={activePlacements.length} color={Z.su} />
        <GlassStat label="Total Impressions" value={totalImpressions.toLocaleString()} />
        <GlassStat label="Total Clicks" value={totalClicks.toLocaleString()} />
        <GlassStat label="Avg CTR" value={avgCtr + "%"} color={Number(avgCtr) > 1 ? Z.su : Z.wa} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...websitePubs.map(p => ({ value: p.id, label: p.name }))]} />
        <Btn sm onClick={() => setTab("Create Placement")}><Ic.plus size={12} /> New Placement</Btn>
      </div>

      <DataTable>
          <thead><tr>
            {["Client", "Zone", "Dates", "Impressions", "Clicks", "CTR", "Active", ""].map(h =>
              <th key={h} style={{ textAlign: ["Impressions", "Clicks", "CTR"].includes(h) ? "right" : "left" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filteredPlacements.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: Z.td }}>No placements</td></tr>}
            {filteredPlacements.map(p => {
              const ctr = p.impressions > 0 ? ((p.clicks || 0) / p.impressions * 100).toFixed(2) : "0.00";
              const isExpired = p.end_date && p.end_date < new Date().toISOString().slice(0, 10);
              return <tr key={p.id} style={{ opacity: isExpired ? 0.5 : 1 }}>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>{cn(p.client_id)}</td>
                <td style={{ color: Z.tm }}>{zn(p.ad_zone_id)}</td>
                <td style={{ fontSize: FS.sm, color: isExpired ? Z.da : Z.tm }}>{fmtDate(p.start_date)} — {fmtDate(p.end_date)}</td>
                <td style={{ textAlign: "right", color: Z.tm }}>{(p.impressions || 0).toLocaleString()}</td>
                <td style={{ textAlign: "right", color: Z.tm }}>{(p.clicks || 0).toLocaleString()}</td>
                <td style={{ textAlign: "right", fontWeight: FW.bold, color: Number(ctr) > 1 ? Z.su : Z.tm }}>{ctr}%</td>
                <td><Toggle checked={p.is_active} onChange={() => toggleActive(p.id, p.is_active)} /></td>
                <td>
                  {p.creative_url && <img src={p.creative_url} alt="" style={{ width: 40, height: 24, objectFit: "contain", borderRadius: 2 }} />}
                </td>
              </tr>;
            })}
          </tbody>
        </DataTable>
    </>}

    {tab === "Create Placement" && <>
      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Sel label="Publication" value={form.publicationId} onChange={e => setForm(f => ({ ...f, publicationId: e.target.value, zoneId: "" }))} options={[{ value: "", label: "Select publication..." }, ...websitePubs.map(p => ({ value: p.id, label: p.name }))]} />
            <Sel label="Ad Zone" value={form.zoneId} onChange={e => setForm(f => ({ ...f, zoneId: e.target.value }))} options={[{ value: "", label: "Select zone..." }, ...pubZones.map(z => ({ value: z.id, label: `${z.name} (${z.zone_type || "banner"})` }))]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Sel label="Client" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, saleId: "" }))} options={[{ value: "", label: "Select client..." }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
            {clientWebSales.length > 0 && <Sel label="Link to Sale (optional)" value={form.saleId} onChange={e => setForm(f => ({ ...f, saleId: e.target.value }))} options={[{ value: "", label: "None" }, ...clientWebSales.map(s => ({ value: s.id, label: `${fmtDate(s.date)} — $${(s.amount || 0).toLocaleString()}` }))]} />}
          </div>

          {/* Creative */}
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[["image", "Image Upload"], ["html", "HTML Snippet"]].map(([v, l]) => (
                <button key={v} onClick={() => setCreativeMode(v)} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${creativeMode === v ? Z.ac : Z.bd}`, background: creativeMode === v ? Z.ac + "12" : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: creativeMode === v ? FW.bold : FW.normal, color: creativeMode === v ? Z.ac : Z.tm, fontFamily: COND }}>{l}</button>
              ))}
            </div>
            {creativeMode === "image" ? (
              <div>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                {uploading && <span style={{ fontSize: FS.sm, color: Z.wa, marginLeft: 8 }}>Uploading...</span>}
                {form.creativeUrl && <div style={{ marginTop: 8 }}><img src={form.creativeUrl} alt="Preview" style={{ maxWidth: 300, maxHeight: 150, border: `1px solid ${Z.bd}`, borderRadius: Ri }} /></div>}
              </div>
            ) : (
              <TA label="HTML Creative" value={form.creativeHtml} onChange={e => setForm(f => ({ ...f, creativeHtml: e.target.value }))} rows={4} placeholder='<a href="..."><img src="..." /></a>' />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Inp label="Click URL" value={form.clickUrl} onChange={e => setForm(f => ({ ...f, clickUrl: e.target.value }))} placeholder="https://..." />
            <Inp label="Alt Text" value={form.altText} onChange={e => setForm(f => ({ ...f, altText: e.target.value }))} placeholder="Ad description for accessibility" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Inp label="Start Date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            <Inp label="End Date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn v="secondary" onClick={() => setTab("Active Ads")}>Cancel</Btn>
            <Btn onClick={createPlacement} disabled={!form.zoneId || !form.clientId || !form.startDate || !form.endDate || (!form.creativeUrl && !form.creativeHtml)}>Create & Activate</Btn>
          </div>
        </div>
      </GlassCard>
    </>}

    {tab === "Zones & Rates" && <>
      {websitePubs.map(pub => {
        const pubZns = zones.filter(z => z.publication_id === pub.id);
        const pubRts = rates.filter(r => r.pub_id === pub.id);
        return <GlassCard key={pub.id}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 10, fontFamily: DISPLAY }}>{pub.name}</div>

          {pubZns.length > 0 && <>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Zones</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {pubZns.map(z => (
                <div key={z.id} style={{ padding: "6px 12px", background: z.is_active ? Z.su + "12" : Z.sa, border: `1px solid ${z.is_active ? Z.su + "40" : Z.bd}`, borderRadius: Ri }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{z.name}</div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{z.zone_type || "banner"} {z.dimensions ? `${z.dimensions.width}x${z.dimensions.height}` : ""}</div>
                </div>
              ))}
            </div>
          </>}

          {pubRts.length > 0 && <>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Rate Card</div>
            <DataTable>
              <thead><tr>
                {["Product", "Monthly", "6 Month", "12 Month"].map(h => <th key={h} style={{ textAlign: h !== "Product" ? "right" : "left" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pubRts.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: FW.bold, color: Z.tx }}>{r.name}</td>
                    <td style={{ textAlign: "right", color: Z.tm }}>{fmtCurrency(r.rate_monthly)}/mo</td>
                    <td style={{ textAlign: "right", color: Z.tm }}>{fmtCurrency(r.rate_6mo)}/mo</td>
                    <td style={{ textAlign: "right", color: Z.su, fontWeight: FW.bold }}>{fmtCurrency(r.rate_12mo)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>}

          {pubZns.length === 0 && pubRts.length === 0 && <div style={{ color: Z.td, fontSize: FS.sm }}>No zones or rates configured. Set up zones in Site Settings.</div>}
        </GlassCard>;
      })}
    </>}
  </div>;
};

export default WebAds;
