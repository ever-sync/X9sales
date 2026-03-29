import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      db: { schema: 'app' }
    }
  );
}

export function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      db: { schema: 'app' },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );
}

export async function requireUser(authHeader: string) {
  const userClient = getUserClient(authHeader);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }
  return { userClient, user: data.user };
}

export async function requireOwnerAdmin(authHeader: string, companyId: string) {
  const { user } = await requireUser(authHeader);
  const service = getServiceClient();
  const { data, error } = await service
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.role !== "owner_admin") {
    throw new Error("Forbidden");
  }

  return { service, user };
}

export function getBaseUrl() {
  return Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
}

export function getResendApiKey() {
  return Deno.env.get("RESEND_API_KEY") ?? "";
}

export function getStripeSecretKey() {
  return Deno.env.get("STRIPE_SECRET_KEY") ?? "";
}

export function getStripeWebhookSecret() {
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
}

export function getUazapiConfig() {
  return {
    baseUrl: Deno.env.get("UAZAPI_BASE_URL") ?? "",
    instance: Deno.env.get("UAZAPI_INSTANCE") ?? "",
    token: Deno.env.get("UAZAPI_TOKEN") ?? "",
    managerPhone: Deno.env.get("WHATSAPP_NOTIFY_PHONE") ?? "",
  };
}
