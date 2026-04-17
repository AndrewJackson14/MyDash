// ============================================================
// MerchShop.jsx — Public merch shop page
// No auth required — accessed via /shop/:access_token
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
};

export default function MerchShop() {
  const token = window.location.pathname.split("/shop/")[1];

  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState({}); // { productId: { variantId: qty } } or { productId: { _default: qty } }
  const [step, setStep] = useState("browse"); // browse | checkout | confirmed
  const [submitting, setSubmitting] = useState(false);

  // Customer info
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" });

  useEffect(() => {
    if (!token) { setError("Invalid shop link."); setLoading(false); return; }
    (async () => {
      const { data: shopData, error: shopErr } = await supabase
        .from("merch_shops").select("*")
        .eq("access_token", token).eq("is_active", true).maybeSingle();
      if (shopErr || !shopData) {
        setError("This shop link is invalid, inactive, or has expired.");
        setLoading(false); return;
      }
      if (shopData.expires_at && new Date(shopData.expires_at) < new Date()) {
        setError("This shop link has expired.");
        setLoading(false); return;
      }
      setShop(shopData);

      // Load products + variants
      const productIds = shopData.product_ids || [];
      if (productIds.length === 0) {
        setError("No products available in this shop.");
        setLoading(false); return;
      }
      const [prodRes, varRes] = await Promise.all([
        supabase.from("merch_products").select("*").in("id", productIds).eq("is_active", true),
        supabase.from("merch_product_variants").select("*").in("product_id", productIds).eq("is_available", true).order("sort_order"),
      ]);
      setProducts(prodRes.data || []);
      setVariants(varRes.data || []);
      setLoading(false);
    })();
  }, [token]);

  // Cart helpers
  const addToCart = (productId, variantId) => {
    const key = variantId || "_default";
    setCart(prev => {
      const product = prev[productId] || {};
      return { ...prev, [productId]: { ...product, [key]: (product[key] || 0) + 1 } };
    });
  };

  const removeFromCart = (productId, variantId) => {
    const key = variantId || "_default";
    setCart(prev => {
      const product = { ...(prev[productId] || {}) };
      if (product[key] > 1) product[key]--;
      else delete product[key];
      if (Object.keys(product).length === 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: product };
    });
  };

  const getQty = (productId, variantId) => {
    const key = variantId || "_default";
    return cart[productId]?.[key] || 0;
  };

  // Cart totals
  const cartItems = useMemo(() => {
    const items = [];
    for (const [productId, variantMap] of Object.entries(cart)) {
      const product = products.find(p => p.id === productId);
      if (!product) continue;
      for (const [variantKey, qty] of Object.entries(variantMap)) {
        if (qty <= 0) continue;
        const variant = variantKey !== "_default" ? variants.find(v => v.id === variantKey) : null;
        const price = variant?.price_override != null ? Number(variant.price_override) : Number(product.sell_price);
        items.push({
          productId, variantId: variant?.id || null,
          name: product.name, variantLabel: variant?.label || null,
          qty, price, total: price * qty,
          logoUrl: product.supports_logo && shop?.logo_url ? shop.logo_url : null,
          fulfillmentDays: product.fulfillment_days || 14,
        });
      }
    }
    return items;
  }, [cart, products, variants, shop]);

  const subtotal = cartItems.reduce((s, i) => s + i.total, 0);
  const maxFulfillment = cartItems.length > 0 ? Math.max(...cartItems.map(i => i.fulfillmentDays)) : 0;
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  // Submit order
  const submitOrder = async () => {
    if (!customer.name || !customer.email || cartItems.length === 0) return;
    setSubmitting(true);

    // Create Stripe Checkout session
    const checkoutRes = await fetch(EDGE_FN_URL + "/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "payment",
        line_items: cartItems.map(i => ({
          price_data: {
            currency: "usd",
            unit_amount: Math.round(i.price * 100),
            product_data: { name: i.name + (i.variantLabel ? ` (${i.variantLabel})` : "") },
          },
          quantity: i.qty,
        })),
        success_url: window.location.href + "?success=1",
        cancel_url: window.location.href,
        customer_email: customer.email,
        metadata: { shop_id: shop.id, customer_name: customer.name },
      }),
    });
    const checkoutData = await checkoutRes.json();

    if (checkoutData.url) {
      // Save order before redirecting to Stripe
      const estShip = new Date();
      estShip.setDate(estShip.getDate() + maxFulfillment);

      const { data: order } = await supabase.from("merch_orders").insert({
        shop_id: shop.id, client_id: shop.client_id || null,
        customer_name: customer.name, customer_email: customer.email,
        customer_phone: customer.phone || null,
        shipping_address: customer.address || null, shipping_city: customer.city || null,
        shipping_state: customer.state || null, shipping_zip: customer.zip || null,
        status: "paid", subtotal, total: subtotal,
        stripe_session_id: checkoutData.id || null,
        estimated_ship_date: estShip.toISOString().slice(0, 10),
      }).select().single();

      if (order) {
        const itemRows = cartItems.map(i => ({
          order_id: order.id, product_id: i.productId,
          variant_id: i.variantId, product_name: i.name,
          variant_label: i.variantLabel, quantity: i.qty,
          unit_price: i.price, line_total: i.total,
          logo_url: i.logoUrl,
        }));
        await supabase.from("merch_order_items").insert(itemRows);
      }

      window.location.href = checkoutData.url;
    } else {
      setSubmitting(false);
      alert("Payment setup failed. Please try again.");
    }
  };

  // Check for success return from Stripe
  useEffect(() => {
    if (window.location.search.includes("success=1")) setStep("confirmed");
  }, []);

  // Styles
  const pageStyle = { minHeight: "100vh", background: C.bg, fontFamily: "'Source Sans 3', 'DM Sans', sans-serif" };
  const containerStyle = { maxWidth: 900, margin: "0 auto", padding: "40px 24px" };
  const cardStyle = { background: C.sf, borderRadius: 12, border: `1px solid ${C.bd}`, overflow: "hidden" };
  const btnStyle = (primary) => ({
    padding: "12px 28px", fontSize: 15, fontWeight: 700,
    background: primary ? C.ac : "transparent", color: primary ? "#fff" : C.tm,
    border: primary ? "none" : `1px solid ${C.bd}`, borderRadius: 999,
    cursor: "pointer", transition: "all 0.15s",
  });
  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1px solid ${C.bd}`, background: C.bg, color: C.tx,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  if (loading) return <div style={pageStyle}><div style={{ ...containerStyle, textAlign: "center" }}><p style={{ color: C.td }}>Loading shop...</p></div></div>;
  if (error) return <div style={pageStyle}><div style={{ ...containerStyle, textAlign: "center" }}><h2 style={{ color: C.da }}>Shop Unavailable</h2><p style={{ color: C.tm }}>{error}</p></div></div>;

  if (step === "confirmed") return (
    <div style={pageStyle}><div style={{ ...containerStyle, textAlign: "center" }}>
      <div style={{ ...cardStyle, padding: 40 }}>
        <h2 style={{ color: C.go, margin: "0 0 12px" }}>Order Confirmed</h2>
        <p style={{ color: C.tx, fontSize: 16 }}>Thank you for your order! You will receive a confirmation email shortly.</p>
        <p style={{ color: C.tm, fontSize: 14, marginTop: 16 }}>Estimated fulfillment: {maxFulfillment || 14} business days.</p>
      </div>
    </div></div>
  );

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {shop.logo_url && <img src={shop.logo_url} alt="" style={{ height: 60, marginBottom: 12, objectFit: "contain" }} />}
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.tx, margin: "0 0 6px" }}>{shop.name}</h1>
          {shop.header_text && <p style={{ color: C.tm, fontSize: 15 }}>{shop.header_text}</p>}
        </div>

        {step === "browse" && <>
          {/* Product grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 32 }}>
            {products.map(p => {
              const pVars = variants.filter(v => v.product_id === p.id);
              const hasVars = pVars.length > 0;
              return (
                <div key={p.id} style={cardStyle}>
                  {p.image_url && (
                    <div style={{ position: "relative" }}>
                      <img src={p.image_url} alt={p.name} style={{ width: "100%", height: 200, objectFit: "cover" }} />
                      {p.supports_logo && shop?.logo_url && (
                        <img src={shop.logo_url} alt="Your logo" style={{ position: "absolute", bottom: 8, right: 8, height: 32, opacity: 0.8, background: "rgba(255,255,255,0.9)", borderRadius: 4, padding: 2 }} />
                      )}
                    </div>
                  )}
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: C.tx, margin: "0 0 4px" }}>{p.name}</h3>
                    {p.description && <p style={{ fontSize: 13, color: C.tm, margin: "0 0 10px", lineHeight: 1.4 }}>{p.description}</p>}
                    <div style={{ fontSize: 13, color: C.td, marginBottom: 10 }}>{p.fulfillment_days} day fulfillment{p.min_order_qty > 1 ? ` \u00b7 Min ${p.min_order_qty}` : ""}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasVars ? 10 : 0 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: C.tx }}>${Number(p.sell_price).toLocaleString()}</span>
                      {!hasVars && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {getQty(p.id) > 0 && <>
                            <button onClick={() => removeFromCart(p.id)} style={{ width: 28, height: 28, borderRadius: 999, border: `1px solid ${C.bd}`, background: C.bg, cursor: "pointer", fontSize: 16, color: C.tx }}>-</button>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.tx, minWidth: 20, textAlign: "center" }}>{getQty(p.id)}</span>
                          </>}
                          <button onClick={() => addToCart(p.id)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: C.ac, cursor: "pointer", fontSize: 16, color: "#fff" }}>+</button>
                        </div>
                      )}
                    </div>
                    {/* Variants */}
                    {hasVars && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {pVars.map(v => (
                          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                            <span style={{ fontSize: 13, color: C.tx }}>{v.label}{v.price_override != null ? ` — $${Number(v.price_override).toLocaleString()}` : ""}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {getQty(p.id, v.id) > 0 && <>
                                <button onClick={() => removeFromCart(p.id, v.id)} style={{ width: 24, height: 24, borderRadius: 999, border: `1px solid ${C.bd}`, background: C.bg, cursor: "pointer", fontSize: 14, color: C.tx }}>-</button>
                                <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, minWidth: 16, textAlign: "center" }}>{getQty(p.id, v.id)}</span>
                              </>}
                              <button onClick={() => addToCart(p.id, v.id)} style={{ width: 24, height: 24, borderRadius: 999, border: "none", background: C.ac, cursor: "pointer", fontSize: 14, color: "#fff" }}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart summary bar */}
          {totalQty > 0 && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.sf, borderTop: `1px solid ${C.bd}`, padding: "16px 24px", display: "flex", justifyContent: "center", gap: 16, alignItems: "center", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
              <span style={{ fontSize: 15, color: C.tm }}>{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>${subtotal.toLocaleString()}</span>
              <button onClick={() => setStep("checkout")} style={btnStyle(true)}>Checkout</button>
            </div>
          )}
        </>}

        {step === "checkout" && (
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <div style={{ ...cardStyle, padding: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.tx, margin: "0 0 16px" }}>Checkout</h2>

              {/* Order summary */}
              <div style={{ marginBottom: 20 }}>
                {cartItems.map((i, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: idx < cartItems.length - 1 ? `1px solid ${C.bd}` : "none" }}>
                    <span style={{ color: C.tx, fontSize: 14 }}>{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""} x{i.qty}</span>
                    <span style={{ fontWeight: 700, color: C.tx }}>${i.total.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>${subtotal.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: C.td, marginTop: 4 }}>Estimated fulfillment: {maxFulfillment} business days</div>
              </div>

              {/* Customer form */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} placeholder="Full Name *" style={inputStyle} />
                <input type="email" value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="Email *" style={inputStyle} />
                <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} placeholder="Phone (optional)" style={inputStyle} />
                <input value={customer.address} onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))} placeholder="Shipping Address" style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                  <input value={customer.city} onChange={e => setCustomer(c => ({ ...c, city: e.target.value }))} placeholder="City" style={inputStyle} />
                  <input value={customer.state} onChange={e => setCustomer(c => ({ ...c, state: e.target.value }))} placeholder="State" style={inputStyle} />
                  <input value={customer.zip} onChange={e => setCustomer(c => ({ ...c, zip: e.target.value }))} placeholder="ZIP" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => setStep("browse")} style={btnStyle(false)}>Back</button>
                <button onClick={submitOrder} disabled={submitting || !customer.name || !customer.email} style={{ ...btnStyle(true), flex: 1, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? "Processing..." : `Pay $${subtotal.toLocaleString()}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {shop.footer_text && <p style={{ textAlign: "center", color: C.td, fontSize: 13, marginTop: 32 }}>{shop.footer_text}</p>}
      </div>
    </div>
  );
}
