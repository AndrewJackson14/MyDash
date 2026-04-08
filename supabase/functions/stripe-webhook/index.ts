import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};

    try {
      // Resolve address: prefer shipping (Stripe-collected), fall back to metadata
      const shipping = session.shipping_details?.address;
      const addr = {
        line1: shipping?.line1 || meta.address_line1 || "",
        line2: shipping?.line2 || meta.address_line2 || "",
        city: shipping?.city || meta.city || "",
        state: shipping?.state || meta.state || "",
        zip: shipping?.postal_code || meta.zip || "",
      };

      // Determine subscriber type from tier
      let subscriberType: "print" | "digital" = "digital";
      if (meta.tier_type === "print" || meta.tier_type === "print_digital") {
        subscriberType = "print";
      }

      // Parse name
      const nameParts = (meta.customer_name || session.customer_details?.name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Create subscriber
      const { data: subscriber, error: subError } = await supabase
        .from("subscribers")
        .insert({
          type: subscriberType,
          status: "active",
          first_name: firstName,
          last_name: lastName,
          email: session.customer_details?.email || meta.customer_email || "",
          phone: meta.customer_phone || "",
          address_line1: addr.line1,
          address_line2: addr.line2,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          publication_id: meta.site_id || null,
          start_date: new Date().toISOString().slice(0, 10),
          amount_paid: (session.amount_total || 0) / 100,
          payment_method: "stripe",
          stripe_customer_id: session.customer as string || "",
          notes: `Auto-created via ${meta.site_name || "StellarPress"} — ${meta.tier_name || "subscription"}`,
        })
        .select()
        .single();

      if (subError) {
        console.error("Error creating subscriber:", subError);
        return new Response("Subscriber creation failed", { status: 500 });
      }

      // Create subscription record
      const tierInterval = meta.interval || "year";
      const startDate = new Date();
      let endDate: Date | null = null;
      if (tierInterval === "month") {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (tierInterval === "year") {
        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      const { error: subscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          subscriber_id: subscriber.id,
          publication_id: meta.site_id || null,
          tier: meta.tier_id || "unknown",
          status: "active",
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate ? endDate.toISOString().slice(0, 10) : null,
          auto_renew: session.mode === "subscription",
          stripe_subscription_id: session.subscription as string || "",
          amount_paid: (session.amount_total || 0) / 100,
          payment_method: "stripe",
          price_description: meta.tier_name || "",
        });

      if (subscriptionError) {
        console.error("Error creating subscription:", subscriptionError);
      }

      console.log(`Subscriber created: ${subscriber.id} for ${meta.tier_name}`);
    } catch (err) {
      console.error("Webhook processing error:", err);
      return new Response("Processing error", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
