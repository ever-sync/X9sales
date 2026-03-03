import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner_admin" | "manager" | "qa_reviewer" | "agent";
type Action = "ask";
type JobStatus = "queued" | "running" | "completed" | "failed";

interface AskRequestBody {
  action?: Action;
  thread_id?: string | null;
  company_id?: string;
  question?: string;
  period_start?: string;
  period_end?: string;
  agent_id?: string | null;
}

interface MemberRow {
  role: Role;
}

interface AgentRow {
  id: string;
  name: string;
}

interface CandidateConversation {
  conversation_id: string;
}

interface QuickStats {
  total_conversations: number;
  avg_quality_score: number | null;
  avg_predicted_csat: number | null;
  coaching_needed_count: number;
  avg_first_response_sec: number | null;
  sla_first_response_pct: number | null;
  high_risk_count: number;
  hot_intent_count: number;
  won_count: number;
  lost_count: number;
  won_value: number;
  open_alerts: number;
}

interface ThreadRow {
  id: string;
  company_id: string;
  user_id: string;
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

function parseBody(value: unknown): AskRequestBody {
  if (!isRecord(value)) return {};
  return {
    action: value.action === "ask" ? "ask" : undefined,
    thread_id: typeof value.thread_id === "string"
      ? value.thread_id.trim()
      : value.thread_id === null
        ? null
        : undefined,
    company_id: typeof value.company_id === "string" ? value.company_id.trim() : undefined,
    question: typeof value.question === "string" ? value.question.trim() : undefined,
    period_start: typeof value.period_start === "string" ? value.period_start.trim() : undefined,
    period_end: typeof value.period_end === "string" ? value.period_end.trim() : undefined,
    agent_id: typeof value.agent_id === "string"
      ? value.agent_id.trim()
      : value.agent_id === null
        ? null
        : undefined,
  };
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

function validatePeriod(periodStart: string, periodEnd: string): string | null {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Periodo invalido.";
  if (end < start) return "Data final nao pode ser menor que data inicial.";
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days > 365) return "Periodo maximo permitido e de 365 dias.";
  return null;
}

function extractAgentHint(question: string): string | null {
  const normalized = question
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const patterns = [
    /atendente\s+([a-zA-ZÀ-ÿ0-9\s]{2,60})/i,
    /analise\s+o\s+atendente\s+([a-zA-ZÀ-ÿ0-9\s]{2,60})/i,
    /analisa\s+o\s+atendente\s+([a-zA-ZÀ-ÿ0-9\s]{2,60})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1].trim().split(" ").slice(0, 3).join(" ");
    }
  }

  return null;
}

function formatNumber(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toFixed(digits);
}

function buildQuickAnswerMarkdown(
  agentName: string,
  periodStart: string,
  periodEnd: string,
  stats: QuickStats,
): string {
  if (stats.total_conversations === 0) {
    return [
      `### Analise inicial - ${agentName}`,
      "",
      `Periodo: ${periodStart} ate ${periodEnd}`,
      "",
      "Nao encontrei conversas elegiveis para este periodo. Ajuste o intervalo e tente novamente.",
      "",
      "_Aprofundamento automatico foi enfileirado para validar novamente._",
    ].join("\n");
  }

  return [
    `### Analise inicial - ${agentName}`,
    "",
    `Periodo: ${periodStart} ate ${periodEnd}`,
    "",
    `- Conversas no periodo: **${stats.total_conversations}**`,
    `- Score medio de qualidade (IA): **${formatNumber(stats.avg_quality_score, 0)}**`,
    `- CSAT previsto medio: **${formatNumber(stats.avg_predicted_csat, 2)}**`,
    `- Conversas com coaching recomendado: **${stats.coaching_needed_count}**`,
    `- Tempo medio de primeira resposta (s): **${formatNumber(stats.avg_first_response_sec, 0)}**`,
    `- SLA primeira resposta: **${formatNumber(stats.sla_first_response_pct, 1)}%**`,
    `- Conversas com risco alto: **${stats.high_risk_count}**`,
    `- Conversas com intencao quente: **${stats.hot_intent_count}**`,
    `- Outcomes ganhos/perdidos: **${stats.won_count}/${stats.lost_count}**`,
    `- Receita ganha no periodo: **R$ ${formatNumber(stats.won_value, 2)}**`,
    `- Alertas abertos do atendente: **${stats.open_alerts}**`,
    "",
    "_Aprofundando agora em background para gerar pontos fortes, fracos e plano de acao com evidencias._",
  ].join("\n");
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
    throw new Error(`Falha ao carregar configuracoes da empresa: ${error.message}`);
  }

  if (isRecord(data) && isRecord(data.settings) && typeof data.settings.timezone === "string") {
    const timezone = data.settings.timezone.trim();
    if (timezone.length > 0) return timezone;
  }

  return "UTC";
}

async function findAgentCandidatesByName(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  hint: string,
): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .schema("app")
    .from("agents")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .ilike("name", `%${hint}%`)
    .order("name")
    .limit(10);

  if (error) {
    throw new Error(`Falha ao buscar atendentes por nome: ${error.message}`);
  }

  return (data ?? []) as AgentRow[];
}

async function ensureAgentById(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .schema("app")
    .from("agents")
    .select("id, name")
    .eq("id", agentId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao validar atendente: ${error.message}`);
  }
  if (!data) return null;
  return data as AgentRow;
}

async function ensureThread(
  supabase: ReturnType<typeof createClient>,
  params: {
    threadId: string | null;
    companyId: string;
    userId: string;
    title: string;
  },
): Promise<ThreadRow> {
  if (params.threadId) {
    const { data, error } = await supabase
      .schema("app")
      .from("manager_copilot_threads")
      .select("id, company_id, user_id")
      .eq("id", params.threadId)
      .eq("company_id", params.companyId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Falha ao carregar thread: ${error.message}`);
    }
    if (data) return data as ThreadRow;
  }

  const { data: createdThread, error: createError } = await supabase
    .schema("app")
    .from("manager_copilot_threads")
    .insert({
      company_id: params.companyId,
      user_id: params.userId,
      title: params.title,
    })
    .select("id, company_id, user_id")
    .single();

  if (createError || !createdThread) {
    throw new Error(`Falha ao criar thread: ${createError?.message ?? "erro desconhecido"}`);
  }

  return createdThread as ThreadRow;
}

async function computeQuickStats(
  supabase: ReturnType<typeof createClient>,
  params: {
    companyId: string;
    agentId: string;
    periodStart: string;
    periodEnd: string;
    companyTimezone: string;
  },
): Promise<QuickStats> {
  const zero: QuickStats = {
    total_conversations: 0,
    avg_quality_score: null,
    avg_predicted_csat: null,
    coaching_needed_count: 0,
    avg_first_response_sec: null,
    sla_first_response_pct: null,
    high_risk_count: 0,
    hot_intent_count: 0,
    won_count: 0,
    lost_count: 0,
    won_value: 0,
    open_alerts: 0,
  };

  const { data: candidatesData, error: candidatesError } = await supabase
    .schema("app")
    .rpc("get_manager_feedback_conversations", {
      p_company_id: params.companyId,
      p_agent_id: params.agentId,
      p_period_start: params.periodStart,
      p_period_end: params.periodEnd,
      p_timezone: params.companyTimezone,
      p_limit: null,
    });

  if (candidatesError) {
    throw new Error(`Falha ao buscar conversas do periodo: ${candidatesError.message}`);
  }

  const candidates = (Array.isArray(candidatesData) ? candidatesData : []) as CandidateConversation[];
  const conversationIds = candidates.map((row) => row.conversation_id);
  if (conversationIds.length === 0) return zero;

  const { data: analysisRows, error: analysisError } = await supabase
    .schema("app")
    .from("ai_conversation_analysis")
    .select("quality_score, predicted_csat, needs_coaching, conversation_id")
    .eq("company_id", params.companyId)
    .eq("agent_id", params.agentId)
    .in("conversation_id", conversationIds);

  if (analysisError) {
    throw new Error(`Falha ao carregar analises IA: ${analysisError.message}`);
  }

  const { data: metricsRows, error: metricsError } = await supabase
    .schema("app")
    .from("metrics_conversation")
    .select("first_response_time_sec, sla_first_response_met, conversation_id")
    .eq("company_id", params.companyId)
    .eq("agent_id", params.agentId)
    .in("conversation_id", conversationIds);

  if (metricsError) {
    throw new Error(`Falha ao carregar metricas de conversa: ${metricsError.message}`);
  }

  const { data: signalRows, error: signalError } = await supabase
    .schema("app")
    .from("deal_signals")
    .select("loss_risk_level, intent_level, conversation_id")
    .eq("company_id", params.companyId)
    .eq("agent_id", params.agentId)
    .in("conversation_id", conversationIds);

  if (signalError) {
    throw new Error(`Falha ao carregar sinais de revenue: ${signalError.message}`);
  }

  const { data: outcomesRows, error: outcomesError } = await supabase
    .schema("app")
    .from("revenue_outcomes")
    .select("outcome, value, conversation_id")
    .eq("company_id", params.companyId)
    .eq("agent_id", params.agentId)
    .in("conversation_id", conversationIds);

  if (outcomesError) {
    throw new Error(`Falha ao carregar outcomes de receita: ${outcomesError.message}`);
  }

  const { count: alertsCount, error: alertsError } = await supabase
    .schema("app")
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("agent_id", params.agentId)
    .eq("status", "open");

  if (alertsError) {
    throw new Error(`Falha ao carregar alertas: ${alertsError.message}`);
  }

  const qualityValues = (analysisRows ?? [])
    .map((row) => row.quality_score)
    .filter((value): value is number => typeof value === "number");
  const csatValues = (analysisRows ?? [])
    .map((row) => row.predicted_csat)
    .filter((value): value is number => typeof value === "number");

  const frtValues = (metricsRows ?? [])
    .map((row) => row.first_response_time_sec)
    .filter((value): value is number => typeof value === "number");
  const slaMeasured = (metricsRows ?? []).filter((row) => row.sla_first_response_met !== null);
  const slaMet = slaMeasured.filter((row) => row.sla_first_response_met === true).length;

  const wonRows = (outcomesRows ?? []).filter((row) => row.outcome === "won");
  const lostRows = (outcomesRows ?? []).filter((row) => row.outcome === "lost");
  const wonValue = wonRows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);

  const highRiskCount = (signalRows ?? []).filter((row) => row.loss_risk_level === "alto").length;
  const hotIntentCount = (signalRows ?? []).filter((row) => row.intent_level === "quente").length;

  return {
    total_conversations: conversationIds.length,
    avg_quality_score: qualityValues.length
      ? qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length
      : null,
    avg_predicted_csat: csatValues.length
      ? csatValues.reduce((sum, value) => sum + value, 0) / csatValues.length
      : null,
    coaching_needed_count: (analysisRows ?? []).filter((row) => row.needs_coaching === true).length,
    avg_first_response_sec: frtValues.length
      ? frtValues.reduce((sum, value) => sum + value, 0) / frtValues.length
      : null,
    sla_first_response_pct: slaMeasured.length ? (slaMet / slaMeasured.length) * 100 : null,
    high_risk_count: highRiskCount,
    hot_intent_count: hotIntentCount,
    won_count: wonRows.length,
    lost_count: lostRows.length,
    won_value: wonValue,
    open_alerts: alertsCount ?? 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) {
      return json(401, { success: false, error: "Missing Authorization bearer token." });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      return json(401, { success: false, error: "Invalid or expired token." });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return json(400, { success: false, error: "Payload JSON invalido." });
    }

    const body = parseBody(rawBody);
    if (body.action !== "ask") {
      return json(400, { success: false, error: "Campo 'action' obrigatorio: ask." });
    }
    if (!body.company_id) {
      return json(400, { success: false, error: "Campo 'company_id' obrigatorio." });
    }
    if (!body.question || body.question.length < 3) {
      return json(400, { success: false, error: "Campo 'question' obrigatorio com minimo de 3 caracteres." });
    }

    const parsedStart = parseDate(body.period_start);
    const parsedEnd = parseDate(body.period_end);
    if (!parsedStart || !parsedEnd) {
      return json(400, {
        success: false,
        code: "PERIOD_REQUIRED",
        message: "Informe periodo inicial e final no formato YYYY-MM-DD.",
      });
    }

    const periodError = validatePeriod(parsedStart, parsedEnd);
    if (periodError) {
      return json(400, { success: false, code: "PERIOD_REQUIRED", message: periodError });
    }

    const role = await getMemberRole(supabase, user.id, body.company_id);
    const allowedRoles: Role[] = ["owner_admin", "manager", "qa_reviewer"];
    if (!allowedRoles.includes(role)) {
      return json(403, { success: false, error: "Seu perfil nao pode usar o Copiloto do Gestor." });
    }

    const companyTimezone = await getCompanyTimezone(supabase, body.company_id);

    let resolvedAgent: AgentRow | null = null;
    if (body.agent_id) {
      resolvedAgent = await ensureAgentById(supabase, body.company_id, body.agent_id);
      if (!resolvedAgent) {
        return json(400, { success: false, error: "Atendente nao encontrado para esta empresa." });
      }
    } else {
      const hint = extractAgentHint(body.question);
      if (!hint) {
        return json(400, {
          success: false,
          code: "AGENT_REQUIRED",
          message: "Nao consegui identificar o atendente na pergunta. Informe o nome ou envie agent_id.",
        });
      }

      const candidates = await findAgentCandidatesByName(supabase, body.company_id, hint);
      if (candidates.length === 0) {
        return json(200, {
          success: false,
          code: "AGENT_NOT_FOUND",
          message: "Nao encontrei atendente com este nome.",
        });
      }

      if (candidates.length > 1) {
        return json(200, {
          success: false,
          code: "AGENT_AMBIGUOUS",
          candidates: candidates.map((agent) => ({ agent_id: agent.id, name: agent.name })),
        });
      }

      resolvedAgent = candidates[0];
    }

    if (!resolvedAgent) {
      return json(400, { success: false, error: "Nao foi possivel resolver o atendente." });
    }

    const thread = await ensureThread(supabase, {
      threadId: body.thread_id ?? null,
      companyId: body.company_id,
      userId: user.id,
      title: `Analise - ${resolvedAgent.name}`,
    });

    const { data: userMessage, error: userMessageError } = await supabase
      .schema("app")
      .from("manager_copilot_messages")
      .insert({
        thread_id: thread.id,
        company_id: body.company_id,
        user_id: user.id,
        role: "user",
        status: "ready",
        content_md: body.question,
        sources: [],
        meta: {
          period_start: parsedStart,
          period_end: parsedEnd,
          agent_id: resolvedAgent.id,
          agent_name: resolvedAgent.name,
        },
      })
      .select("id")
      .single();

    if (userMessageError || !userMessage) {
      return json(500, { success: false, error: `Falha ao salvar pergunta: ${userMessageError?.message}` });
    }

    const quickStats = await computeQuickStats(supabase, {
      companyId: body.company_id,
      agentId: resolvedAgent.id,
      periodStart: parsedStart,
      periodEnd: parsedEnd,
      companyTimezone,
    });

    const quickMarkdown = buildQuickAnswerMarkdown(
      resolvedAgent.name,
      parsedStart,
      parsedEnd,
      quickStats,
    );

    const { data: quickMessage, error: quickMessageError } = await supabase
      .schema("app")
      .from("manager_copilot_messages")
      .insert({
        thread_id: thread.id,
        company_id: body.company_id,
        user_id: null,
        role: "assistant",
        status: "ready",
        content_md: quickMarkdown,
        sources: [
          { type: "quick_metrics", agent_id: resolvedAgent.id, period_start: parsedStart, period_end: parsedEnd },
        ],
        meta: {
          mode: "quick",
          stats: quickStats,
        },
      })
      .select("id")
      .single();

    if (quickMessageError || !quickMessage) {
      return json(500, { success: false, error: `Falha ao salvar resposta inicial: ${quickMessageError?.message}` });
    }

    const { data: pendingMessage, error: pendingMessageError } = await supabase
      .schema("app")
      .from("manager_copilot_messages")
      .insert({
        thread_id: thread.id,
        company_id: body.company_id,
        user_id: null,
        role: "assistant",
        status: "pending",
        content_md: "Aprofundando a analise completa do atendente...",
        sources: [],
        meta: {
          mode: "deep",
          state: "pending",
        },
      })
      .select("id")
      .single();

    if (pendingMessageError || !pendingMessage) {
      return json(500, { success: false, error: `Falha ao criar mensagem pendente: ${pendingMessageError?.message}` });
    }

    const { data: createdJob, error: createJobError } = await supabase
      .schema("app")
      .from("manager_feedback_jobs")
      .insert({
        thread_id: thread.id,
        company_id: body.company_id,
        requested_by_user_id: user.id,
        agent_id: resolvedAgent.id,
        period_start: parsedStart,
        period_end: parsedEnd,
        company_timezone: companyTimezone,
        status: "queued" as JobStatus,
        total_conversations: quickStats.total_conversations,
        processed_count: 0,
        quick_answer_message_id: quickMessage.id,
        final_answer_message_id: pendingMessage.id,
      })
      .select("id, status")
      .single();

    if (createJobError || !createdJob) {
      return json(500, { success: false, error: `Falha ao criar job de aprofundamento: ${createJobError?.message}` });
    }

    await supabase
      .schema("app")
      .from("manager_copilot_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", thread.id);

    return json(200, {
      success: true,
      thread_id: thread.id,
      user_message_id: userMessage.id,
      quick_answer_message_id: quickMessage.id,
      agent_resolution: {
        agent_id: resolvedAgent.id,
        agent_name: resolvedAgent.name,
      },
      job: {
        job_id: createdJob.id,
        status: createdJob.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return json(500, { success: false, error: message });
  }
});
