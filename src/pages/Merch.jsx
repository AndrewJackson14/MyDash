import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Toggle, Modal, GlassCard, GlassStat, PageHeader, TabRow, TB, DataTable, SB } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { uploadMedia } from "../lib/media";

const CATEGORIES = [
  { value: "apparel", label: "Apparel" },
  { value: "drinkware", label: "Drinkware" },
  { value: "awards", label: "Awards & Plaques" },
  { value: "swag", label: "Swag & Giveaways" },
  { value: "signage", label: "Signage" },
  { value: "other", label: "Other" },
];
const ORDER_STATUSES = ["paid", "in_production", "shipped", "delivered", "cancelled"];
const STATUS_COLORS = { paid: Z.ac, in_production: Z.wa, shipped: Z.ac, delivered: Z.su || "#22c55e", cancelled: Z.da };
const STATUS_LABELS = { paid: "Paid", in_production: "In Production", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };

const Merch = ({ clients }) => {
  const dialog = useDialog();
  const [tab, setTab] = useState("Catalog");
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [shops, setShops] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sr, setSr] = useState("");
  const [productModal, setProductModal] = useState(false);
  const [shopModal, setShopModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

  // Product form
  const blankProduct = { name: "", description: "", category: "swag", baseCost: 0, sellPrice: 0, imageUrl: "", supportsLogo: false, logoPlacementNote: "", fulfillmentDays: 14, minOrderQty: 1, variants: [] };
  const [pForm, setPForm] = useState(blankProduct);
  const [variantInput, setVariantInput] = useState("");

  // Shop form
  const [sForm, setSForm] = useState({ name: "", clientId: "", productIds: [], headerText: "", footerText: "" });

  useEffect(() => {
    Promise.all([
      supabase.from("merch_products").select("*").order("sort_order").order("name"),
      supabase.from("merch_product_variants").select("*").order("sort_order"),
      supabase.from("merch_shops").select("*").order("created_at", { ascending: false }),
      supabase.from("merch_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("merch_order_items").select("*"),
    ]).then(([pRes, vRes, sRes, oRes, oiRes]) => {
      setProducts(pRes.data || []);
      setVariants(vRes.data || []);
      setShops(sRes.data || []);
      setOrders(oRes.data || []);
      setOrderItems(oiRes.data || []);
      setLoading(false);
    });
  }, []);

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "\u2014";

  // Stats
  const activeProducts = products.filter(p => p.is_active).length;
  const activeShops = shops.filter(s => s.is_active).length;
  const totalOrders = orders.length;
  const totalRevenue = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);

  // Save product
  const saveProduct = async () => {
    if (!pForm.name) return;
    const row = {
      name: pForm.name, description: pForm.description || null,
      category: pForm.category, base_cost: pForm.baseCost, sell_price: pForm.sellPrice,
      image_url: pForm.imageUrl || null, supports_logo: pForm.supportsLogo,
      logo_placement_note: pForm.logoPlacementNote || null,
      fulfillment_days: pForm.fulfillmentDays, min_order_qty: pForm.minOrderQty,
    };
    if (editProduct) {
      await supabase.from("merch_products").update(row).eq("id", editProduct.id);
      setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...row } : p));
    } else {
      const { data } = await supabase.from("merch_products").insert(row).select().single();
      if (data) setProducts(prev => [...prev, data]);
    }
    // Save variants
    if (editProduct) {
      await supabase.from("merch_product_variants").delete().eq("product_id", editProduct.id);
    }
    const productId = editProduct?.id || products[products.length - 1]?.id;
    if (productId && pForm.variants.length > 0) {
      const varRows = pForm.variants.map((v, i) => ({ product_id: productId, label: v, sort_order: i }));
      const { data: newVars } = await supabase.from("merch_product_variants").insert(varRows).select();
      if (newVars) setVariants(prev => [...prev.filter(v => v.product_id !== productId), ...newVars]);
    }
    setProductModal(false);
    setEditProduct(null);
    setPForm(blankProduct);
  };

  const openEditProduct = (p) => {
    const pVars = variants.filter(v => v.product_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
    setPForm({
      name: p.name, description: p.description || "", category: p.category,
      baseCost: Number(p.base_cost), sellPrice: Number(p.sell_price),
      imageUrl: p.image_url || "", supportsLogo: p.supports_logo,
      logoPlacementNote: p.logo_placement_note || "",
      fulfillmentDays: p.fulfillment_days || 14, minOrderQty: p.min_order_qty || 1,
      variants: pVars.map(v => v.label),
    });
    setEditProduct(p);
    setProductModal(true);
  };

  const deleteProduct = async (id) => {
    if (!await dialog.confirm("Delete this product? This cannot be undone.")) return;
    await supabase.from("merch_products").delete().eq("id", id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  // Upload product image
  const uploadImage = async () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const row = await uploadMedia(f, { category: "merch_product" });
      if (row?.cdn_url) setPForm(prev => ({ ...prev, imageUrl: row.cdn_url }));
    };
    inp.click();
  };

  // Save shop
  const saveShop = async () => {
    if (!sForm.name || sForm.productIds.length === 0) return;
    const row = {
      name: sForm.name, client_id: sForm.clientId || null,
      product_ids: sForm.productIds,
      header_text: sForm.headerText || null, footer_text: sForm.footerText || null,
    };
    // Pull client logo from media_assets if available
    if (sForm.clientId) {
      const { data: logoAsset } = await supabase.from("media_assets").select("cdn_url")
        .eq("client_id", sForm.clientId).eq("category", "client_logo")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (logoAsset?.cdn_url) row.logo_url = logoAsset.cdn_url;
    }
    const { data } = await supabase.from("merch_shops").insert(row).select().single();
    if (data) {
      setShops(prev => [data, ...prev]);
      await dialog.alert(`Shop link created!\n\n${window.location.origin}/shop/${data.access_token}`);
    }
    setShopModal(false);
    setSForm({ name: "", clientId: "", productIds: [], headerText: "", footerText: "" });
  };

  const updateOrderStatus = async (orderId, status) => {
    const updates = { status };
    if (status === "shipped") updates.shipped_at = new Date().toISOString();
    if (status === "delivered") updates.delivered_at = new Date().toISOString();
    await supabase.from("merch_orders").update(updates).eq("id", orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
  };

  const addVariant = () => {
    if (!variantInput.trim()) return;
    setPForm(f => ({ ...f, variants: [...f.variants, variantInput.trim()] }));
    setVariantInput("");
  };

  const filteredProducts = products.filter(p => {
    if (sr && !p.name.toLowerCase().includes(sr.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading merch...</div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Merch" />
    <TabRow><TB tabs={["Catalog", "Shop Links", "Orders"]} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ CATALOG TAB ════════ */}
    {tab === "Catalog" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Active Products" value={activeProducts} color={Z.su} />
        <GlassStat label="Total Products" value={products.length} />
        <GlassStat label="Active Shops" value={activeShops} color={Z.ac} />
        <GlassStat label="Total Revenue" value={fmtCurrency(totalRevenue)} color={Z.su} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <SB value={sr} onChange={setSr} placeholder="Search products..." />
        <Btn sm onClick={() => { setPForm(blankProduct); setEditProduct(null); setProductModal(true); }}><Ic.plus size={12} /> New Product</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {filteredProducts.map(p => {
          const pVars = variants.filter(v => v.product_id === p.id);
          return <GlassCard key={p.id} onClick={() => openEditProduct(p)}>
            {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: Ri, marginBottom: 10 }} />}
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, marginBottom: 6 }}>
              {CATEGORIES.find(c => c.value === p.category)?.label || p.category}
              {p.supports_logo && " \u00b7 Logo ready"}
              {" \u00b7 "}{p.fulfillment_days}d fulfillment
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>${Number(p.sell_price).toLocaleString()}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Cost: ${Number(p.base_cost).toLocaleString()}</span>
            </div>
            {pVars.length > 0 && <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 4 }}>{pVars.length} variant{pVars.length !== 1 ? "s" : ""}: {pVars.map(v => v.label).join(", ")}</div>}
          </GlassCard>;
        })}
      </div>
    </>}

    {/* ════════ SHOP LINKS TAB ════════ */}
    {tab === "Shop Links" && <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn sm onClick={() => setShopModal(true)}><Ic.plus size={12} /> New Shop Link</Btn>
      </div>
      <DataTable>
        <thead><tr>
          {["Shop Name", "Client", "Products", "Created", "Link", "Status", ""].map(h => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {shops.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td }}>No shop links yet</td></tr>}
          {shops.map(s => (
            <tr key={s.id}>
              <td style={{ fontWeight: FW.bold, color: Z.tx }}>{s.name}</td>
              <td style={{ color: Z.tm }}>{s.client_id ? cn(s.client_id) : "Open"}</td>
              <td style={{ color: Z.tm }}>{(s.product_ids || []).length} items</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{fmtDate(s.created_at)}</td>
              <td><button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/shop/${s.access_token}`); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.xs, fontWeight: FW.bold, fontFamily: COND }}>Copy Link</button></td>
              <td><span style={{ fontSize: FS.xs, fontWeight: FW.bold, padding: "2px 8px", borderRadius: Ri, background: s.is_active ? (Z.su + "18") : Z.sa, color: s.is_active ? Z.su : Z.td }}>{s.is_active ? "Active" : "Inactive"}</span></td>
              <td><Btn sm v="ghost" onClick={async () => { await supabase.from("merch_shops").update({ is_active: !s.is_active }).eq("id", s.id); setShops(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x)); }}>{s.is_active ? "Deactivate" : "Activate"}</Btn></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>}

    {/* ════════ ORDERS TAB ════════ */}
    {tab === "Orders" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Total Orders" value={totalOrders} />
        <GlassStat label="Revenue" value={fmtCurrency(totalRevenue)} color={Z.su} />
        <GlassStat label="In Production" value={orders.filter(o => o.status === "in_production").length} color={Z.wa} />
        <GlassStat label="Shipped" value={orders.filter(o => o.status === "shipped").length} color={Z.ac} />
      </div>
      <DataTable>
        <thead><tr>
          {["Order", "Customer", "Items", "Total", "Status", "Date", ""].map(h =>
            <th key={h} style={{ textAlign: h === "Total" ? "right" : "left" }}>{h}</th>
          )}
        </tr></thead>
        <tbody>
          {orders.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td }}>No orders yet</td></tr>}
          {orders.map(o => {
            const items = orderItems.filter(i => i.order_id === o.id);
            const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
            return <tr key={o.id}>
              <td style={{ fontWeight: FW.bold, color: Z.ac, fontFamily: COND, fontSize: FS.sm }}>{o.id.slice(0, 8)}</td>
              <td>
                <div style={{ fontWeight: FW.semi, color: Z.tx }}>{o.customer_name || cn(o.client_id)}</div>
                {o.customer_email && <div style={{ fontSize: FS.xs, color: Z.tm }}>{o.customer_email}</div>}
              </td>
              <td style={{ color: Z.tm }}>{totalQty} item{totalQty !== 1 ? "s" : ""}</td>
              <td style={{ textAlign: "right", fontWeight: FW.bold, color: Z.su }}>{fmtCurrency(o.total)}</td>
              <td>
                <Sel value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)} options={ORDER_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} style={{ padding: "3px 24px 3px 6px" }} />
              </td>
              <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(o.created_at)}</td>
              <td>
                {o.tracking_number && <span style={{ fontSize: FS.xs, color: Z.ac, fontFamily: COND }}>#{o.tracking_number}</span>}
              </td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    </>}

    {/* ════════ PRODUCT MODAL ════════ */}
    <Modal open={productModal} onClose={() => { setProductModal(false); setEditProduct(null); }} title={editProduct ? "Edit Product" : "New Product"} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Product Name" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Branded Coffee Mug" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Category" value={pForm.category} onChange={e => setPForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES} />
          <Inp label="Fulfillment Days" type="number" value={pForm.fulfillmentDays} onChange={e => setPForm(f => ({ ...f, fulfillmentDays: Number(e.target.value) }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Cost ($)" type="number" step="0.01" value={pForm.baseCost} onChange={e => setPForm(f => ({ ...f, baseCost: Number(e.target.value) }))} />
          <Inp label="Sell Price ($)" type="number" step="0.01" value={pForm.sellPrice} onChange={e => setPForm(f => ({ ...f, sellPrice: Number(e.target.value) }))} />
          <Inp label="Min Qty" type="number" value={pForm.minOrderQty} onChange={e => setPForm(f => ({ ...f, minOrderQty: Number(e.target.value) }))} />
        </div>
        <TA label="Description" value={pForm.description} onChange={e => setPForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Product description shown to customers..." />

        {/* Image */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.td, marginBottom: 4 }}>Product Image</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pForm.imageUrl && <img src={pForm.imageUrl} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: Ri }} />}
            <Btn sm v="secondary" onClick={uploadImage}>Upload Image</Btn>
            {pForm.imageUrl && <Btn sm v="ghost" onClick={() => setPForm(f => ({ ...f, imageUrl: "" }))}>Remove</Btn>}
          </div>
        </div>

        {/* Logo support */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={pForm.supportsLogo} onChange={e => setPForm(f => ({ ...f, supportsLogo: e.target.checked }))} />
          <span style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>Supports client logo placement</span>
        </label>
        {pForm.supportsLogo && <Inp label="Logo Placement Note" value={pForm.logoPlacementNote} onChange={e => setPForm(f => ({ ...f, logoPlacementNote: e.target.value }))} placeholder="e.g. Front center, 3 inch max" />}

        {/* Variants */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.td, marginBottom: 4 }}>Variants (Size, Color, etc.)</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <Inp value={variantInput} onChange={e => setVariantInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addVariant(); } }} placeholder="e.g. Large, Blue" />
            <Btn sm v="secondary" onClick={addVariant}>Add</Btn>
          </div>
          {pForm.variants.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {pForm.variants.map((v, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: Z.ac + "12", borderRadius: Ri, fontSize: FS.xs, color: Z.ac, fontFamily: COND }}>
                {v}
                <button onClick={() => setPForm(f => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 12, fontWeight: 700, padding: 0 }}>x</button>
              </span>
            ))}
          </div>}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          {editProduct && <Btn v="ghost" onClick={() => { deleteProduct(editProduct.id); setProductModal(false); setEditProduct(null); }} style={{ color: Z.da }}>Delete</Btn>}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <Btn v="secondary" onClick={() => { setProductModal(false); setEditProduct(null); }}>Cancel</Btn>
            <Btn onClick={saveProduct} disabled={!pForm.name}>{editProduct ? "Save Changes" : "Create Product"}</Btn>
          </div>
        </div>
      </div>
    </Modal>

    {/* ════════ SHOP LINK MODAL ════════ */}
    <Modal open={shopModal} onClose={() => setShopModal(false)} title="Create Shop Link" width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Shop Name" value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ACME Corp Holiday Merch" />
        <Sel label="Client (optional)" value={sForm.clientId} onChange={e => setSForm(f => ({ ...f, clientId: e.target.value }))} options={[{ value: "", label: "Open (no specific client)" }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
        <Inp label="Header Text (optional)" value={sForm.headerText} onChange={e => setSForm(f => ({ ...f, headerText: e.target.value }))} placeholder="Welcome message shown at top of shop" />

        {/* Product picker */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.td, marginBottom: 6 }}>Select Products ({sForm.productIds.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {products.filter(p => p.is_active).map(p => {
              const selected = sForm.productIds.includes(p.id);
              return <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: selected ? Z.ac + "12" : "transparent", borderRadius: Ri, cursor: "pointer" }}>
                <input type="checkbox" checked={selected} onChange={() => setSForm(f => ({ ...f, productIds: selected ? f.productIds.filter(id => id !== p.id) : [...f.productIds, p.id] }))} />
                <span style={{ fontSize: FS.sm, fontWeight: selected ? FW.bold : FW.normal, color: Z.tx, fontFamily: COND, flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>${Number(p.sell_price).toLocaleString()}</span>
              </label>;
            })}
          </div>
        </div>

        <Inp label="Footer Text (optional)" value={sForm.footerText} onChange={e => setSForm(f => ({ ...f, footerText: e.target.value }))} placeholder="e.g. Orders ship within 14 business days" />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setShopModal(false)}>Cancel</Btn>
          <Btn onClick={saveShop} disabled={!sForm.name || sForm.productIds.length === 0}>Create Shop Link</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default Merch;
