// ============================================================
// ses-webhook — SNS endpoint for SES bounce / complaint /
// delivery notifications. Three SNS message types are handled:
//
//   SubscriptionConfirmation — auto-confirm by GETting the
//     SubscribeURL. Required on first wiring of the topic.
//   Notification             — parse the SES JSON payload and
//     update the matching email_sends row (by ses_message_id)
//     plus bump subscriber bounce/complaint counters.
//   UnsubscribeConfirmation — log and drop.
//
// Wire-up (one-time, AWS side):
//   1. Create an SNS topic per SES identity.
//   2. Subscribe this function's public URL to that topic
//      (HTTPS protocol).
//   3. On the SES identity's Notifications tab, point Bounce +
//      Complaint + Delivery to the SNS topic.
//   4. Hit this endpoint once — SNS will send a
//      SubscriptionConfirmation which the handler auto-confirms.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let envelope: any;
  try { envelope = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const type = envelope.Type || req.headers.get("x-amz-sns-message-type");

  // 1. Auto-confirm SNS subscriptions so the first wiring "just works".
  if (type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
    try { await fetch(envelope.SubscribeURL); }
    catch (e) { console.error("SubscribeURL fetch failed:", e); }
    return new Response("confirmed");
  }

  if (type === "UnsubscribeConfirmation") {
    return new Response("noted");
  }

  // 2. Normal delivery notification.
  if (type !== "Notification") return new Response("ignored");

  // SNS wraps the SES payload in Message (a JSON string).
  let msg: any;
  try { msg = typeof envelope.Message === "string" ? JSON.parse(envelope.Message) : envelope.Message; }
  catch { return new Response("Bad SES payload", { status: 400 }); }

  const mail = msg?.mail || {};
  const sesMessageId = mail.messageId;
  if (!sesMessageId) return new Response("No messageId");

  // Locate our per-recipient send row
  const { data: sendRow } = await admin.from("email_sends")
    .select("id, subscriber_id")
    .eq("ses_message_id", sesMessageId).single();

  const now = new Date().toISOString();

  switch (msg.notificationType || msg.eventType) {
    case "Delivery": {
      if (sendRow) await admin.from("email_sends").update({
        status: "delivered", delivered_at: now,
      }).eq("id", sendRow.id);
      break;
    }
    case "Bounce": {
      const bounce = msg.bounce || {};
      const bounceType = `${bounce.bounceType || ""}/${bounce.bounceSubType || ""}`.replace(/^\/|\/$/g, "");
      if (sendRow) await admin.from("email_sends").update({
        status: "bounced", bounce_type: bounceType,
      }).eq("id", sendRow.id);
      // Hard bounces → suppress the subscriber so we don't keep mailing.
      if (sendRow?.subscriber_id && bounce.bounceType === "Permanent") {
        await admin.rpc("noop").catch(() => {});
        const { data: s } = await admin.from("newsletter_subscribers").select("bounce_count").eq("id", sendRow.subscriber_id).single();
        await admin.from("newsletter_subscribers").update({
          bounce_count: (s?.bounce_count || 0) + 1,
          status: "bounced",
        }).eq("id", sendRow.subscriber_id);
      }
      break;
    }
    case "Complaint": {
      if (sendRow) await admin.from("email_sends").update({
        status: "complained", complaint_type: msg.complaint?.complaintFeedbackType || null,
      }).eq("id", sendRow.id);
      // Any complaint → immediately unsubscribe; it's the law (CAN-SPAM).
      if (sendRow?.subscriber_id) {
        const { data: s } = await admin.from("newsletter_subscribers").select("complaint_count").eq("id", sendRow.subscriber_id).single();
        await admin.from("newsletter_subscribers").update({
          complaint_count: (s?.complaint_count || 0) + 1,
          status: "unsubscribed",
          unsubscribed_at: now,
        }).eq("id", sendRow.subscriber_id);
      }
      break;
    }
  }

  return new Response("ok");
});
