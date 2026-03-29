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

interface SignalRow {
  id: string;
  company_id: string;
  conversation_id: string;
  agent_id: string | null;
  stage: string;
  loss_risk_level: "baixo" | "medio" | "alto";
  estimated_value: number | null;
  close_probability: number | null;
  next_best_action: string | null;
  generated_at: string;
  conversations: {
    id: string;
    status: string;
    started_at: string | null;
    updated_at: string;
    customers: {
      name: string | null;
      phone: string | null;
    } | null;
  } | null;
  agents: {
    name: string | null;
  } | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getHoursBetween(now: Date, isoValue: string | null | undefined): number {
  if (!isoValue) return 0;
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.max(0, (now.getTime() - parsed.getTime()) / 3600000);
}

function buildRisk(signal: SignalRow, now: Date) {
  const conversation = signal.conversations;
  const staleHours = getHoursBetween(now, conversation?.updated_at ?? signal.generated_at);
  const ageHours = getHoursBetween(now, conversation?.started_at ?? signal.generated_at);
  const scoreParts: Array<{ label: string; points: number }> = [];

  if (signal.loss_risk_level === "alto") scoreParts.push({ label: "loss_risk alto", points: 45 });
  else if (signal.loss_risk_level === "medio") scoreParts.push({ label: "loss_risk medio", points: 25 });

  if ((signal.close_probability ?? 0) >= 70) scoreParts.push({ label: "close_probability alto", points: 10 });
  if ((signal.estimated_value ?? 0) >= 10000) scoreParts.push({ label: "ticket alto", points: 15 });
  else if ((signal.estimated_value ?? 0) >= 5000) scoreParts.push({ label: "ticket medio-alto", points: 10 });

  if (conversation?.status === "waiting" && staleHours >= 48) scoreParts.push({ label: "waiting ha mais de 48h", points: 35 });
  else if (conversation?.status === "waiting" && staleHours >= 24) scoreParts.push({ label: "waiting ha mais de 24h", points: 25 });
  else if (staleHours >= 72) scoreParts.push({ label: "sem atualizacao ha mais de 72h", points: 20 });
  else if (staleHours >= 36) scoreParts.push({ label: "sem atualizacao ha mais de 36h", points: 10 });

  if (["proposta", "negociacao", "fechamento"].includes(signal.stage) && staleHours >= 24) {
    scoreParts.push({ label: `estagio ${signal.stage} parado`, points: 15 });
  }

  if (!signal.next_best_action || signal.next_best_action.trim().length === 0) {
    scoreParts.push({ label: "sem proxima acao definida", points: 10 });
  }

  if (ageHours >= 24 * 7) {
    scoreParts.push({ label: "conversa aberta ha mais de 7 dias", points: 10 });
  }

  const score = scoreParts.reduce((sum, item) => sum + item.points, 0);
  return {
    score,
    staleHours: Math.round(staleHours),
    ageHours: Math.round(ageHours),
    reasons: scoreParts,
  };
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
    const now = new Date();

    let query = supabase
      .schema("app")
      .from("deal_signals")
      .select(`
        id,
        company_id,
        conversation_id,
        agent_id,
        stage,
        loss_risk_level,
        estimated_value,
        close_probability,
        next_best_action,
        generated_at,
        conversations:conversations!inner(
          id,
          status,
          started_at,
          updated_at,
          customers(name, phone)
        ),
        agents(name)
      `)
      .in("loss_risk_level", ["medio", "alto"])
      .in("stage", ["qualificacao", "proposta", "negociacao", "fechamento", "follow_up"])
      .order("generated_at", { ascending: false })
      .limit(1000);

    if (payload.company_id) {
      query = query.eq("company_id", payload.company_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const signals = (data ?? []) as unknown as SignalRow[];
    let alertsCreated = 0;
    const evaluatedConversations: string[] = [];

    for (const signal of signals) {
      if (!signal.conversations) continue;
      if (signal.conversations.status === "closed" || signal.conversations.status === "snoozed") continue;

      const risk = buildRisk(signal, now);
      if (risk.score < 70) continue;

      evaluatedConversations.push(signal.conversation_id);

      const { data: existingAlert, error: existingError } = await supabase
        .schema("app")
        .from("alerts")
        .select("id")
        .eq("company_id", signal.company_id)
        .eq("reference_type", "conversation")
        .eq("reference_id", signal.conversation_id)
        .eq("alert_type", "PREDICTIVE_LOSS_RISK")
        .eq("status", "open")
        .contains("meta", { source: "monitor-loss-risk" })
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") throw existingError;
      if (existingAlert) continue;

      const customerName = signal.conversations.customers?.name?.trim()
        || signal.conversations.customers?.phone
        || "Cliente";
      const agentName = signal.agents?.name?.trim() || "Atendente";
      const severity = risk.score >= 90 ? "critical" : "high";

      const { error: insertError } = await supabase
        .schema("app")
        .from("alerts")
        .insert({
          company_id: signal.company_id,
          alert_type: "PREDICTIVE_LOSS_RISK",
          severity,
          status: "open",
          title: `Risco de perda em ${customerName}`,
          description: `${agentName} tem um deal em ${signal.stage} com score preditivo ${risk.score}. Principais fatores: ${risk.reasons.map((item) => item.label).join(", ")}.`,
          reference_type: "conversation",
          reference_id: signal.conversation_id,
          agent_id: signal.agent_id,
          meta: {
            source: "monitor-loss-risk",
            signal_id: signal.id,
            stage: signal.stage,
            loss_risk_level: signal.loss_risk_level,
            estimated_value: signal.estimated_value,
            close_probability: signal.close_probability,
            next_best_action: signal.next_best_action,
            stale_hours: risk.staleHours,
            age_hours: risk.ageHours,
            risk_score: risk.score,
            factors: risk.reasons,
          },
        });

      if (insertError) throw insertError;
      alertsCreated += 1;
    }

    return json(200, {
      success: true,
      evaluated_signals: signals.length,
      evaluated_conversations: evaluatedConversations.length,
      alerts_created: alertsCreated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return json(500, { error: message });
  }
});
