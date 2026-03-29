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

// ── Claude extraction ─────────────────────────────────────────────────────────

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
  apiKey: string,
  conversationText: string,
): Promise<AnalysisResult | null> {
  const prompt = EXTRACTION_PROMPT.replace("{CONVERSATION}", conversationText);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
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
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "SUPABASE env vars ausentes." });
  if (!anthropicApiKey) return json(500, { error: "ANTHROPIC_API_KEY nao configurada." });

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
    if (!["owner_admin", "manager", "qa_reviewer"].includes((member as { role: string }).role)) {
      return json(403, { error: "Perfil sem permissao para executar analise de inteligencia." });
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
          customer_name: (c.customer as any)?.name ?? null,
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

        const result = await extractIntelligence(anthropicApiKey, conversationText);
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
      } catch (_err) {
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
