import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner_admin" | "manager" | "qa_reviewer" | "agent";

interface ReportRequestBody {
  company_id?: string;
  agent_id?: string | null;
  period_start?: string;
  period_end?: string;
}

interface MemberRow {
  role: Role;
}

interface RevenueOutcomeRow {
  outcome: "won" | "lost" | "open";
  value: number;
  loss_reason: string | null;
}

interface CoachingActionRow {
  accepted: boolean;
}

interface DealSignalRow {
  intent_level: "fria" | "morna" | "quente";
  loss_risk_level: "baixo" | "medio" | "alto";
  close_probability: number | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return null;
  const token = authorizationHeader.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function parseBody(value: unknown): ReportRequestBody {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;
  return {
    company_id: typeof body.company_id === "string" ? body.company_id.trim() : undefined,
    agent_id: typeof body.agent_id === "string"
      ? body.agent_id.trim()
      : body.agent_id === null
        ? null
        : undefined,
    period_start: typeof body.period_start === "string" ? body.period_start.trim() : undefined,
    period_end: typeof body.period_end === "string" ? body.period_end.trim() : undefined,
  };
}

function parseDate(value: string | undefined, field: string): string {
  if (!value) throw new Error(`Campo '${field}' obrigatorio.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Campo '${field}' deve estar no formato YYYY-MM-DD.`);
  }
  return value;
}

function validatePeriod(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Periodo invalido.");
  }
  if (end < start) {
    throw new Error("Data final nao pode ser menor que data inicial.");
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days > 365) {
    throw new Error("Periodo maximo permitido e de 365 dias.");
  }
}

async function getMemberRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<Role> {
  const { data: member, error } = await supabase
    .schema("app")
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao validar membership: ${error.message}`);
  }
  if (!member) {
    throw new Error("Voce nao e membro ativo desta empresa.");
  }

  return (member as MemberRow).role;
}

async function ensureAgentBelongsToCompany(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
): Promise<void> {
  const { data: agent, error } = await supabase
    .schema("app")
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao validar atendente: ${error.message}`);
  }
  if (!agent) {
    throw new Error("Atendente nao encontrado para esta empresa.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) return json(401, { error: "Missing Authorization bearer token." });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json(401, { error: "Invalid or expired token." });

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return json(400, { error: "Payload JSON invalido." });

    const body = parseBody(rawBody);
    if (!body.company_id) return json(400, { error: "Campo 'company_id' obrigatorio." });

    const periodStart = parseDate(body.period_start, "period_start");
    const periodEnd = parseDate(body.period_end, "period_end");
    validatePeriod(periodStart, periodEnd);

    const role = await getMemberRole(supabase, user.id, body.company_id);
    const allowedRoles: Role[] = ["owner_admin", "manager", "qa_reviewer"];
    if (!allowedRoles.includes(role)) {
      return json(403, { error: "Seu perfil nao pode gerar relatorio de ROI." });
    }

    const agentId = body.agent_id ?? null;
    if (agentId) {
      await ensureAgentBelongsToCompany(supabase, body.company_id, agentId);
    }

    const startAt = `${periodStart}T00:00:00.000Z`;
    const endDate = new Date(`${periodEnd}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const endAtExclusive = endDate.toISOString();

    let revenueQuery = supabase
      .schema("app")
      .from("revenue_outcomes")
      .select("outcome, value, loss_reason, created_at")
      .eq("company_id", body.company_id)
      .gte("created_at", startAt)
      .lt("created_at", endAtExclusive);

    if (agentId) {
      revenueQuery = revenueQuery.eq("agent_id", agentId);
    }

    const { data: revenueRowsRaw, error: revenueError } = await revenueQuery;
    if (revenueError) {
      return json(500, { error: `Falha ao carregar revenue_outcomes: ${revenueError.message}` });
    }

    let coachingQuery = supabase
      .schema("app")
      .from("coaching_actions")
      .select("accepted, created_at")
      .eq("company_id", body.company_id)
      .gte("created_at", startAt)
      .lt("created_at", endAtExclusive);

    if (agentId) {
      coachingQuery = coachingQuery.eq("agent_id", agentId);
    }

    const { data: coachingRowsRaw, error: coachingError } = await coachingQuery;
    if (coachingError) {
      return json(500, { error: `Falha ao carregar coaching_actions: ${coachingError.message}` });
    }

    let signalsQuery = supabase
      .schema("app")
      .from("deal_signals")
      .select("intent_level, loss_risk_level, close_probability, generated_at")
      .eq("company_id", body.company_id)
      .gte("generated_at", startAt)
      .lt("generated_at", endAtExclusive);

    if (agentId) {
      signalsQuery = signalsQuery.eq("agent_id", agentId);
    }

    const { data: signalRowsRaw, error: signalsError } = await signalsQuery;
    if (signalsError) {
      return json(500, { error: `Falha ao carregar deal_signals: ${signalsError.message}` });
    }

    const revenueRows = (revenueRowsRaw ?? []) as RevenueOutcomeRow[];
    const coachingRows = (coachingRowsRaw ?? []) as CoachingActionRow[];
    const signalRows = (signalRowsRaw ?? []) as DealSignalRow[];

    const wonRows = revenueRows.filter((row) => row.outcome === "won");
    const lostRows = revenueRows.filter((row) => row.outcome === "lost");
    const openRows = revenueRows.filter((row) => row.outcome === "open");

    const wonValue = wonRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    const lostValue = lostRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    const avgTicketWon = wonRows.length > 0 ? wonValue / wonRows.length : 0;
    const conversionRate = revenueRows.length > 0 ? (wonRows.length / revenueRows.length) * 100 : 0;

    const acceptedActions = coachingRows.filter((row) => row.accepted).length;
    const coachingAdoptionRate =
      coachingRows.length > 0 ? (acceptedActions / coachingRows.length) * 100 : 0;

    const highIntent = signalRows.filter((row) => row.intent_level === "quente").length;
    const mediumIntent = signalRows.filter((row) => row.intent_level === "morna").length;
    const highRisk = signalRows.filter((row) => row.loss_risk_level === "alto").length;
    const avgCloseProbability = signalRows.length > 0
      ? signalRows.reduce((sum, row) => sum + Number(row.close_probability ?? 0), 0) / signalRows.length
      : 0;

    const topLossReasons = Object.entries(
      lostRows.reduce<Record<string, number>>((acc, row) => {
        const key = row.loss_reason?.trim() || "nao_informado";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    const summary = {
      generated_at: new Date().toISOString(),
      company_id: body.company_id,
      agent_id: agentId,
      period_start: periodStart,
      period_end: periodEnd,
      totals: {
        outcomes_total: revenueRows.length,
        won_count: wonRows.length,
        lost_count: lostRows.length,
        open_count: openRows.length,
        won_value: Number(wonValue.toFixed(2)),
        lost_value: Number(lostValue.toFixed(2)),
        avg_ticket_won: Number(avgTicketWon.toFixed(2)),
        conversion_rate: Number(conversionRate.toFixed(2)),
      },
      copilot: {
        signals_total: signalRows.length,
        high_intent_count: highIntent,
        medium_intent_count: mediumIntent,
        high_risk_count: highRisk,
        avg_close_probability: Number(avgCloseProbability.toFixed(2)),
      },
      coaching: {
        actions_total: coachingRows.length,
        accepted_actions: acceptedActions,
        adoption_rate: Number(coachingAdoptionRate.toFixed(2)),
      },
      top_loss_reasons: topLossReasons,
    };

    const { data: report, error: reportError } = await supabase
      .schema("app")
      .from("roi_reports")
      .insert({
        company_id: body.company_id,
        requested_by_user_id: user.id,
        agent_id: agentId,
        period_start: periodStart,
        period_end: periodEnd,
        summary,
      })
      .select("id, created_at")
      .single();

    if (reportError || !report) {
      return json(500, { error: `Falha ao persistir relatorio: ${reportError?.message ?? "erro desconhecido"}` });
    }

    return json(200, {
      success: true,
      report_id: report.id,
      created_at: report.created_at,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return json(500, { error: message });
  }
});
