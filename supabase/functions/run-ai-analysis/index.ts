import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner_admin" | "manager" | "qa_reviewer" | "agent";
type Action = "preview" | "start";
type Scope = "single" | "all";

interface RunRequestBody {
  action?: Action;
  company_id?: string;
  agent_id?: string;
  scope?: Scope;
  conversation_id?: string | null;
  period_start?: string;
  period_end?: string;
  limit?: number;
}

interface MemberRow {
  role: Role;
}

interface CandidateRow {
  conversation_id: string;
  company_id: string;
  agent_id: string;
  raw_conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(asNumber)) return fallback;
  const rounded = Math.round(asNumber);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function parseBody(value: unknown): RunRequestBody {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;

  const action = body.action === "preview" || body.action === "start" ? body.action : undefined;
  const scope = body.scope === "single" || body.scope === "all" ? body.scope : undefined;

  return {
    action,
    company_id: typeof body.company_id === "string" ? body.company_id.trim() : undefined,
    agent_id: typeof body.agent_id === "string" ? body.agent_id.trim() : undefined,
    scope,
    conversation_id: typeof body.conversation_id === "string"
      ? body.conversation_id.trim()
      : body.conversation_id === null
        ? null
        : undefined,
    period_start: typeof body.period_start === "string" ? body.period_start.trim() : undefined,
    period_end: typeof body.period_end === "string" ? body.period_end.trim() : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
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

async function getCompanyTimezone(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string> {
  const { data, error } = await supabase
    .schema("app")
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(`Falha ao carregar timezone da empresa: ${error.message}`);
  }

  if (isRecord(data) && isRecord(data.settings) && typeof data.settings.timezone === "string") {
    const tz = data.settings.timezone.trim();
    if (tz.length > 0) return tz;
  }

  return "UTC";
}

async function fetchCandidates(
  supabase: ReturnType<typeof createClient>,
  params: {
    companyId: string;
    agentId: string;
    periodStart: string;
    periodEnd: string;
    timezone: string;
    limit: number | null;
  },
): Promise<CandidateRow[]> {
  const { data, error } = await supabase.schema("app").rpc("get_ai_analysis_candidates", {
    p_company_id: params.companyId,
    p_agent_id: params.agentId,
    p_period_start: params.periodStart,
    p_period_end: params.periodEnd,
    p_timezone: params.timezone,
    p_limit: params.limit,
  });

  if (error) {
    throw new Error(`Falha ao carregar conversas candidatas: ${error.message}`);
  }

  if (!Array.isArray(data)) return [];

  return data.filter((item) => isRecord(item) && typeof item.conversation_id === "string") as CandidateRow[];
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
    if (!token) {
      return json(401, { error: "Missing Authorization bearer token." });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      return json(401, { error: "Invalid or expired token." });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return json(400, { error: "Payload JSON invalido." });
    }

    const body = parseBody(rawBody);
    if (!body.action) {
      return json(400, { error: "Campo 'action' obrigatorio: preview|start." });
    }

    const companyId = body.company_id;
    const agentId = body.agent_id;
    if (!companyId) return json(400, { error: "Campo 'company_id' obrigatorio." });
    if (!agentId) return json(400, { error: "Campo 'agent_id' obrigatorio." });

    const periodStart = parseDate(body.period_start, "period_start");
    const periodEnd = parseDate(body.period_end, "period_end");
    validatePeriod(periodStart, periodEnd);

    const role = await getMemberRole(supabase, user.id, companyId);
    const allowedRoles: Role[] = ["owner_admin", "manager", "qa_reviewer"];
    if (!allowedRoles.includes(role)) {
      return json(403, { error: "Seu perfil nao pode executar analise manual." });
    }

    await ensureAgentBelongsToCompany(supabase, companyId, agentId);
    const companyTimezone = await getCompanyTimezone(supabase, companyId);

    if (body.action === "preview") {
      const previewLimit = clampInt(body.limit, 1, 200, 100);
      const candidates = await fetchCandidates(supabase, {
        companyId,
        agentId,
        periodStart,
        periodEnd,
        timezone: companyTimezone,
        limit: previewLimit,
      });

      return json(200, {
        success: true,
        count: candidates.length,
        candidates: candidates.map((candidate) => ({
          conversation_id: candidate.conversation_id,
          started_at: candidate.started_at,
          status: candidate.status,
          customer_name: candidate.customer_name,
          customer_phone: candidate.customer_phone,
        })),
      });
    }

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return json(500, { error: "ANTHROPIC_API_KEY nao configurada." });
    }

    const scope = body.scope;
    if (scope !== "single" && scope !== "all") {
      return json(400, { error: "Campo 'scope' obrigatorio: single|all." });
    }

    const allCandidates = await fetchCandidates(supabase, {
      companyId,
      agentId,
      periodStart,
      periodEnd,
      timezone: companyTimezone,
      limit: null,
    });

    let totalCandidates = allCandidates.length;
    let conversationId: string | null = null;

    if (scope === "single") {
      conversationId = body.conversation_id ?? null;
      if (!conversationId) {
        return json(400, { error: "Campo 'conversation_id' obrigatorio no scope single." });
      }

      const found = allCandidates.some((candidate) => candidate.conversation_id === conversationId);
      if (!found) {
        return json(400, { error: "Conversa selecionada nao pertence ao filtro informado." });
      }

      totalCandidates = 1;
    }

    if (totalCandidates === 0) {
      return json(400, { error: "Nenhuma conversa encontrada para os filtros selecionados." });
    }

    const { data: createdJob, error: createError } = await supabase
      .schema("app")
      .from("ai_analysis_jobs")
      .insert({
        company_id: companyId,
        requested_by_user_id: user.id,
        agent_id: agentId,
        scope,
        conversation_id: conversationId,
        period_start: periodStart,
        period_end: periodEnd,
        company_timezone: companyTimezone,
        status: "queued",
        total_candidates: totalCandidates,
      })
      .select("id, status, total_candidates")
      .single();

    if (createError || !createdJob) {
      return json(500, { error: `Falha ao criar job: ${createError?.message ?? "erro desconhecido"}` });
    }

    return json(200, {
      success: true,
      job_id: createdJob.id,
      status: createdJob.status,
      total_candidates: createdJob.total_candidates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return json(500, { error: message });
  }
});