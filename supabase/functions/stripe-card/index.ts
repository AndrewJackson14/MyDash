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

    // ─── CREATE CHARGE INTENT ───
    // Mobile in-the-moment charge: rep is in the field, sale just
    // closed, customer hands over their card. Creates a PaymentIntent
    // for an arbitrary amount with optional setup_future_usage so the
    // card gets saved to the client for one-tap renewals later.
    //
    // Body: { client_id, amount_cents, description, save_card?, sale_id?, opportunity_id? }
    // Returns: { client_secret, customer_id, intent_id }
    if (action === "create_charge_intent") {
      const { client_id, amount_cents, description, save_card, sale_id, opportunity_id } = body;
      if (!client_id) throw new Error("client_id required");
      if (!amount_cents || amount_cents < 50) throw new Error("amount_cents must be at least 50 (Stripe minimum)");

      const { data: client } = await admin.from("clients").select("name, billing_email, contacts, stripe_customer_id").eq("id", client_id).single();
      if (!client) throw new Error("client not found");

      // Reuse or create Stripe customer.
      let customerId = client.stripe_customer_id;
      if (!customerId) {
        const primaryContact = (client.contacts || [])[0];
        const customer = await stripe.customers.create({
          name: client.name || undefined,
          email: client.billing_email || primaryContact?.email || undefined,
          metadata: { mydash_client_id: client_id },
        });
        customerId = customer.id;
        await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client_id);
      }

      const intent = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: "usd",
        customer: customerId,
        description: description || `MyDash mobile charge — ${client.name || ""}`,
        // setup_future_usage stores the payment_method on success; the
        // webhook handler picks it up + writes to clients.stripe_payment_method_id.
        // Without this flag the card is single-use.
        setup_future_usage: save_card ? "off_session" : undefined,
        // Always allow Apple Pay / Google Pay if available.
        automatic_payment_methods: { enabled: true },
        metadata: {
          mydash_client_id: client_id,
          source: "mobile_charge",
          ...(sale_id ? { sale_id } : {}),
          ...(opportunity_id ? { opportunity_id } : {}),
          save_card: save_card ? "true" : "false",
        },
      });

      return new Response(
        JSON.stringify({
          client_secret: intent.client_secret,
          customer_id: customerId,
          intent_id: intent.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── RECORD MOBILE CHARGE ───
    // Called by the mobile client AFTER stripe.confirmPayment resolves
    // with status=succeeded. Belt-and-suspenders to the webhook: the
    // webhook is the source of truth, but this client-side ack ensures
    // a payments row + saved-card-on-client lands immediately so the
    // UI can reflect success without waiting for webhook propagation.
    //
    // Body: { client_id, intent_id, save_card }
    if (action === "record_mobile_charge") {
      const { client_id, intent_id } = body;
      if (!client_id || !intent_id) throw new Error("client_id and intent_id required");

      const intent = await stripe.paymentIntents.retrieve(intent_id);
      if (intent.status !== "succeeded") {
        return new Response(JSON.stringify({ success: false, status: intent.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const amount = (intent.amount || 0) / 100;

      // If the card was saved (setup_future_usage=off_session), pull
      // the payment method details and stamp them on the client.
      const pmId = (intent.payment_method as string) || null;
      if (pmId && intent.metadata?.save_card === "true") {
        try {
          const pm = await stripe.paymentMethods.retrieve(pmId);
          const card = pm.card;
          if (intent.customer) {
            await stripe.customers.update(intent.customer as string, {
              invoice_settings: { default_payment_method: pmId },
            });
          }
          await admin.from("clients").update({
            stripe_payment_method_id: pmId,
            card_last4: card?.last4 || null,
            card_brand: card?.brand || null,
            card_exp: card ? `${card.exp_month}/${card.exp_year}` : null,
          }).eq("id", client_id);
        } catch (_e) { /* card-detail save failed; webhook will retry */ }
      }

      // Insert a payments row marked "card" + Stripe ref. No invoice_id —
      // this is an ad-hoc mobile charge, not invoice-tied. The webhook
      // dedupes via stripe_payment_intent_id check.
      const { data: existing } = await admin.from("payments").select("id").eq("reference", `Stripe ${intent_id}`).maybeSingle();
      if (!existing) {
        await admin.from("payments").insert({
          client_id,
          amount,
          payment_date: new Date().toISOString().slice(0, 10),
          method: "card",
          reference: `Stripe ${intent_id}`,
          notes: intent.description || "Mobile charge",
        });
      }

      return new Response(
        JSON.stringify({ success: true, amount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Sync card details for all clients with stripe_customer_id
    if (action === "sync_cards") {
      const { data: clients } = await admin.from("clients")
        .select("id, name, stripe_customer_id")
        .not("stripe_customer_id", "is", null);

      let synced = 0;
      let noCard = 0;
      for (const cl of (clients || [])) {
        try {
          const pms = await stripe.paymentMethods.list({ customer: cl.stripe_customer_id, type: "card" });
          if (pms.data.length > 0) {
            const pm = pms.data[0];
            const card = pm.card;
            await admin.from("clients").update({
              stripe_payment_method_id: pm.id,
              card_last4: card?.last4 || null,
              card_brand: card?.brand || null,
              card_exp: card ? `${card.exp_month}/${card.exp_year}` : null,
            }).eq("id", cl.id);
            synced++;
          } else {
            noCard++;
          }
        } catch (e) { noCard++; }
      }
      return new Response(
        JSON.stringify({ success: true, synced, noCard, total: (clients || []).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List all Stripe customers (admin use only)
    if (action === "list_customers") {
      const customers = [];
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const params: any = { limit: 100 };
        if (startingAfter) params.starting_after = startingAfter;
        const batch = await stripe.customers.list(params);
        customers.push(...batch.data);
        hasMore = batch.has_more;
        if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
      }
      return new Response(
        JSON.stringify({ count: customers.length, customers: customers.map(c => ({
          id: c.id, name: c.name, email: c.email, metadata: c.metadata,
          default_source: c.default_source,
          invoice_settings: c.invoice_settings,
          created: c.created,
        })) }),
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
