import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, GlassCard, GlassStat, PageHeader, TabRow, TB, DataTable, SB } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";

const CATEGORIES = ["Employment", "Real Estate", "Automotive", "Services", "Announcements", "Garage Sale", "Pets", "Rentals", "Legal", "Other"];
const STATUSES = ["draft", "active", "expired", "cancelled"];
const STATUS_COLORS = { draft: Z.tm, active: Z.su, expired: Z.wa, cancelled: Z.da };

const ClassifiedAds = ({ pubs, clients, issues }) => {
  const dialog = useDialog();
  const [tab, setTab] = useState("Classifieds");
  const [ads, setAds] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sr, setSr] = useState("");
  const [fPub, setFPub] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [modal, setModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);

  // Ad form
  const [form, setForm] = useState({
    clientId: "", publicationId: "", category: "Announcements",
    body: "", isBold: false, hasBorder: false, hasPhoto: false, runDates: [],
  });

  // Rate form
  const [rateForm, setRateForm] = useState({
    pubId: "", name: "Standard", ratePerWord: 0.25, minWords: 10,
    basePrice: 10, boldSurcharge: 5, borderSurcharge: 5, photoSurcharge: 10,
  });

  useEffect(() => {
    Promise.all([
      supabase.from("classified_ads").select("*").order("created_at", { ascending: false }),
      supabase.from("classified_rates").select("*").eq("is_active", true),
    ]).then(([adsRes, ratesRes]) => {
      setAds(adsRes.data || []);
      setRates(ratesRes.data || []);
      setLoading(false);
    });
  }, []);

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "\u2014";
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "\u2014";

  const filtered = useMemo(() => {
    return ads.filter(a => {
      if (fPub !== "all" && a.publication_id !== fPub) return false;
      if (fStatus !== "all" && a.status !== fStatus) return false;
      if (sr) {
        const q = sr.toLowerCase();
        if (!cn(a.client_id).toLowerCase().includes(q) && !(a.body || "").toLowerCase().includes(q) && !(a.category || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [ads, fPub, fStatus, sr, clients]);

  // Price calculation
  const getRate = (pubId) => rates.find(r => r.pub_id === pubId) || { rate_per_word: 0.25, min_words: 10, base_price: 10, bold_surcharge: 5, border_surcharge: 5, photo_surcharge: 10 };
  const wordCount = (form.body || "").trim().split(/\s+/).filter(Boolean).length;

  const calcPrice = () => {
    const rate = getRate(form.publicationId);
    const words = Math.max(wordCount, rate.min_words || 10);
    let price = Number(rate.base_price || 0) + words * Number(rate.rate_per_word || 0.25);
    if (form.isBold) price += Number(rate.bold_surcharge || 0);
    if (form.hasBorder) price += Number(rate.border_surcharge || 0);
    if (form.hasPhoto) price += Number(rate.photo_surcharge || 0);
    const runs = form.runDates.length || 1;
    return { perRun: price, total: price * runs, words, runs };
  };

  const pricing = calcPrice();

  const saveAd = async () => {
    if (!form.clientId || !form.publicationId || !form.body.trim()) return;
    const { data, error } = await supabase.from("classified_ads").insert({
      client_id: form.clientId, publication_id: form.publicationId,
      category: form.category, body: form.body.trim(),
      word_count: wordCount, is_bold: form.isBold,
      has_border: form.hasBorder, has_photo: form.hasPhoto,
      total_price: pricing.total, run_dates: form.runDates,
      status: "active",
    }).select().single();
    if (error) { await dialog.alert("Error: " + error.message); return; }
    if (data) setAds(prev => [data, ...prev]);
    setModal(false);
    setForm({ clientId: "", publicationId: "", category: "Announcements", body: "", isBold: false, hasBorder: false, hasPhoto: false, runDates: [] });
  };

  const cancelAd = async (id) => {
    if (!await dialog.confirm("Cancel this classified ad?")) return;
    await supabase.from("classified_ads").update({ status: "cancelled" }).eq("id", id);
    setAds(prev => prev.map(a => a.id === id ? { ...a, status: "cancelled" } : a));
  };

  const saveRate = async () => {
    if (!rateForm.pubId) return;
    const row = {
      pub_id: rateForm.pubId, name: rateForm.name,
      rate_per_word: rateForm.ratePerWord, min_words: rateForm.minWords,
      base_price: rateForm.basePrice, bold_surcharge: rateForm.boldSurcharge,
      border_surcharge: rateForm.borderSurcharge, photo_surcharge: rateForm.photoSurcharge,
      is_active: true,
    };
    const existing = rates.find(r => r.pub_id === rateForm.pubId);
    if (existing) {
      await supabase.from("classified_rates").update(row).eq("id", existing.id);
      setRates(prev => prev.map(r => r.id === existing.id ? { ...r, ...row } : r));
    } else {
      const { data } = await supabase.from("classified_rates").insert(row).select().single();
      if (data) setRates(prev => [...prev, data]);
    }
    setRateModal(false);
  };

  // Stats
  const activeCount = ads.filter(a => a.status === "active").length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRevenue = ads.filter(a => (a.created_at || "").startsWith(thisMonth)).reduce((s, a) => s + Number(a.total_price || 0), 0);
  const totalRevenue = ads.reduce((s, a) => s + Number(a.total_price || 0), 0);

  // Issue picker for run dates
  const pubIssues = form.publicationId ? (issues || []).filter(i => i.pubId === form.publicationId && i.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12) : [];
  const toggleRunDate = (date) => {
    setForm(f => ({ ...f, runDates: f.runDates.includes(date) ? f.runDates.filter(d => d !== date) : [...f.runDates, date] }));
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading classifieds...</div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Classified Ads" />
    <TabRow><TB tabs={["Classifieds", "Rate Cards"]} active={tab} onChange={setTab} /></TabRow>

    {tab === "Classifieds" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Active Ads" value={activeCount} color={Z.su} />
        <GlassStat label="Total Ads" value={ads.length} />
        <GlassStat label="This Month" value={fmtCurrency(monthRevenue)} color={Z.ac} />
        <GlassStat label="Total Revenue" value={fmtCurrency(totalRevenue)} color={Z.su} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <SB value={sr} onChange={setSr} placeholder="Search classifieds..." />
        <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
        <Sel value={fStatus} onChange={e => setFStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, ...STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]} />
        <Btn sm onClick={() => setModal(true)}><Ic.plus size={12} /> New Classified</Btn>
      </div>

      <DataTable>
          <thead><tr>
            {["Client", "Publication", "Category", "Words", "Runs", "Price", "Status", ""].map(h =>
              <th key={h} style={{ textAlign: h === "Price" ? "right" : "left" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: Z.td }}>No classifieds match your filters</td></tr>}
            {filtered.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>{cn(a.client_id)}</td>
                <td style={{ color: Z.tm }}>{pn(a.publication_id)}</td>
                <td style={{ color: Z.tm }}>{a.category}</td>
                <td style={{ color: Z.tm }}>{a.word_count}</td>
                <td style={{ color: Z.tm }}>{(a.run_dates || []).length || 1}</td>
                <td style={{ textAlign: "right", fontWeight: FW.bold, color: Z.su }}>{fmtCurrency(a.total_price)}</td>
                <td><span style={{ fontSize: FS.xs, fontWeight: FW.bold, padding: "2px 8px", borderRadius: Ri, background: (STATUS_COLORS[a.status] || Z.tm) + "18", color: STATUS_COLORS[a.status] || Z.tm, textTransform: "capitalize" }}>{a.status}</span></td>
                <td>{a.status === "active" && <Btn sm v="ghost" onClick={() => cancelAd(a.id)} style={{ color: Z.da }}>Cancel</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
    </>}

    {tab === "Rate Cards" && <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn sm onClick={() => { setRateForm({ pubId: (pubs || [])[0]?.id || "", name: "Standard", ratePerWord: 0.25, minWords: 10, basePrice: 10, boldSurcharge: 5, borderSurcharge: 5, photoSurcharge: 10 }); setRateModal(true); }}><Ic.plus size={12} /> Set Rate</Btn>
      </div>
      {(pubs || []).map(pub => {
        const rate = rates.find(r => r.pub_id === pub.id);
        if (!rate) return <GlassCard key={pub.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{pub.name}</span>
            <span style={{ fontSize: FS.sm, color: Z.td }}>No rate card set</span>
          </div>
        </GlassCard>;
        return <GlassCard key={pub.id}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 10 }}>{pub.name} — {rate.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              ["Per Word", "$" + Number(rate.rate_per_word).toFixed(2)],
              ["Min Words", rate.min_words],
              ["Base Price", fmtCurrency(rate.base_price)],
              ["Bold", "+" + fmtCurrency(rate.bold_surcharge)],
              ["Border", "+" + fmtCurrency(rate.border_surcharge)],
              ["Photo", "+" + fmtCurrency(rate.photo_surcharge)],
            ].map(([l, v]) => <div key={l} style={{ padding: "8px 10px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>{l}</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{v}</div>
            </div>)}
          </div>
          <Btn sm v="ghost" onClick={() => { setRateForm({ pubId: rate.pub_id, name: rate.name, ratePerWord: rate.rate_per_word, minWords: rate.min_words, basePrice: rate.base_price, boldSurcharge: rate.bold_surcharge, borderSurcharge: rate.border_surcharge, photoSurcharge: rate.photo_surcharge }); setRateModal(true); }} style={{ marginTop: 8 }}>Edit Rate</Btn>
        </GlassCard>;
      })}
    </>}

    {/* New Classified Modal */}
    <Modal open={modal} onClose={() => setModal(false)} title="New Classified Ad" width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Client" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} options={[{ value: "", label: "Select client..." }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
          <Sel label="Publication" value={form.publicationId} onChange={e => setForm(f => ({ ...f, publicationId: e.target.value, runDates: [] }))} options={[{ value: "", label: "Select publication..." }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
        </div>
        <Sel label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
        <div>
          <TA label="Ad Copy" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Type the classified ad text..." />
          <div style={{ fontSize: FS.xs, color: Z.tm, textAlign: "right", marginTop: 2, fontFamily: COND }}>{wordCount} words {wordCount < (getRate(form.publicationId).min_words || 10) ? `(min ${getRate(form.publicationId).min_words || 10})` : ""}</div>
        </div>

        {/* Upgrades */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            ["isBold", "Bold Text", "bold_surcharge"],
            ["hasBorder", "Border", "border_surcharge"],
            ["hasPhoto", "Photo", "photo_surcharge"],
          ].map(([key, label, field]) => {
            const surcharge = Number(getRate(form.publicationId)[field] || 0);
            return <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 10px", background: form[key] ? Z.ac + "12" : Z.bg, border: `1px solid ${form[key] ? Z.ac : Z.bd}`, borderRadius: Ri, flex: 1 }}>
              <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: Z.ac }} />
              <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: form[key] ? Z.ac : Z.tm, fontFamily: COND }}>{label} +{fmtCurrency(surcharge)}</span>
            </label>;
          })}
        </div>

        {/* Run Dates */}
        {form.publicationId && pubIssues.length > 0 && <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontFamily: COND }}>Run in Issues ({form.runDates.length} selected)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {pubIssues.map(iss => {
              const sel = form.runDates.includes(iss.date);
              return <button key={iss.id} onClick={() => toggleRunDate(iss.date)} style={{ padding: "4px 10px", borderRadius: Ri, border: `1px solid ${sel ? Z.su : Z.bd}`, background: sel ? Z.su : "transparent", cursor: "pointer", fontSize: FS.xs, fontWeight: FW.bold, color: sel ? "#fff" : Z.tm, fontFamily: COND }}>{iss.label}</button>;
            })}
          </div>
        </div>}

        {/* Price Preview */}
        <div style={{ background: Z.sa, borderRadius: Ri, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{pricing.words} words x {pricing.runs} run{pricing.runs !== 1 ? "s" : ""}</span>
            {pricing.runs > 1 && <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}> ({fmtCurrency(pricing.perRun)}/run)</span>}
          </div>
          <span style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(pricing.total)}</span>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={saveAd} disabled={!form.clientId || !form.publicationId || !form.body.trim()}>Create Classified</Btn>
        </div>
      </div>
    </Modal>

    {/* Rate Card Modal */}
    <Modal open={rateModal} onClose={() => setRateModal(false)} title="Classified Rate Card" width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Sel label="Publication" value={rateForm.pubId} onChange={e => setRateForm(f => ({ ...f, pubId: e.target.value }))} options={(pubs || []).map(p => ({ value: p.id, label: p.name }))} />
        <Inp label="Rate Name" value={rateForm.name} onChange={e => setRateForm(f => ({ ...f, name: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Rate Per Word ($)" type="number" step="0.01" value={rateForm.ratePerWord} onChange={e => setRateForm(f => ({ ...f, ratePerWord: Number(e.target.value) }))} />
          <Inp label="Minimum Words" type="number" value={rateForm.minWords} onChange={e => setRateForm(f => ({ ...f, minWords: Number(e.target.value) }))} />
        </div>
        <Inp label="Base Price ($)" type="number" value={rateForm.basePrice} onChange={e => setRateForm(f => ({ ...f, basePrice: Number(e.target.value) }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Bold ($)" type="number" value={rateForm.boldSurcharge} onChange={e => setRateForm(f => ({ ...f, boldSurcharge: Number(e.target.value) }))} />
          <Inp label="Border ($)" type="number" value={rateForm.borderSurcharge} onChange={e => setRateForm(f => ({ ...f, borderSurcharge: Number(e.target.value) }))} />
          <Inp label="Photo ($)" type="number" value={rateForm.photoSurcharge} onChange={e => setRateForm(f => ({ ...f, photoSurcharge: Number(e.target.value) }))} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setRateModal(false)}>Cancel</Btn>
          <Btn onClick={saveRate} disabled={!rateForm.pubId}>Save Rate Card</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default ClassifiedAds;
