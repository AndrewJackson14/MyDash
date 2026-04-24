// Edge function: generate-delivery-report
//
// Phase 7 of the Digital Ad Workflow. Invoked by pg_cron (see migration 077)
// every 15 minutes. Scans delivery_report_schedules where next_run_at <=
// now() AND is_active, generates a report row per schedule, and advances
// next_run_at by the cadence.
//
// V1 scope (intentional): builds an HTML snapshot stored on the row, no
// PDF and no email. Reps view reports inline in the ClientProfile Reports
// tab and can copy the link to a contact manually. PDF + auto-email land
// in a follow-up phase once the puppeteer/Gmail-from-cron pieces are wired.
//
// Can also be invoked manually with { schedule_id: "<uuid>" } to run a
// single schedule on demand (useful for testing + a future "Send Now"
// button on the Reports tab).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    "Vary": "Origin",
  };
}

// Cron fires this with the service_role JWT (Vault-stored, see migration
// 089). The "Send Now" button on the Reports tab fires it with the user's
// authenticated JWT. Anonymous callers are rejected — previously open meant
// anyone could trigger arbitrary schedule_id runs and slam the worker.
function authedRole(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.role);
  } catch { return null; }
}

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ── Cadence math ─────────────────────────────────────────────────
// Return the [period_start, period_end] window the report covers, given
// the run-at moment and the cadence. Weekly = previous Mon-Sun; monthly
// = first-of-month through last-day; end_of_flight = entire flight; annual
// = previous 12 months ending at run_at.
function periodFor(cadence: string, runAt: Date, flightStart: string | null, flightEnd: string | null) {
  if (cadence === "end_of_flight") {
    return { start: flightStart, end: flightEnd };
  }
  if (cadence === "weekly") {
    // Previous Mon-Sun. dayOfWeek: 0=Sun, 1=Mon, ... 6=Sat.
    const d = new Date(runAt);
    const dow = d.getUTCDay();
    const sundayOffset = dow === 0 ? 7 : dow; // distance back to last Sun
    const sunday = new Date(d); sunday.setUTCDate(d.getUTCDate() - sundayOffset);
    const monday = new Date(sunday); monday.setUTCDate(sunday.getUTCDate() - 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
  }
  if (cadence === "monthly") {
    // Previous month, first to last day.
    const first = new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), 0));
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
  }
  if (cadence === "annual") {
    // Trailing 12 months ending at runAt.
    const end = new Date(runAt);
    const start = new Date(runAt); start.setUTCFullYear(start.getUTCFullYear() - 1);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  return { start: null, end: null };
}

function nextRunAfter(cadence: string, base: Date, flightEnd: string | null): Date | null {
  const next = new Date(base);
  if (cadence === "weekly") { next.setUTCDate(next.getUTCDate() + 7); return next; }
  if (cadence === "monthly") { next.setUTCMonth(next.getUTCMonth() + 1); return next; }
  if (cadence === "annual") { next.setUTCFullYear(next.getUTCFullYear() + 1); return next; }
  if (cadence === "end_of_flight") {
    // One-shot: deactivate after firing once.
    return null;
  }
  return null;
}

// ── Aggregation ──────────────────────────────────────────────────
async function aggregatePlacements(admin: any, saleId: string, periodStart: string | null, periodEnd: string | null) {
  let query = admin.from("ad_placements").select("id, impressions, clicks, start_date, end_date").eq("sale_id", saleId);
  if (periodStart && periodEnd) {
    // Placement overlaps the window when start <= end_window AND end >= start_window.
    query = query.lte("start_date", periodEnd).gte("end_date", periodStart);
  }
  const { data: placements } = await query;
  const list = placements || [];
  const impressions = list.reduce((s: number, p: any) => s + (Number(p.impressions) || 0), 0);
  const clicks = list.reduce((s: number, p: any) => s + (Number(p.clicks) || 0), 0);
  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
  return { placement_ids: list.map((p: any) => p.id), impressions, clicks, ctr };
}

async function spendBilled(admin: any, saleId: string) {
  const { data } = await admin.from("invoice_lines").select("total").eq("sale_id", saleId);
  return (data || []).reduce((s: number, l: any) => s + (Number(l.total) || 0), 0);
}

// ── HTML snapshot ────────────────────────────────────────────────
function renderHtml(opts: {
  clientName: string;
  saleLabel: string;
  cadenceLabel: string;
  periodLabel: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spendBilled: number;
  flightProgressPct: number | null;
  placements: number;
}): string {
  const moneyFmt = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numFmt = (n: number) => (Number(n) || 0).toLocaleString();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Delivery Report — ${opts.clientName}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a202c; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #718096; font-size: 13px; margin-bottom: 24px; }
  .metrics { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
  .metric { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
  .metric .label { font-size: 11px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px; font-weight: 700; }
  .metric .value { font-size: 22px; font-weight: 800; color: #1a202c; margin-top: 4px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; }
  .row:last-child { border-bottom: none; }
  .label { color: #4a5568; }
  .value { font-weight: 600; }
  .footer { font-size: 11px; color: #a0aec0; margin-top: 32px; text-align: center; }
</style></head><body>
<h1>${opts.clientName}</h1>
<div class="sub">${opts.saleLabel} · ${opts.cadenceLabel} report</div>
<div class="sub"><strong>Period:</strong> ${opts.periodLabel}</div>

<div class="metrics">
  <div class="metric"><div class="label">Impressions</div><div class="value">${numFmt(opts.impressions)}</div></div>
  <div class="metric"><div class="label">Clicks</div><div class="value">${numFmt(opts.clicks)}</div></div>
  <div class="metric"><div class="label">CTR</div><div class="value">${opts.ctr.toFixed(2)}%</div></div>
  <div class="metric"><div class="label">Placements</div><div class="value">${opts.placements}</div></div>
</div>

<div class="row"><span class="label">Spend Billed</span><span class="value">${moneyFmt(opts.spendBilled)}</span></div>
${opts.flightProgressPct !== null ? `<div class="row"><span class="label">Flight Progress</span><span class="value">${opts.flightProgressPct.toFixed(1)}%</span></div>` : ""}

<div class="footer">Generated ${new Date().toLocaleString()} · 13 Stars Media Group</div>
</body></html>`;
}

// ── Process one schedule ─────────────────────────────────────────
async function processSchedule(admin: any, schedule: any) {
  const { data: sale } = await admin.from("sales").select("*").eq("id", schedule.sale_id).single();
  if (!sale) {
    return { error: "Sale not found", schedule_id: schedule.id };
  }
  const { data: client } = await admin.from("clients").select("name").eq("id", sale.client_id).single();
  const { data: pub } = sale.publication_id
    ? await admin.from("publications").select("name").eq("id", sale.publication_id).single()
    : { data: null };

  const runAt = new Date();
  const { start: periodStart, end: periodEnd } = periodFor(schedule.cadence, runAt, sale.flight_start_date, sale.flight_end_date);
  const agg = await aggregatePlacements(admin, schedule.sale_id, periodStart, periodEnd);
  const spend = await spendBilled(admin, schedule.sale_id);

  // Flight progress %: how much of the contracted term has elapsed at run time.
  let flightProgressPct: number | null = null;
  if (sale.flight_start_date && sale.flight_end_date) {
    const total = new Date(sale.flight_end_date).getTime() - new Date(sale.flight_start_date).getTime();
    const elapsed = runAt.getTime() - new Date(sale.flight_start_date).getTime();
    if (total > 0) flightProgressPct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  }

  const cadenceLabel = { weekly: "Weekly", monthly: "Monthly", end_of_flight: "End-of-flight", annual: "Annual" }[schedule.cadence as string] || schedule.cadence;
  const periodLabel = periodStart && periodEnd ? `${periodStart} → ${periodEnd}` : "Full flight";
  const saleLabel = pub?.name || "Digital Campaign";

  const html = renderHtml({
    clientName: client?.name || "Client",
    saleLabel,
    cadenceLabel,
    periodLabel,
    impressions: agg.impressions,
    clicks: agg.clicks,
    ctr: agg.ctr,
    spendBilled: spend,
    flightProgressPct,
    placements: agg.placement_ids.length,
  });

  // Insert the report row.
  const reportRow: Record<string, unknown> = {
    sale_id: schedule.sale_id,
    client_id: sale.client_id,
    contact_id: schedule.contact_id,
    cadence: schedule.cadence,
    period_start: periodStart || sale.flight_start_date || new Date().toISOString().slice(0, 10),
    period_end: periodEnd || sale.flight_end_date || new Date().toISOString().slice(0, 10),
    impressions: agg.impressions,
    clicks: agg.clicks,
    ctr: agg.ctr,
    placements_covered: agg.placement_ids,
    flight_progress_pct: flightProgressPct,
    spend_billed: spend,
    status: "sent",       // V1: no email send, treat as posted-to-profile only
    html_snapshot: html,
  };
  const { data: report, error: reportErr } = await admin.from("delivery_reports").insert(reportRow).select().single();
  if (reportErr) {
    return { error: reportErr.message, schedule_id: schedule.id };
  }

  // Advance next_run_at OR deactivate if end_of_flight / past flight end.
  const next = nextRunAfter(schedule.cadence, runAt, sale.flight_end_date);
  const updates: Record<string, unknown> = { updated_at: runAt.toISOString() };
  if (next === null || (sale.flight_end_date && next > new Date(sale.flight_end_date))) {
    updates.is_active = false;
  } else {
    updates.next_run_at = next.toISOString();
  }
  await admin.from("delivery_report_schedules").update(updates).eq("id", schedule.id);

  return { report_id: report.id, schedule_id: schedule.id, impressions: agg.impressions, clicks: agg.clicks };
}

// ── Handler ──────────────────────────────────────────────────────
serve(async (req: Request) => {
  const corsHeaders = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (!authedRole(req.headers.get("Authorization") || "")) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = getAdmin();
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const explicitId = body.schedule_id as string | undefined;

    let schedules: any[] = [];
    if (explicitId) {
      const { data } = await admin.from("delivery_report_schedules").select("*").eq("id", explicitId);
      schedules = data || [];
    } else {
      const { data } = await admin.from("delivery_report_schedules").select("*")
        .eq("is_active", true).lte("next_run_at", new Date().toISOString());
      schedules = data || [];
    }

    const results = [];
    for (const s of schedules) {
      try {
        results.push(await processSchedule(admin, s));
      } catch (err) {
        results.push({ error: (err as Error).message, schedule_id: s.id });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
