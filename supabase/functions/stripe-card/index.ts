import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const admin = getAdmin();

    // ─── CREATE SETUP INTENT ───
    // Called from sign page to get a client_secret for Stripe Elements
    if (action === "create_setup_intent") {
      const { client_id, client_name, client_email } = body;
      if (!client_id) throw new Error("client_id required");

      // Check if client already has a Stripe customer
      const { data: client } = await admin.from("clients").select("stripe_customer_id").eq("id", client_id).single();

      let customerId = client?.stripe_customer_id;

      if (!customerId) {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          name: client_name || undefined,
          email: client_email || undefined,
          metadata: { mydash_client_id: client_id },
        });
        customerId = customer.id;

        // Save to DB
        await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client_id);
      }

      // Create SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        metadata: { mydash_client_id: client_id },
      });

      return new Response(
        JSON.stringify({ client_secret: setupIntent.client_secret, customer_id: customerId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CONFIRM CARD SAVED ───
    // Called after Stripe Elements confirms the SetupIntent
    if (action === "confirm_card") {
      const { client_id, setup_intent_id } = body;
      if (!client_id || !setup_intent_id) throw new Error("client_id and setup_intent_id required");

      // Retrieve the SetupIntent to get the payment method
      const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
      const paymentMethodId = setupIntent.payment_method as string;

      if (!paymentMethodId) throw new Error("No payment method found on SetupIntent");

      // Get card details
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const card = pm.card;

      // Set as default payment method on customer
      if (setupIntent.customer) {
        await stripe.customers.update(setupIntent.customer as string, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }

      // Save card info to DB
      await admin.from("clients").update({
        stripe_payment_method_id: paymentMethodId,
        card_last4: card?.last4 || null,
        card_brand: card?.brand || null,
        card_exp: card ? `${card.exp_month}/${card.exp_year}` : null,
      }).eq("id", client_id);

      return new Response(
        JSON.stringify({
          success: true,
          card: { last4: card?.last4, brand: card?.brand, exp: `${card?.exp_month}/${card?.exp_year}` },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHARGE INVOICE ───
    // Charges a saved card for a specific invoice
    if (action === "charge_invoice") {
      const { invoice_id } = body;
      if (!invoice_id) throw new Error("invoice_id required");

      const { data: invoice } = await admin.from("invoices").select("*").eq("id", invoice_id).single();
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "paid") throw new Error("Invoice already paid");

      const { data: client } = await admin.from("clients").select("stripe_customer_id, stripe_payment_method_id, name").eq("id", invoice.client_id).single();
      if (!client?.stripe_customer_id || !client?.stripe_payment_method_id) {
        throw new Error("No card on file for this client");
      }

      const amount = Math.round(Number(invoice.balance_due || invoice.total) * 100);
      if (amount <= 0) throw new Error("Invalid amount");

      // Create PaymentIntent and charge
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        customer: client.stripe_customer_id,
        payment_method: client.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Invoice ${invoice.invoice_number} — ${client.name || ""}`,
        metadata: {
          invoice_id, invoice_number: invoice.invoice_number,
          client_id: invoice.client_id,
        },
      });

      if (paymentIntent.status === "succeeded") {
        // Mark invoice as paid
        await admin.from("invoices").update({
          status: "paid",
          balance_due: 0,
          stripe_payment_intent_id: paymentIntent.id,
          last_charge_attempt: new Date().toISOString(),
          charge_error: null,
        }).eq("id", invoice_id);

        // Record payment
        await admin.from("payments").insert({
          invoice_id,
          amount: Number(invoice.balance_due || invoice.total),
          payment_date: new Date().toISOString().slice(0, 10),
          method: "card",
          reference: `Stripe ${paymentIntent.id}`,
        });

        return new Response(
          JSON.stringify({ success: true, status: "paid", payment_intent_id: paymentIntent.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Payment requires action or failed
        await admin.from("invoices").update({
          auto_charge_attempts: (invoice.auto_charge_attempts || 0) + 1,
          last_charge_attempt: new Date().toISOString(),
          charge_error: `Payment status: ${paymentIntent.status}`,
        }).eq("id", invoice_id);

        return new Response(
          JSON.stringify({ success: false, status: paymentIntent.status, error: "Payment not completed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── UPDATE CARD ───
    // For client portal card management
    if (action === "update_card") {
      const { client_id } = body;
      if (!client_id) throw new Error("client_id required");

      const { data: client } = await admin.from("clients").select("stripe_customer_id").eq("id", client_id).single();
      if (!client?.stripe_customer_id) throw new Error("No Stripe customer found");

      const setupIntent = await stripe.setupIntents.create({
        customer: client.stripe_customer_id,
        payment_method_types: ["card"],
        metadata: { mydash_client_id: client_id },
      });

      return new Response(
        JSON.stringify({ client_secret: setupIntent.client_secret }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Unknown action: " + action);
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
