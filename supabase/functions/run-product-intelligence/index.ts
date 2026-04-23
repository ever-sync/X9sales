import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner_admin" | "agent";
type Action = "start";

interface RunProductIntelligenceBody {
  action?: Action;
  company_id?: string;
  period_start?: string;
  period_end?: string;
  force_refresh?: boolean;
}

interface MemberRow {
  role: Role;
}

interface CompanySettingsPayload {
  timezone: string;
  blockedNumbers: string[];
}

interface CandidateConversation {
  conversation_id: string;
  customer_phone: string | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(header: string | null): string | null {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  const token = header.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function parseBody(value: unknown): RunProductIntelligenceBody {
  if (!isRecord(value)) return {};
  return {
    action: value.action === "start" ? "start" : undefined,
    company_id: typeof value.company_id === "string" ? value.company_id.trim() : undefined,
    period_start: typeof value.period_start === "string" ? value.period_start.trim() : undefined,
    period_end: typeof value.period_end === "string" ? value.period_end.trim() : undefined,
    force_refresh: value.force_refresh === true,
  };
}

function parseDate(value: string | undefined, fieldName: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Campo '${fieldName}' invalido. Use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Campo '${fieldName}' invalido.`);
  }
  return value;
}

function validatePeriod(periodStart: string, periodEnd: string): void {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (end < start) throw new Error("Data final nao pode ser menor que data inicial.");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days > 365) throw new Error("Periodo maximo permitido e de 365 dias.");
}

async function getMemberRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<Role> {
  const { data, error } = await supabase
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
  if (!data) {
    throw new Error("Voce nao e membro ativo desta empresa.");
  }

  return (data as MemberRow).role;
}

async function getCompanySettings(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<CompanySettingsPayload> {
  const { data, error } = await supabase
    .schema("app")
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(`Falha ao carregar configuracoes da empresa: ${error.message}`);
  }

  let timezone = "UTC";
  const blockedNumbers = new Set<string>();
  let blockTeamAnalysis = false;

  if (isRecord(data) && isRecord(data.settings)) {
    const settings = data.settings;
    if (typeof settings.timezone === "string" && settings.timezone.trim()) {
      timezone = settings.timezone.trim();
    }

    if (Array.isArray(settings.blocked_report_numbers)) {
      for (const value of settings.blocked_report_numbers) {
        const normalized = normalizePhone(typeof value === "string" ? value : "");
        if (normalized) blockedNumbers.add(normalized);
      }
    }

    if (Array.isArray(settings.blocked_analysis_customers)) {
      for (const item of settings.blocked_analysis_customers) {
        if (!isRecord(item)) continue;
        const normalized = normalizePhone(typeof item.phone === "string" ? item.phone : "");
        if (normalized) blockedNumbers.add(normalized);
      }
    }

    blockTeamAnalysis = settings.block_team_analysis === true;
  }

  if (blockTeamAnalysis) {
    const { data: agents, error: agentsError } = await supabase
      .schema("app")
      .from("agents")
      .select("phone")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .not("phone", "is", null);

    if (agentsError) {
      throw new Error(`Falha ao carregar numeros do time: ${agentsError.message}`);
    }

    for (const agent of agents ?? []) {
      const normalized = normalizePhone(typeof agent.phone === "string" ? agent.phone : "");
      if (normalized) blockedNumbers.add(normalized);
    }
  }

  return {
    timezone,
    blockedNumbers: Array.from(blockedNumbers),
  };
}

async function fetchEligibleConversations(
  supabase: ReturnType<typeof createClient>,
  params: {
    companyId: string;
    periodStart: string;
    periodEnd: string;
    timezone: string;
    blockedNumbers: string[];
  },
): Promise<CandidateConversation[]> {
  const { data, error } = await supabase
    .schema("app")
    .rpc("get_product_intelligence_conversations", {
      p_company_id: params.companyId,
      p_period_start: params.periodStart,
      p_period_end: params.periodEnd,
      p_timezone: params.timezone,
      p_limit: null,
    });

  if (error) {
    throw new Error(`Falha ao buscar conversas do periodo: ${error.message}`);
  }

  const blockedSet = new Set(params.blockedNumbers);
  const rows = (Array.isArray(data) ? data : []) as CandidateConversation[];
  return rows.filter((row) => !blockedSet.has(normalizePhone(row.customer_phone)));
}

async function findFreshRun(
  supabase: ReturnType<typeof createClient>,
  params: {
    companyId: string;
    periodStart: string;
    periodEnd: string;
  },
) {
  const freshCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .schema("app")
    .from("product_intelligence_runs")
    .select("id, status, total_conversations, prompt_version, created_at")
    .eq("company_id", params.companyId)
    .eq("period_start", params.periodStart)
    .eq("period_end", params.periodEnd)
    .eq("prompt_version", "v1-product-market-intel")
    .eq("status", "completed")
    .gte("created_at", freshCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao consultar analise de produto existente: ${error.message}`);
  }

  return data ?? null;
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
    if (authError || !user) {
      return json(401, { error: "Invalid or expired token." });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return json(400, { error: "Payload JSON invalido." });

    const body = parseBody(rawBody);
    if (body.action !== "start") return json(400, { error: "Campo 'action' obrigatorio: start." });
    if (!body.company_id) return json(400, { error: "Campo 'company_id' obrigatorio." });

    const periodStart = parseDate(body.period_start, "period_start");
    const periodEnd = parseDate(body.period_end, "period_end");
    validatePeriod(periodStart, periodEnd);

    const role = await getMemberRole(supabase, user.id, body.company_id);
    const allowedRoles: Role[] = ["owner_admin"];
    if (!allowedRoles.includes(role)) {
      return json(403, { error: "Somente owner_admin pode executar inteligencia de produto." });
    }

    const companySettings = await getCompanySettings(supabase, body.company_id);

    if (!body.force_refresh) {
      const freshRun = await findFreshRun(supabase, {
        companyId: body.company_id,
        periodStart,
        periodEnd,
      });

      if (freshRun) {
        return json(200, {
          success: true,
          reused: true,
          run_id: freshRun.id,
          status: freshRun.status,
          total_conversations: freshRun.total_conversations ?? 0,
          prompt_version: freshRun.prompt_version,
        });
      }
    }

    const candidates = await fetchEligibleConversations(supabase, {
      companyId: body.company_id,
      periodStart,
      periodEnd,
      timezone: companySettings.timezone,
      blockedNumbers: companySettings.blockedNumbers,
    });

    const { data: createdRun, error: createError } = await supabase
      .schema("app")
      .from("product_intelligence_runs")
      .insert({
        company_id: body.company_id,
        requested_by_user_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        company_timezone: companySettings.timezone,
        source: "manual",
        status: "queued",
        total_conversations: candidates.length,
        processed_count: 0,
        analyzed_count: 0,
        failed_count: 0,
        prompt_version: "v1-product-market-intel",
        report_json: {},
      })
      .select("id, status, total_conversations, prompt_version")
      .single();

    if (createError || !createdRun) {
      return json(500, { error: `Falha ao criar analise de produto: ${createError?.message}` });
    }

    return json(200, {
      success: true,
      reused: false,
      run_id: createdRun.id,
      status: createdRun.status,
      total_conversations: createdRun.total_conversations ?? candidates.length,
      prompt_version: createdRun.prompt_version,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return json(500, { error: message });
  }
});
