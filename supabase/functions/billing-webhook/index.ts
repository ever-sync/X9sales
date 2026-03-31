import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getServiceClient, getStripeWebhookSecret, json } from "../_shared/settings-runtime.ts";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
};

async function verifyStripeSignature(body: string, header: string, secret: string) {
  if (!header) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, ...rest] = part.split("=");
    const value = rest.join("=").trim();
    if (!value) continue;

    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value.toLowerCase());
  }

  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 5 * 60) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
  return signatures.includes(hex);
}

function resolveCompanyId(object: Record<string, any>) {
  return object.metadata?.company_id ?? object.customer_details?.metadata?.company_id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";
    const webhookSecret = getStripeWebhookSecret();

    if (webhookSecret) {
      const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return json({ error: "Invalid Stripe signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as StripeEvent;
    const object = event.data.object;
    const service = getServiceClient();

    if (event.type.startsWith("customer.subscription.")) {
      const companyId = resolveCompanyId(object);
      if (!companyId) {
        console.warn("[billing-webhook] subscription event without company_id metadata", event.id);
        return json({ success: true, skipped: true });
      }

      await service.from("billing_subscriptions").upsert({
        company_id: companyId,
        stripe_subscription_id: object.id,
        plan_code: object.items?.data?.[0]?.price?.lookup_key ?? object.items?.data?.[0]?.price?.id ?? "enterprise_monthly",
        plan_name: object.items?.data?.[0]?.price?.nickname ?? "Enterprise",
        status: object.status,
        billing_cycle: object.items?.data?.[0]?.price?.recurring?.interval ?? "month",
        amount_cents: object.items?.data?.[0]?.price?.unit_amount ?? 0,
        currency: object.currency ?? "brl",
        included_seats: object.metadata?.included_seats ? Number(object.metadata.included_seats) : null,
        used_seats: object.metadata?.used_seats ? Number(object.metadata.used_seats) : null,
        current_period_start: object.current_period_start ? new Date(object.current_period_start * 1000).toISOString() : null,
        current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: !!object.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "stripe_subscription_id",
      });
    }

    if (event.type === "invoice.created" || event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
      let companyId = resolveCompanyId(object);

      if (!companyId && object.customer) {
        const { data: billingCustomer } = await service
          .from("billing_customers")
          .select("company_id")
          .eq("stripe_customer_id", object.customer)
          .maybeSingle();
        companyId = billingCustomer?.company_id ?? null;
      }

      if (!companyId) {
        console.warn("[billing-webhook] invoice event without company mapping", event.id);
        return json({ success: true, skipped: true });
      }

      await service.from("billing_invoices").upsert({
        company_id: companyId,
        stripe_invoice_id: object.id,
        stripe_subscription_id: object.subscription ?? null,
        status: object.status ?? "open",
        amount_due_cents: object.amount_due ?? 0,
        currency: object.currency ?? "brl",
        due_date: object.due_date ? new Date(object.due_date * 1000).toISOString() : null,
        hosted_invoice_url: object.hosted_invoice_url ?? null,
        invoice_pdf: object.invoice_pdf ?? null,
      }, {
        onConflict: "stripe_invoice_id",
      });
    }

    return json({ success: true });
  } catch (error) {
    console.error("[billing-webhook] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
