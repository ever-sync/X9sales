import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  company_id?: string;
  agent_id?: string;
  period_start?: string;
  period_end?: string;
  limit?: number;
  action?: "preview" | "run";
}

interface ConversationRow {
  id: string;
  agent_id: string | null;
  customer: { name: string | null; phone: string | null } | null;
}

interface MessageRow {
  sender_type: string;
  content: string;
  created_at: string;
}

interface CustomerIntelligence {
  intencao_principal: string | null;
  estagio_funil: "pesquisando" | "comparando" | "pronto_fechar" | null;
  nivel_interesse: "alto" | "medio" | "baixo" | null;
  sensibilidade_preco: "alta" | "media" | "baixa" | null;
  urgencia: "alta" | "media" | "baixa" | null;
  perfil_comportamental: "cauteloso" | "impulsivo" | "analitico" | null;
  principais_duvidas: string[];
  principais_objecoes: string[];
  motivadores_compra: string[];
  risco_perda: "alto" | "medio" | "baixo" | null;
  qualidade_conducao: number | null;
  houve_avanco: boolean | null;
  objecao_tratada: boolean | null;
  oportunidade_perdida: boolean | null;
}

interface ProductIntelligence {
  produto_citado: string | null;
  produto_interesse: string | null;
  produtos_comparados: string[];
  motivo_interesse: string | null;
  dificuldade_entendimento: "alto" | "medio" | "baixo" | null;
  barreiras_produto: string[];
  qualidade_conducao: number | null;
  houve_avanco: boolean | null;
  objecao_tratada: boolean | null;
  oportunidade_perdida: boolean | null;
}

interface AnalysisResult {
  customer: CustomerIntelligence;
  product: ProductIntelligence;
}

type AIProviderKind = "anthropic" | "openai" | "gemini" | "grok" | "deepseek" | "custom";

interface CompanyAIProvider {
  provider: AIProviderKind;
  apiKey: string;
  model: string;
  baseUrl: string | null;
}

const DEFAULT_MODELS: Record<AIProviderKind, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  grok: "grok-3-mini",
  deepseek: "deepseek-chat",
  custom: "gpt-4o-mini",
};

const DEFAULT_BASE_URLS: Partial<Record<AIProviderKind, string>> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  grok: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

// ── AI extraction ─────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Você é um analista de vendas especialista. Analise esta conversa de WhatsApp entre um vendedor e um cliente e extraia as informações abaixo em JSON.

REGRAS:
- Responda APENAS com JSON válido, sem texto antes ou depois
- Use null para campos que não podem ser determinados com certeza
- Arrays devem conter strings curtas (máx 80 caracteres cada)
- Para qualidade_conducao: 0-100 onde 100 = condução excelente da venda

CONVERSA:
{CONVERSATION}

Extraia e retorne EXATAMENTE este JSON (sem campos adicionais):
{
  "customer": {
    "intencao_principal": "string ou null",
    "estagio_funil": "pesquisando|comparando|pronto_fechar ou null",
    "nivel_interesse": "alto|medio|baixo ou null",
    "sensibilidade_preco": "alta|media|baixa ou null",
    "urgencia": "alta|media|baixa ou null",
    "perfil_comportamental": "cauteloso|impulsivo|analitico ou null",
    "principais_duvidas": ["dúvida 1", "dúvida 2"],
    "principais_objecoes": ["objeção 1", "objeção 2"],
    "motivadores_compra": ["motivador 1", "motivador 2"],
    "risco_perda": "alto|medio|baixo ou null",
    "qualidade_conducao": número 0-100 ou null,
    "houve_avanco": true|false|null,
    "objecao_tratada": true|false|null,
    "oportunidade_perdida": true|false|null
  },
  "product": {
    "produto_citado": "string ou null",
    "produto_interesse": "string ou null",
    "produtos_comparados": ["produto A", "produto B"],
    "motivo_interesse": "string ou null",
    "dificuldade_entendimento": "alto|medio|baixo ou null",
    "barreiras_produto": ["barreira 1", "barreira 2"],
    "qualidade_conducao": número 0-100 ou null,
    "houve_avanco": true|false|null,
    "objecao_tratada": true|false|null,
    "oportunidade_perdida": true|false|null
  }
}`;

function formatConversation(messages: MessageRow[]): string {
  return messages
    .map((msg) => {
      const role = msg.sender_type === "agent" ? "VENDEDOR" : "CLIENTE";
      const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const text = msg.content.slice(0, 500); // truncate long messages
      return `[${time}] ${role}: ${text}`;
    })
    .join("\n");
}

async function extractIntelligence(
  provider: CompanyAIProvider,
  conversationText: string,
): Promise<AnalysisResult | null> {
  const prompt = EXTRACTION_PROMPT.replace("{CONVERSATION}", conversationText);

  const response = provider.provider === "anthropic"
    ? await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model || DEFAULT_MODELS.anthropic,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    : await fetch(`${(provider.baseUrl || DEFAULT_BASE_URLS.openai || "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model || DEFAULT_MODELS[provider.provider],
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Responda apenas JSON valido." },
          { role: "user", content: prompt },
        ],
      }),
    });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = provider.provider === "anthropic"
    ? data?.content?.[0]?.text
    : extractOpenAIContentText(data?.choices?.[0]?.message?.content);
  if (typeof text !== "string") return null;

  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed) || !isRecord(parsed.customer) || !isRecord(parsed.product)) return null;
    return parsed as AnalysisResult;
  } catch {
    // Try to extract JSON from the response if it has surrounding text
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      if (!isRecord(parsed) || !isRecord(parsed.customer) || !isRecord(parsed.product)) return null;
      return parsed as AnalysisResult;
    } catch {
      return null;
    }
  }
}

function extractOpenAIContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter((chunk) => chunk.trim().length > 0)
    .join("\n");
}

function normalizeProvider(value: unknown): AIProviderKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const allowed: AIProviderKind[] = ["anthropic", "openai", "gemini", "grok", "deepseek", "custom"];
  return allowed.includes(normalized as AIProviderKind) ? normalized as AIProviderKind : null;
}

function normalizeModel(value: unknown, provider: AIProviderKind): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return DEFAULT_MODELS[provider];
}

function normalizeBaseUrl(value: unknown, provider: AIProviderKind): string | null {
  if (provider === "anthropic") return null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return DEFAULT_BASE_URLS[provider] ?? null;
}

async function resolveCompanyAIProvider(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<CompanyAIProvider | null> {
  const { data, error } = await supabase
    .schema("app")
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(`Falha ao carregar providers de IA da empresa: ${error.message}`);
  }

  if (!isRecord(data) || !isRecord(data.settings) || !Array.isArray(data.settings.ai_providers)) {
    return null;
  }

  const providers = data.settings.ai_providers
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => {
      const provider = normalizeProvider(item.provider);
      if (!provider) return null;
      const apiKey = typeof item.api_key === "string" ? item.api_key.trim() : "";
      if (!apiKey || item.enabled === false) return null;
      const order = typeof item.order === "number" && Number.isFinite(item.order) ? item.order : index;
      return {
        provider,
        apiKey,
        model: normalizeModel(item.model, provider),
        baseUrl: normalizeBaseUrl(item.base_url, provider),
        order,
      };
    })
    .filter((item): item is CompanyAIProvider & { order: number } => item !== null)
    .sort((a, b) => a.order - b.order);

  if (providers.length === 0) return null;
  const selected = providers[0];
  return {
    provider: selected.provider,
    apiKey: selected.apiKey,
    model: selected.model,
    baseUrl: selected.baseUrl,
  };
}

// ── safe coerce helpers ───────────────────────────────────────────────────────

function coerceEnum<T extends string>(
  value: unknown,
  allowed: T[],
): T | null {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  return null;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 10);
}

function coerceInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : null;
}

function coerceBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function coerceStr(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim().slice(0, 300);
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "SUPABASE env vars ausentes." });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Auth
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) return json(401, { error: "Bearer token ausente." });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Token invalido ou expirado." });
    const userId = authData.user.id;

    // Parse body
    const rawBody = await req.json().catch(() => null);
    if (!isRecord(rawBody)) return json(400, { error: "Payload JSON invalido." });

    const body: RequestBody = {
      company_id: typeof rawBody.company_id === "string" ? rawBody.company_id : undefined,
      agent_id: typeof rawBody.agent_id === "string" ? rawBody.agent_id : undefined,
      period_start: typeof rawBody.period_start === "string" ? rawBody.period_start : undefined,
      period_end: typeof rawBody.period_end === "string" ? rawBody.period_end : undefined,
      limit: typeof rawBody.limit === "number" ? Math.min(Math.max(1, rawBody.limit), 50) : 20,
      action: rawBody.action === "preview" || rawBody.action === "run" ? rawBody.action : "run",
    };

    const { company_id: companyId, period_start, period_end } = body;
    if (!companyId) return json(400, { error: "company_id obrigatorio." });
    if (!period_start || !period_end) return json(400, { error: "period_start e period_end obrigatorios (YYYY-MM-DD)." });

    // Check membership
    const { data: member } = await supabase
      .schema("app")
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!member) return json(403, { error: "Voce nao e membro ativo desta empresa." });
    if ((member as { role: string }).role !== "owner_admin") {
      return json(403, { error: "Somente owner_admin pode executar analise de inteligencia." });
    }

    const aiProvider = await resolveCompanyAIProvider(supabase, companyId);
    if (!aiProvider) {
      return json(400, { error: "Nenhum provedor de IA ativo encontrado para esta empresa." });
    }

    // Fetch conversations not yet analyzed in the period
    const startTs = `${period_start}T00:00:00Z`;
    const endTs = `${period_end}T23:59:59Z`;

    let query = supabase
      .schema("app")
      .from("conversations")
      .select("id, agent_id, customer:customers(name, phone)")
      .eq("company_id", companyId)
      .gte("started_at", startTs)
      .lte("started_at", endTs)
      .not("id", "in", `(SELECT conversation_id FROM app.customer_intelligence_reports WHERE company_id = '${companyId}')`)
      .order("started_at", { ascending: false })
      .limit(body.limit ?? 20);

    if (body.agent_id) {
      query = query.eq("agent_id", body.agent_id);
    }

    const { data: conversations, error: convError } = await query;
    if (convError) return json(500, { error: `Falha ao buscar conversas: ${convError.message}` });

    const candidates = (conversations ?? []) as ConversationRow[];

    if (body.action === "preview") {
      return json(200, {
        success: true,
        total_candidates: candidates.length,
        candidates: candidates.map((c) => ({
          conversation_id: c.id,
          customer_name: c.customer?.name ?? null,
        })),
      });
    }

    // Process each conversation
    let processed = 0;
    let failed = 0;

    for (const conv of candidates) {
      try {
        // Load messages
        const { data: messages, error: msgError } = await supabase
          .schema("app")
          .from("messages")
          .select("sender_type, content, created_at")
          .eq("conversation_id", conv.id)
          .in("sender_type", ["agent", "customer"])
          .order("created_at", { ascending: true })
          .limit(100);

        if (msgError || !messages || messages.length < 2) {
          failed++;
          continue;
        }

        const conversationText = formatConversation(messages as MessageRow[]);
        if (conversationText.trim().length < 50) {
          failed++;
          continue;
        }

        const result = await extractIntelligence(aiProvider, conversationText);
        if (!result) {
          failed++;
          continue;
        }

        const ci = result.customer;
        const pi = result.product;

        // Upsert customer intelligence
        await supabase.schema("app").from("customer_intelligence_reports").upsert({
          company_id: companyId,
          conversation_id: conv.id,
          agent_id: conv.agent_id ?? null,
          analyzed_at: new Date().toISOString(),
          intencao_principal: coerceStr(ci.intencao_principal),
          estagio_funil: coerceEnum(ci.estagio_funil, ["pesquisando", "comparando", "pronto_fechar"]),
          nivel_interesse: coerceEnum(ci.nivel_interesse, ["alto", "medio", "baixo"]),
          sensibilidade_preco: coerceEnum(ci.sensibilidade_preco, ["alta", "media", "baixa"]),
          urgencia: coerceEnum(ci.urgencia, ["alta", "media", "baixa"]),
          perfil_comportamental: coerceEnum(ci.perfil_comportamental, ["cauteloso", "impulsivo", "analitico"]),
          principais_duvidas: coerceStringArray(ci.principais_duvidas),
          principais_objecoes: coerceStringArray(ci.principais_objecoes),
          motivadores_compra: coerceStringArray(ci.motivadores_compra),
          risco_perda: coerceEnum(ci.risco_perda, ["alto", "medio", "baixo"]),
          qualidade_conducao: coerceInt(ci.qualidade_conducao, 0, 100),
          houve_avanco: coerceBool(ci.houve_avanco),
          objecao_tratada: coerceBool(ci.objecao_tratada),
          oportunidade_perdida: coerceBool(ci.oportunidade_perdida),
        }, { onConflict: "conversation_id" });

        // Upsert product intelligence
        await supabase.schema("app").from("product_intelligence_reports").upsert({
          company_id: companyId,
          conversation_id: conv.id,
          agent_id: conv.agent_id ?? null,
          analyzed_at: new Date().toISOString(),
          produto_citado: coerceStr(pi.produto_citado),
          produto_interesse: coerceStr(pi.produto_interesse),
          produtos_comparados: coerceStringArray(pi.produtos_comparados),
          motivo_interesse: coerceStr(pi.motivo_interesse),
          dificuldade_entendimento: coerceEnum(pi.dificuldade_entendimento, ["alto", "medio", "baixo"]),
          barreiras_produto: coerceStringArray(pi.barreiras_produto),
          qualidade_conducao: coerceInt(pi.qualidade_conducao, 0, 100),
          houve_avanco: coerceBool(pi.houve_avanco),
          objecao_tratada: coerceBool(pi.objecao_tratada),
          oportunidade_perdida: coerceBool(pi.oportunidade_perdida),
        }, { onConflict: "conversation_id" });

        processed++;
      } catch {
        failed++;
      }
    }

    return json(200, {
      success: true,
      processed,
      failed,
      total_candidates: candidates.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return json(500, { error: message });
  }
});
