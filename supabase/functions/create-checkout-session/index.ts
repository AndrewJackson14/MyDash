import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      stripe_price_id,
      tier_id,
      tier_name,
      tier_type,
      interval,
      site_id,
      site_name,
      site_domain,
      customer_email,
      customer_name,
      customer_phone,
      address,
    } = body;

    if (!stripe_price_id || !customer_email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode = interval === "one_time" ? "payment" : "subscription";
    const successUrl = `https://${site_domain}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `https://${site_domain}/subscribe`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      customer_email,
      line_items: [{ price: stripe_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tier_id,
        tier_name,
        tier_type,
        interval,
        site_id,
        site_name,
        customer_name: customer_name || "",
        customer_phone: customer_phone || "",
        address_line1: address?.line1 || "",
        address_line2: address?.line2 || "",
        city: address?.city || "",
        state: address?.state || "",
        zip: address?.zip || "",
      },
    };

    // Collect shipping address for print tiers via Stripe
    if (tier_type === "print" || tier_type === "print_digital") {
      sessionParams.shipping_address_collection = {
        allowed_countries: ["US"],
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
