import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("QB_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOKEN_URL = "https://oauth2.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_BASE = "https://quickbooks.api.intuit.com/v3/company";
const MINOR_VERSION = "65";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Get valid access token, refreshing if expired
async function getAccessToken(): Promise<{ token: string; realmId: string }> {
  const admin = getAdmin();
  const { data, error } = await admin.from("quickbooks_tokens").select("*").limit(1).single();
  if (error || !data) throw new Error("QuickBooks not connected");

  const expiry = new Date(data.token_expiry);
  if (expiry.getTime() - Date.now() > 300_000) {
    return { token: data.access_token, realmId: data.realm_id };
  }

  // Refresh
  const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const refreshRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await refreshRes.json();
  if (!refreshRes.ok || !tokens.access_token) {
    await admin.from("quickbooks_tokens").delete().eq("realm_id", data.realm_id);
    throw new Error("QuickBooks token refresh failed — please reconnect");
  }

  const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await admin.from("quickbooks_tokens").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || data.refresh_token,
    token_expiry: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq("realm_id", data.realm_id);

  return { token: tokens.access_token, realmId: data.realm_id };
}

// Make QB API request
async function qbFetch(token: string, realmId: string, path: string, options: RequestInit = {}) {
  const url = `${QB_BASE}/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const intuitTid = res.headers.get("intuit_tid");
  const body = await res.json();

  if (!res.ok) {
    const errMsg = body.Fault?.Error?.[0]?.Detail || body.Fault?.Error?.[0]?.Message || `QB API error: ${res.status}`;
    console.error("QB API error:", errMsg, "intuit_tid:", intuitTid);
    throw new Error(errMsg);
  }

  return body;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const action = req.headers.get("x-action") || "";

  try {
    const { token, realmId } = await getAccessToken();

    // ── CREATE INVOICE ───────────────────────────────────────
    if (action === "create-invoice") {
      const body = await req.json();
      // body = { CustomerRef, Line[], DueDate, etc. } — QB Invoice format
      const data = await qbFetch(token, realmId, "/invoice", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── CREATE PAYMENT ───────────────────────────────────────
    if (action === "create-payment") {
      const body = await req.json();
      // body = { CustomerRef, TotalAmt, Line[{ Amount, LinkedTxn[{ TxnId, TxnType:"Invoice" }] }] }
      const data = await qbFetch(token, realmId, "/payment", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FIND OR CREATE CUSTOMER ──────────────────────────────
    if (action === "find-customer") {
      const body = await req.json();
      const name = body.name || "";
      // Search by DisplayName
      const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`);
      const data = await qbFetch(token, realmId, `/query?query=${query}`);
      const customers = data.QueryResponse?.Customer || [];
      return new Response(JSON.stringify({ customers }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-customer") {
      const body = await req.json();
      // body = { DisplayName, PrimaryEmailAddr: { Address }, PrimaryPhone: { FreeFormNumber }, ... }
      const data = await qbFetch(token, realmId, "/customer", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── QUERY (generic read) ─────────────────────────────────
    if (action === "query") {
      const body = await req.json();
      const query = encodeURIComponent(body.query || "");
      const data = await qbFetch(token, realmId, `/query?query=${query}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET COMPANY INFO ─────────────────────────────────────
    if (action === "company-info") {
      const data = await qbFetch(token, realmId, `/companyinfo/${realmId}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const status = err.message?.includes("not connected") || err.message?.includes("reconnect") ? 403 : 500;
    return new Response(JSON.stringify({ error: err.message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
