import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media").split(",");
function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    "Vary": "Origin",
  };
}

// Hardened (audit 2026-04-23): require service_role JWT. pg_cron
// invokes via cron_invoke_edge_function with the service-role key
// from Vault; admin manual triggers can use the same key. Blocks the
// previous open path that let any browser fan reminder emails out
// from the team's stored Gmail tokens.
function isServiceRole(authHeader: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    return payload?.role === "service_role";
  } catch { return false; }
}

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Get valid Gmail access token for a user
async function getGmailToken(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.from("google_tokens").select("*").eq("user_id", userId).single();
  if (!data?.access_token) return null;

  const expiry = new Date(data.token_expiry);
  if (expiry.getTime() - Date.now() > 300_000) return data.access_token;

  if (!data.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: data.refresh_token, grant_type: "refresh_token",
    }),
  });
  const refreshData = await res.json();
  if (!refreshData.access_token) return null;

  await admin.from("google_tokens").update({
    access_token: refreshData.access_token,
    token_expiry: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
  }).eq("user_id", userId);

  return refreshData.access_token;
}

// Send email via Gmail
async function sendEmail(token: string, to: string, subject: string, htmlBody: string): Promise<boolean> {
  const raw = btoa(
    `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody}`
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  return res.ok;
}

serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!isServiceRole(req.headers.get("Authorization") || "")) {
    return new Response(JSON.stringify({ error: "service_role only" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const admin = getAdmin();
  const { task } = await req.json().catch(() => ({ task: "all" }));
  const results: any = {};
  const today = new Date().toISOString().slice(0, 10);

  // ═══ TASK 1: OVERDUE INVOICE REMINDERS ═══
  if (task === "all" || task === "invoice_reminders") {
    try {
      const { data: invoices } = await admin.from("invoices").select("*, clients(name, contacts:client_contacts(email))").in("status", ["sent", "overdue"]);
      let sent = 0;

      for (const inv of (invoices || [])) {
        if (!inv.due_date) continue;
        const daysOverdue = Math.round((Date.now() - new Date(inv.due_date + "T12:00:00").getTime()) / 86400000);
        if (daysOverdue < 7) continue;

        // Determine reminder level
        let level: string | null = null;
        if (daysOverdue >= 30 && !inv.final_reminder_sent) level = "final";
        else if (daysOverdue >= 14 && !inv.second_reminder_sent) level = "second";
        else if (daysOverdue >= 7 && !inv.first_reminder_sent) level = "first";
        if (!level) continue;

        // Get billing user's Gmail token
        const { data: billingUser } = await admin.from("team_members").select("auth_id").eq("email", "billing@13stars.media").single();
        if (!billingUser?.auth_id) {
          // Fallback: use any admin
          const { data: admins } = await admin.from("team_members").select("auth_id").not("auth_id", "is", null).limit(1);
          if (!admins?.length) continue;
        }

        const authId = billingUser?.auth_id;
        if (!authId) continue;
        const token = await getGmailToken(admin, authId);
        if (!token) continue;

        const clientEmail = inv.clients?.contacts?.[0]?.email;
        if (!clientEmail) continue;

        const clientName = inv.clients?.name || "";
        const reminderText: Record<string, string> = {
          first: "This is a friendly reminder that your invoice is past due.",
          second: "This is a second notice regarding your outstanding balance.",
          final: "FINAL NOTICE: Immediate payment is required.",
        };

        // Simple email body
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="border-top:4px solid ${level === "final" ? "#C53030" : "#D97706"};padding:24px">
            <h2 style="color:#1A365D">13 Stars Media Group</h2>
            <p style="color:${level === "final" ? "#C53030" : "#333"};font-weight:bold">${reminderText[level]}</p>
            <p>Invoice: <strong>${inv.invoice_number}</strong><br>Amount Due: <strong>$${(inv.balance_due || inv.total || 0).toLocaleString()}</strong><br>Due Date: <strong>${inv.due_date}</strong></p>
            <p style="color:#666;font-size:12px">Please contact billing@13stars.media with any questions.</p>
          </div>
        </div>`;

        const success = await sendEmail(token, clientEmail, `${level === "final" ? "FINAL NOTICE" : "Payment Reminder"}: Invoice ${inv.invoice_number}`, html);
        if (success) {
          const update: any = { [`${level}_reminder_sent`]: true, [`${level}_reminder_at`]: new Date().toISOString() };
          if (inv.status !== "overdue") update.status = "overdue";
          await admin.from("invoices").update(update).eq("id", inv.id);
          sent++;
        }
      }
      results.invoice_reminders = { sent };
    } catch (err) {
      results.invoice_reminders = { error: (err as Error).message };
    }
  }

  // ═══ TASK 2: RENEWAL NOTICES ═══
  if (task === "all" || task === "renewal_notices") {
    try {
      // Find subscribers expiring in 30, 14, or 7 days
      const { data: subs } = await admin.from("subscribers").select("*")
        .eq("status", "active").not("email", "is", null)
        .gte("renewal_date", today);

      let sent = 0;
      for (const sub of (subs || [])) {
        if (!sub.renewal_date || !sub.email) continue;
        const daysToExpiry = Math.round((new Date(sub.renewal_date + "T12:00:00").getTime() - Date.now()) / 86400000);

        let touch: string | null = null;
        if (daysToExpiry <= 7 && daysToExpiry >= 5 && !sub.third_notice_sent) touch = "third";
        else if (daysToExpiry <= 14 && daysToExpiry >= 12 && !sub.second_notice_sent) touch = "second";
        else if (daysToExpiry <= 30 && daysToExpiry >= 28 && !sub.first_notice_sent) touch = "first";
        if (!touch) continue;

        // Get publication info
        const { data: pub } = await admin.from("publications").select("name, domain").eq("id", sub.publication_id).single();
        const pubName = pub?.name || "your publication";
        const renewLink = pub?.domain ? `https://${pub.domain}/subscribe` : "";

        const toneMap: Record<string, string> = {
          first: `Your ${pubName} subscription expires on ${sub.renewal_date}. Renew today to keep receiving your favorite local news.`,
          second: `Reminder: Your ${pubName} subscription expires soon. Don't miss out on the stories that matter most.`,
          third: `Final notice: Your ${pubName} subscription expires this week. Act now to continue home delivery.`,
        };

        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="border-top:4px solid #1A365D;padding:24px;text-align:center">
            <h2 style="color:#1A365D;font-family:Georgia,serif">${pubName}</h2>
            <p style="color:#333">${toneMap[touch]}</p>
            ${renewLink ? `<a href="${renewLink}" style="display:inline-block;padding:12px 36px;background:#1A365D;color:#fff;text-decoration:none;font-weight:bold;margin:16px 0">Renew Now</a>` : ""}
            <p style="color:#999;font-size:12px">Or call (805) 237-6060 · subscriptions@13stars.media</p>
          </div>
        </div>`;

        // Use any admin's Gmail
        const { data: admins } = await admin.from("team_members").select("auth_id").not("auth_id", "is", null).limit(1);
        const token = admins?.[0]?.auth_id ? await getGmailToken(admin, admins[0].auth_id) : null;
        if (!token) continue;

        const success = await sendEmail(token, sub.email, `Your ${pubName} subscription ${touch === "third" ? "expires this week" : "is coming up for renewal"}`, html);
        if (success) {
          await admin.from("subscribers").update({ [`${touch}_notice_sent`]: true }).eq("id", sub.id);
          sent++;
        }
      }
      results.renewal_notices = { sent };
    } catch (err) {
      results.renewal_notices = { error: (err as Error).message };
    }
  }

  // ═══ TASK 3: CLIENT ASSET CLEANUP (30-day auto-delete for project-specific assets) ═══
  if (task === "all" || task === "asset_cleanup") {
    const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
    const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
    const BUNNY_BASE = `https://ny.storage.bunnycdn.com/${STORAGE_ZONE}`;

    try {
      // Find completed ad projects older than 30 days that have a client_assets_path
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: projects } = await admin.from("ad_projects")
        .select("id, client_assets_path, status, updated_at")
        .in("status", ["approved", "signed_off", "placed"])
        .not("client_assets_path", "is", null)
        .lt("updated_at", cutoff);

      let cleaned = 0;
      for (const proj of (projects || [])) {
        if (!proj.client_assets_path) continue;
        const assetsPath = proj.client_assets_path;

        // List files in the project-specific asset folder
        const listRes = await fetch(`${BUNNY_BASE}/${assetsPath}/`, {
          method: "GET",
          headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
        });
        if (!listRes.ok) continue;

        const files = await listRes.json();
        if (!Array.isArray(files) || files.length === 0) continue;

        // Delete each file in the folder
        for (const file of files) {
          if (file.IsDirectory) continue;
          await fetch(`${BUNNY_BASE}/${assetsPath}/${file.ObjectName}`, {
            method: "DELETE",
            headers: { AccessKey: BUNNY_API_KEY },
          });
        }

        // Clear the path reference on the project
        await admin.from("ad_projects").update({ client_assets_path: null }).eq("id", proj.id);
        cleaned++;
      }
      results.asset_cleanup = { cleaned };
    } catch (err) {
      results.asset_cleanup = { error: (err as Error).message };
    }
  }

  // ═══ TASK 4: SCHEDULED STORY PUBLISH ═══
  // Stories with scheduled_at <= now that haven't been published yet
  if (task === "all" || task === "scheduled_publish") {
    try {
      const now = new Date().toISOString();
      const { data: scheduled } = await admin.from("stories")
        .select("id, title, publication_id, scheduled_at")
        .eq("sent_to_web", false)
        .eq("web_approved", true)
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", now);

      let published = 0;
      for (const story of (scheduled || [])) {
        const updates: any = {
          sent_to_web: true,
          status: "Ready",
          published_at: now,
          updated_at: now,
        };
        // Set first_published_at only if not already set
        const { data: existing } = await admin.from("stories")
          .select("first_published_at").eq("id", story.id).single();
        if (!existing?.first_published_at) {
          updates.first_published_at = now;
        }

        const { error } = await admin.from("stories").update(updates).eq("id", story.id);
        if (!error) {
          await admin.from("notifications").insert({
            title: `Scheduled publish: "${story.title}" is now live`,
            type: "system",
            link: "/editorial",
          });
          published++;
        }
      }
      results.scheduled_publish = { published };
    } catch (err) {
      results.scheduled_publish = { error: (err as Error).message };
    }
  }

  // ═══ TASK 5: ISSUE STATUS REFRESH ═══
  // Persist computed issue health (On Track / At Risk / Behind Goal / Overdue)
  // so other modules can query it without recomputing every render.
  if (task === "all" || task === "issue_status") {
    try {
      const { data: openIssues } = await admin.from("issues")
        .select("id, pub_id, date, ad_deadline, ed_deadline, revenue_goal, sent_to_press_at, status")
        .is("sent_to_press_at", null)
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

      let updated = 0;
      for (const iss of (openIssues || [])) {
        // Compute ad revenue vs goal
        const { data: issSales } = await admin.from("sales")
          .select("amount").eq("issue_id", iss.id).eq("status", "Closed");
        const soldRev = (issSales || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
        const revPct = iss.revenue_goal > 0 ? (soldRev / iss.revenue_goal) * 100 : 100;

        // Compute editorial fill
        const { count: storyCount } = await admin.from("stories")
          .select("id", { count: "exact", head: true })
          .eq("print_issue_id", iss.id);

        const adOverdue = iss.ad_deadline && iss.ad_deadline < today;
        const edOverdue = iss.ed_deadline && iss.ed_deadline < today;
        const pubOverdue = iss.date && iss.date < today;
        const daysToAd = iss.ad_deadline ? Math.ceil((new Date(iss.ad_deadline + "T12:00:00").getTime() - Date.now()) / 86400000) : 99;

        let newStatus = "On Track";
        if (pubOverdue) newStatus = "Overdue";
        else if (adOverdue && revPct < 100) newStatus = "At Risk";
        else if (edOverdue && (storyCount || 0) < 3) newStatus = "At Risk";
        else if (daysToAd >= 0 && daysToAd <= 3 && revPct < 75) newStatus = "Behind Goal";

        if (iss.status !== newStatus) {
          await admin.from("issues").update({ status: newStatus }).eq("id", iss.id);
          // Alert on transition to At Risk or Overdue
          if ((newStatus === "At Risk" || newStatus === "Overdue") && iss.status !== "At Risk" && iss.status !== "Overdue") {
            await admin.from("notifications").insert({
              title: `Issue alert: ${iss.pub_id} ${iss.date} is now ${newStatus}`,
              type: "system", link: "/publications",
            });
          }
          updated++;
        }
      }
      results.issue_status = { updated };
    } catch (err) {
      results.issue_status = { error: (err as Error).message };
    }
  }

  // ═══ TASK 6: AUTO-CHARGE PAYMENT PLANS ═══
  // Charges monthly payment plan clients on their charge_day (1st or 15th)
  // Payment applies to oldest open invoices via apply_payment_to_invoices()
  if (task === "all" || task === "auto_charge") {
    try {
      const todayDay = new Date().getDate();
      const { data: dueContracts } = await admin.from("contracts")
        .select("id, client_id, monthly_amount, charge_day")
        .eq("payment_terms", "monthly").eq("status", "active")
        .not("monthly_amount", "is", null);

      let charged = 0, failed = 0, skipped = 0;

      for (const con of (dueContracts || [])) {
        if (todayDay !== (con.charge_day || 1)) { skipped++; continue; }
        if (!con.monthly_amount || con.monthly_amount <= 0) continue;

        const { data: cl } = await admin.from("clients")
          .select("id, stripe_customer_id, stripe_payment_method_id, name")
          .eq("id", con.client_id).single();

        if (!cl?.stripe_customer_id || !cl?.stripe_payment_method_id) {
          await admin.from("notifications").insert({ title: `Auto-charge skipped: ${cl?.name || "?"} — no card on file`, type: "system", link: "/billing" });
          failed++; continue;
        }

        // Charge via Stripe
        const chargeRes = await fetch(`${SUPABASE_URL}/functions/v1/stripe-card`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ action: "charge_invoice", invoice_id: null, client_id: con.client_id, amount: con.monthly_amount }),
        });
        const cd = await chargeRes.json();

        if (cd.success) {
          // Apply payment to oldest open invoices, carry credit
          await admin.rpc("apply_payment_to_invoices", {
            p_client_id: con.client_id, p_amount: con.monthly_amount,
            p_method: "card", p_reference: `Auto-charge ${today}`,
          });
          charged++;
        } else {
          await admin.from("notifications").insert({ title: `Auto-charge failed: ${cl.name} $${con.monthly_amount}`, type: "system", link: "/billing" });
          failed++;
        }
      }
      results.auto_charge = { charged, failed, skipped };
    } catch (err) { results.auto_charge = { error: (err as Error).message }; }
  }

  return new Response(
    JSON.stringify({ success: true, timestamp: new Date().toISOString(), results }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
