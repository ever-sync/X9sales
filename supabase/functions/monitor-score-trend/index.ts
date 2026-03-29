import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  company_id?: string;
}

interface AnalysisRow {
  id: string;
  company_id: string;
  agent_id: string | null;
  conversation_id: string;
  quality_score: number | null;
  analyzed_at: string;
  agent?: {
    name: string | null;
  } | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const rawBody = await req.json().catch(() => ({}));
    const payload = (rawBody ?? {}) as RequestPayload;

    let query = supabase
      .schema("app")
      .from("ai_conversation_analysis")
      .select("id, company_id, agent_id, conversation_id, quality_score, analyzed_at, agent:agents(name)")
      .not("agent_id", "is", null)
      .order("agent_id", { ascending: true })
      .order("analyzed_at", { ascending: false });

    if (payload.company_id) {
      query = query.eq("company_id", payload.company_id);
    }

    const { data, error } = await query.limit(1000);
    if (error) throw error;

    const rows = (data ?? []) as AnalysisRow[];
    const grouped = new Map<string, AnalysisRow[]>();

    for (const row of rows) {
      if (!row.agent_id) continue;
      const bucket = grouped.get(row.agent_id) ?? [];
      if (bucket.length < 3) {
        bucket.push(row);
        grouped.set(row.agent_id, bucket);
      }
    }

    let alertsCreated = 0;
    const checkedAgents: string[] = [];

    for (const [agentId, analyses] of grouped.entries()) {
      checkedAgents.push(agentId);
      if (analyses.length < 3) continue;

      const isDowntrend = analyses.every((analysis) => (analysis.quality_score ?? 100) < 50);
      if (!isDowntrend) continue;

      const latest = analyses[0];

      const { data: existingAlert, error: existingError } = await supabase
        .schema("app")
        .from("alerts")
        .select("id")
        .eq("company_id", latest.company_id)
        .eq("agent_id", agentId)
        .eq("alert_type", "COACHING_NEEDED")
        .eq("status", "open")
        .contains("meta", { source: "monitor-score-trend" })
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") throw existingError;
      if (existingAlert) continue;

      const scoreTrail = analyses.map((analysis) => analysis.quality_score ?? null);
      const agentName = latest.agent?.name?.trim() || "Atendente";

      const { error: insertError } = await supabase
        .schema("app")
        .from("alerts")
        .insert({
          company_id: latest.company_id,
          alert_type: "COACHING_NEEDED",
          severity: "high",
          status: "open",
          title: `${agentName} entrou em queda de score`,
          description: `As ultimas 3 analises ficaram abaixo de 50 (${scoreTrail.join(", ")}). Recomenda-se coaching imediato.`,
          reference_type: "conversation",
          reference_id: latest.conversation_id,
          agent_id: agentId,
          meta: {
            source: "monitor-score-trend",
            score_trail: scoreTrail,
            analysis_ids: analyses.map((analysis) => analysis.id),
          },
        });

      if (insertError) throw insertError;
      alertsCreated += 1;
    }

    return json(200, {
      success: true,
      checked_agents: checkedAgents.length,
      alerts_created: alertsCreated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return json(500, { error: message });
  }
});
