import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IngestPayload {
  company_id: string;
  provider: string;
  provider_message_id: string;
  conversation_external_id?: string;
  channel: string;
  direction: string;
  sender_type?: string;
  agent_external_id?: string;
  customer_external_id?: string;
  message_timestamp?: string;
  raw_payload?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate webhook secret if configured
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (webhookSecret) {
      const providedSecret = req.headers.get("x-webhook-secret");
      if (providedSecret !== webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Invalid webhook secret" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const payload: IngestPayload = await req.json();

    // Validate required fields
    if (!payload.company_id || !payload.provider || !payload.provider_message_id || !payload.channel || !payload.direction) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["company_id", "provider", "provider_message_id", "channel", "direction"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the ingest function (handles idempotency)
    const { data, error } = await supabase.rpc("ingest_message", {
      p_company_id: payload.company_id,
      p_provider: payload.provider,
      p_provider_message_id: payload.provider_message_id,
      p_conversation_external_id: payload.conversation_external_id ?? null,
      p_channel: payload.channel,
      p_direction: payload.direction,
      p_sender_type: payload.sender_type ?? null,
      p_agent_external_id: payload.agent_external_id ?? null,
      p_customer_external_id: payload.customer_external_id ?? null,
      p_message_timestamp: payload.message_timestamp ?? new Date().toISOString(),
      p_raw_payload: payload.raw_payload ?? {},
    });

    if (error) {
      console.error("Ingest error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: data,
        deduplicated: data === null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
