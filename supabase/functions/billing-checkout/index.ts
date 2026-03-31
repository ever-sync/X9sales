import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getBaseUrl, getStripeSecretKey, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type CheckoutPayload = {
  company_id: string;
  plan_code?: string;
};

function encodeForm(body: Record<string, string>) {
  return new URLSearchParams(body).toString();
}

function getPriceId(planCode: string) {
  const envKey = `STRIPE_PRICE_${planCode.toUpperCase()}`;
  return Deno.env.get(envKey) ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = getStripeSecretKey();
    if (!stripeKey) {
      return json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 500 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const payload = (await req.json()) as CheckoutPayload;
    const planCode = payload.plan_code ?? "enterprise_monthly";
    const priceId = getPriceId(planCode);

    if (!payload.company_id || !priceId) {
      return json({ error: "company_id and a configured Stripe price are required" }, { status: 400 });
    }

    const { service } = await requireOwnerAdmin(authHeader, payload.company_id);

    const { data: company, error: companyError } = await service
      .from("companies")
      .select("name")
      .eq("id", payload.company_id)
      .single();

    if (companyError) throw companyError;

    const { data: existingCustomer } = await service
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("company_id", payload.company_id)
      .maybeSingle();

    let stripeCustomerId = existingCustomer?.stripe_customer_id ?? "";

    if (!stripeCustomerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: encodeForm({
          name: company.name,
          "metadata[company_id]": payload.company_id,
        }),
      });

      const customerJson = await customerRes.json();
      if (!customerRes.ok) {
        throw new Error(customerJson.error?.message ?? "Unable to create Stripe customer");
      }

      stripeCustomerId = customerJson.id;

      await service.from("billing_customers").upsert({
        company_id: payload.company_id,
        stripe_customer_id: stripeCustomerId,
      });
    }

    const baseUrl = getBaseUrl();
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeForm({
        mode: "subscription",
        customer: stripeCustomerId,
        client_reference_id: payload.company_id,
        success_url: `${baseUrl}/settings?tab=billing&checkout=success`,
        cancel_url: `${baseUrl}/settings?tab=billing&checkout=cancelled`,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "metadata[company_id]": payload.company_id,
        "metadata[plan_code]": planCode,
        "subscription_data[metadata][company_id]": payload.company_id,
        "subscription_data[metadata][plan_code]": planCode,
      }),
    });

    const sessionJson = await sessionRes.json();
    if (!sessionRes.ok) {
      throw new Error(sessionJson.error?.message ?? "Unable to create Stripe checkout session");
    }

    return json({ success: true, url: sessionJson.url });
  } catch (error) {
    console.error("[billing-checkout] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
