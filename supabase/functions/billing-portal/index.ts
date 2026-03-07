import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getBaseUrl, getServiceClient, getStripeSecretKey, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type PortalPayload = {
  company_id: string;
};

function encodeForm(body: Record<string, string>) {
  return new URLSearchParams(body).toString();
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
    const payload = (await req.json()) as PortalPayload;
    if (!payload.company_id) {
      return json({ error: "company_id is required" }, { status: 400 });
    }

    const { service } = await requireOwnerAdmin(authHeader, payload.company_id);
    const { data: customer, error: customerError } = await service
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("company_id", payload.company_id)
      .single();

    if (customerError || !customer) {
      return json({ error: "Stripe customer not found for this company" }, { status: 404 });
    }

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeForm({
        customer: customer.stripe_customer_id,
        return_url: `${getBaseUrl()}/settings?tab=billing`,
      }),
    });

    const portalJson = await portalRes.json();
    if (!portalRes.ok) {
      throw new Error(portalJson.error?.message ?? "Unable to create Stripe billing portal session");
    }

    return json({ success: true, url: portalJson.url });
  } catch (error) {
    console.error("[billing-portal] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
