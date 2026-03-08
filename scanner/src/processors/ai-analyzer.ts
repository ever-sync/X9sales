import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v3-enhanced';
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_ERROR_MESSAGE_LENGTH = 2000;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
type JobScope = 'single' | 'all';
type AnalysisOutcome = 'analyzed' | 'skipped';

interface AIAnalysisJobRow {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  scope: JobScope;
  conversation_id: string | null;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: JobStatus;
  total_candidates: number;
  processed_count: number;
  analyzed_count: number;
  skipped_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface JobCounters {
  processed_count: number;
  analyzed_count: number;
  skipped_count: number;
  failed_count: number;
}

interface CandidateConversation {
  conversation_id: string;
  company_id: string;
  agent_id: string;
  raw_conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
}

interface RawConversation {
  conversation_external_id: string;
  channel: string | null;
}

interface RawMessage {
  direction: string;
  sender_type: string;
  message_timestamp: string;
  raw_payload: { text?: unknown; body?: unknown; [key: string]: unknown } | null;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

interface KnowledgeBaseMatch {
  content: string;
}

interface MissedOpportunity {
  turn: number;
  agent_message: string;
  missed_action: string;
  impact: string;
}

interface ConversationDiagnosis {
  conversation_type: string;
  sales_stage: string;
  customer_intent: string;
  interest_level: string;
}

interface WeightedBreakdown {
  communication_weighted: number;
  investigation_weighted: number;
  steering_weighted: number;
  objections_weighted: number;
  closing_weighted: number;
}

interface AIAnalysisResult {
  quality_score: number | null;
  predicted_csat: number | null;
  is_sales_conversation: boolean;
  score_empathy: number | null;
  score_professionalism: number | null;
  score_clarity: number | null;
  score_conflict_resolution: number | null;
  score_rapport: number | null;
  score_urgency: number | null;
  score_value_proposition: number | null;
  score_objection_handling: number | null;
  score_investigation: number | null;
  score_commercial_steering: number | null;
  used_rapport: boolean;
  used_urgency: boolean;
  used_value_proposition: boolean;
  used_objection_handling: boolean;
  needs_coaching: boolean;
  coaching_tips: string[];
  training_tags: string[];
  missed_opportunities: MissedOpportunity[];
  strengths: string[];
  improvements: string[];
  diagnosis: ConversationDiagnosis;
  pillar_evidence: Record<string, string>;
  failure_tags: string[];
}

interface ConversationForAnalysis {
  id: string;
  company_id: string;
  agent_id: string;
  raw_conversation_id: string;
}

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropic;
}

function coerceRpcSingleRow<T>(value: unknown): T | null {
  if (!value) return null;
  const row = Array.isArray(value) ? (value[0] ?? null) : value;
  if (!row || typeof row !== 'object') return null;
  if ('id' in row && !((row as { id?: unknown }).id)) return null;
  return row as T;
}

function trimErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? 'Unknown error');
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function normalizeSmallint(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const rounded = Math.round(numericValue);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .slice(0, 20);
}

function normalizeMissedOpportunities(value: unknown): MissedOpportunity[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      turn: typeof item.turn === 'number' ? item.turn : 0,
      agent_message: typeof item.agent_message === 'string' ? item.agent_message.slice(0, 500) : '',
      missed_action: typeof item.missed_action === 'string' ? item.missed_action.slice(0, 500) : '',
      impact: ['low', 'medium', 'high'].includes(item.impact as string) ? (item.impact as string) : 'medium',
    }))
    .slice(0, 10);
}

function normalizeDiagnosis(value: unknown): ConversationDiagnosis {
  const defaults: ConversationDiagnosis = {
    conversation_type: '',
    sales_stage: '',
    customer_intent: '',
    interest_level: '',
  };
  if (!value || typeof value !== 'object') return defaults;
  const obj = value as Record<string, unknown>;
  return {
    conversation_type: typeof obj.conversation_type === 'string' ? obj.conversation_type : '',
    sales_stage: typeof obj.sales_stage === 'string' ? obj.sales_stage : '',
    customer_intent: typeof obj.customer_intent === 'string' ? obj.customer_intent : '',
    interest_level: typeof obj.interest_level === 'string' ? obj.interest_level : '',
  };
}

function normalizePillarEvidence(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && val.trim()) {
      result[key] = val.slice(0, 500);
    }
  }
  return result;
}

const PILLAR_WEIGHTS = {
  communication: 0.30,
  investigation: 0.25,
  steering: 0.20,
  objections: 0.15,
  closing: 0.10,
} as const;

function calculateWeightedScore(result: AIAnalysisResult): {
  quality_score: number;
  weighted_breakdown: WeightedBreakdown;
} {
  const commScores = [result.score_empathy, result.score_professionalism, result.score_clarity]
    .filter((s): s is number => s != null);
  const commAvg = commScores.length > 0
    ? commScores.reduce((a, b) => a + b, 0) / commScores.length
    : 5;

  const investigation = result.score_investigation ?? 5;
  const steering = result.score_commercial_steering ?? 5;
  const objections = result.score_objection_handling ?? 5;

  const closingScores = [result.score_rapport, result.score_urgency, result.score_value_proposition]
    .filter((s): s is number => s != null);
  const closingAvg = closingScores.length > 0
    ? closingScores.reduce((a, b) => a + b, 0) / closingScores.length
    : 5;

  const raw =
    commAvg * PILLAR_WEIGHTS.communication +
    investigation * PILLAR_WEIGHTS.investigation +
    steering * PILLAR_WEIGHTS.steering +
    objections * PILLAR_WEIGHTS.objections +
    closingAvg * PILLAR_WEIGHTS.closing;

  const quality_score = Math.round(raw * 10);

  return {
    quality_score: Math.min(100, Math.max(0, quality_score)),
    weighted_breakdown: {
      communication_weighted: +(commAvg * PILLAR_WEIGHTS.communication * 10).toFixed(1),
      investigation_weighted: +(investigation * PILLAR_WEIGHTS.investigation * 10).toFixed(1),
      steering_weighted: +(steering * PILLAR_WEIGHTS.steering * 10).toFixed(1),
      objections_weighted: +(objections * PILLAR_WEIGHTS.objections * 10).toFixed(1),
      closing_weighted: +(closingAvg * PILLAR_WEIGHTS.closing * 10).toFixed(1),
    },
  };
}

function normalizeAnalysis(result: AIAnalysisResult): AIAnalysisResult {
  const isSales = normalizeBoolean(result.is_sales_conversation, false);
  return {
    quality_score: normalizeSmallint(result.quality_score, 0, 100),
    predicted_csat: normalizeSmallint(result.predicted_csat, 1, 5),
    is_sales_conversation: isSales,
    score_empathy: normalizeSmallint(result.score_empathy, 0, 10),
    score_professionalism: normalizeSmallint(result.score_professionalism, 0, 10),
    score_clarity: normalizeSmallint(result.score_clarity, 0, 10),
    score_conflict_resolution: normalizeSmallint(result.score_conflict_resolution, 0, 10),
    score_rapport: normalizeSmallint(result.score_rapport, 0, 10),
    score_urgency: normalizeSmallint(result.score_urgency, 0, 10),
    score_value_proposition: normalizeSmallint(result.score_value_proposition, 0, 10),
    score_objection_handling: normalizeSmallint(result.score_objection_handling, 0, 10),
    score_investigation: normalizeSmallint(result.score_investigation, 0, 10),
    score_commercial_steering: normalizeSmallint(result.score_commercial_steering, 0, 10),
    used_rapport: normalizeBoolean(result.used_rapport, false),
    used_urgency: normalizeBoolean(result.used_urgency, false),
    used_value_proposition: normalizeBoolean(result.used_value_proposition, false),
    used_objection_handling: normalizeBoolean(result.used_objection_handling, false),
    needs_coaching: normalizeBoolean(result.needs_coaching, false),
    coaching_tips: normalizeStringArray(result.coaching_tips),
    training_tags: normalizeStringArray(result.training_tags),
    missed_opportunities: normalizeMissedOpportunities(result.missed_opportunities),
    strengths: normalizeStringArray(result.strengths).slice(0, 5),
    improvements: normalizeStringArray(result.improvements).slice(0, 5),
    diagnosis: normalizeDiagnosis(result.diagnosis),
    pillar_evidence: normalizePillarEvidence(result.pillar_evidence),
    failure_tags: normalizeStringArray(result.failure_tags).slice(0, 15),
  };
}

export async function processAiAnalysisJobs(): Promise<void> {
  if (!config.anthropicApiKey) {
    console.log('[AIAnalyzer] ANTHROPIC_API_KEY not configured, skipping manual jobs.');
    return;
  }

  const job = await dequeueAiAnalysisJob();
  if (!job) {
    console.log('[AIAnalyzer] No queued manual AI analysis jobs.');
    return;
  }

  await runAiAnalysisJob(job);
}

async function dequeueAiAnalysisJob(): Promise<AIAnalysisJobRow | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_ai_analysis_job');

  if (error) {
    throw new Error(`[AIAnalyzer] Failed to dequeue AI job: ${error.message}`);
  }

  return coerceRpcSingleRow<AIAnalysisJobRow>(data);
}

async function runAiAnalysisJob(job: AIAnalysisJobRow): Promise<void> {
  const counters: JobCounters = {
    processed_count: job.processed_count ?? 0,
    analyzed_count: job.analyzed_count ?? 0,
    skipped_count: job.skipped_count ?? 0,
    failed_count: job.failed_count ?? 0,
  };

  try {
    const candidates = await fetchJobCandidates(job);

    if (candidates.length !== job.total_candidates) {
      await updateJob(job.id, { total_candidates: candidates.length });
    }

    if (candidates.length === 0) {
      await completeJob(job.id, counters, 0);
      console.log(`[AIAnalyzer] Job ${job.id} completed with zero candidates.`);
      return;
    }

    console.log(
      `[AIAnalyzer] Running job ${job.id}: scope=${job.scope}, candidates=${candidates.length}`,
    );

    for (const candidate of candidates) {
      counters.processed_count += 1;

      try {
        const outcome = await analyzeCandidateConversation(candidate);
        if (outcome === 'analyzed') {
          counters.analyzed_count += 1;
        } else {
          counters.skipped_count += 1;
        }
      } catch (error) {
        counters.failed_count += 1;
        console.error(
          `[AIAnalyzer] Job ${job.id} failed conversation ${candidate.conversation_id}:`,
          error,
        );
      }

      await updateJob(job.id, {
        processed_count: counters.processed_count,
        analyzed_count: counters.analyzed_count,
        skipped_count: counters.skipped_count,
        failed_count: counters.failed_count,
      });
    }

    await completeJob(job.id, counters, candidates.length);
    console.log(
      `[AIAnalyzer] Job ${job.id} completed: analyzed=${counters.analyzed_count}, skipped=${counters.skipped_count}, failed=${counters.failed_count}`,
    );
  } catch (error) {
    const message = trimErrorMessage(error);
    console.error(`[AIAnalyzer] Job ${job.id} failed: ${message}`);
    await failJob(job.id, counters, message);
  }
}

async function fetchJobCandidates(job: AIAnalysisJobRow): Promise<CandidateConversation[]> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('get_ai_analysis_candidates', {
      p_company_id: job.company_id,
      p_agent_id: job.agent_id,
      p_period_start: job.period_start,
      p_period_end: job.period_end,
      p_timezone: job.company_timezone,
      p_limit: null,
    });

  if (error) {
    throw new Error(`Failed to load candidates for job ${job.id}: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as CandidateConversation[];
  const candidates = rows.filter(
    (row) =>
      !!row?.conversation_id &&
      !!row?.company_id &&
      !!row?.agent_id &&
      !!row?.raw_conversation_id,
  );

  if (job.scope === 'single') {
    if (!job.conversation_id) {
      throw new Error('Single-scope job missing conversation_id.');
    }

    const singleMatch = candidates.filter(
      (candidate) => candidate.conversation_id === job.conversation_id,
    );

    if (singleMatch.length === 0) {
      throw new Error('Selected conversation is no longer eligible for this job.');
    }

    return singleMatch;
  }

  return candidates;
}

async function analyzeCandidateConversation(candidate: CandidateConversation): Promise<AnalysisOutcome> {
  const conversation: ConversationForAnalysis = {
    id: candidate.conversation_id,
    company_id: candidate.company_id,
    agent_id: candidate.agent_id,
    raw_conversation_id: candidate.raw_conversation_id,
  };

  const { data: rawConv, error: rawConvErr } = await supabase
    .schema('raw')
    .from('conversations')
    .select('conversation_external_id, channel')
    .eq('id', conversation.raw_conversation_id)
    .maybeSingle();

  if (rawConvErr) {
    throw new Error(`Failed to load raw conversation for ${conversation.id}: ${rawConvErr.message}`);
  }

  if (!rawConv?.conversation_external_id) {
    return 'skipped';
  }

  const { data: rawMessages, error: messagesErr } = await supabase
    .schema('raw')
    .from('messages')
    .select('direction, sender_type, message_timestamp, raw_payload')
    .eq('company_id', conversation.company_id)
    .eq('conversation_external_id', rawConv.conversation_external_id)
    .order('message_timestamp', { ascending: true })
    .limit(150);

  if (messagesErr) {
    throw new Error(`Failed to load messages for ${conversation.id}: ${messagesErr.message}`);
  }

  const transcript = buildTranscript((rawMessages ?? []) as RawMessage[]);
  if (!transcript.trim()) {
    return 'skipped';
  }

  const kbContext = await fetchKnowledgeContext(transcript, conversation.company_id);
  const result = await callClaudeHaiku(transcript, (rawConv as RawConversation).channel ?? 'unknown', kbContext);
  const { quality_score, weighted_breakdown } = calculateWeightedScore(result);
  result.quality_score = quality_score;
  await saveAnalysis(conversation, result, weighted_breakdown);

  if (result.needs_coaching && (result.quality_score ?? 100) < 70) {
    try {
      await createCoachingAlert(conversation, result);
    } catch (error) {
      console.error(`[AIAnalyzer] Failed to create coaching alert for ${conversation.id}:`, error);
    }
  }

  return 'analyzed';
}

function buildTranscript(messages: RawMessage[]): string {
  return messages
    .map((msg) => {
      const payload = msg.raw_payload ?? {};
      const rawText = payload.text ?? payload.body ?? '';
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      if (!text) return null;

      const speaker =
        msg.sender_type === 'agent'
          ? '[ATENDENTE]'
          : msg.sender_type === 'customer'
            ? '[CLIENTE]'
            : '[SISTEMA]';

      const date = new Date(msg.message_timestamp);
      const time = Number.isNaN(date.getTime()) ? '--:--' : date.toISOString().slice(11, 16);
      return `${speaker} (${time}): ${text}`;
    })
    .filter((line): line is string => !!line)
    .join('\n');
}

async function fetchKnowledgeContext(transcript: string, companyId: string): Promise<string> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return '';
  }

  try {
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: transcript.slice(0, 8000),
      }),
    });

    if (!embeddingResponse.ok) {
      console.warn(`[AIAnalyzer] Embedding API request failed: ${embeddingResponse.status}`);
      return '';
    }

    const embeddingData = (await embeddingResponse.json()) as OpenAIEmbeddingResponse;
    const embedding = embeddingData.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      return '';
    }

    const { data: kbDocs, error: kbError } = await supabase
      .schema('app')
      .rpc('match_knowledge_base', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: 2,
        p_company_id: companyId,
      });

    if (kbError) {
      console.warn(`[AIAnalyzer] match_knowledge_base failed: ${kbError.message}`);
      return '';
    }

    const docs = (Array.isArray(kbDocs) ? kbDocs : []) as KnowledgeBaseMatch[];
    const context = docs
      .map((doc) => doc.content)
      .filter((content): content is string => typeof content === 'string' && content.length > 0)
      .join('\n\n');

    return context;
  } catch (error) {
    console.error('[AIAnalyzer] Failed to fetch RAG context:', error);
    return '';
  }
}

async function callClaudeHaiku(
  transcript: string,
  channel: string,
  kbContext: string,
): Promise<AIAnalysisResult> {
  const client = getAnthropicClient();

  const systemPrompt =
    'Voce e um analista especialista em qualidade de vendas e atendimento ao cliente. ' +
    'Analise a conversa de forma estruturada seguindo as instrucoes exatas. ' +
    'Retorne apenas JSON valido, sem texto adicional. Responda em portugues (pt-BR).';

  const contextBlock = kbContext
    ? `BASE DE CONHECIMENTO DA EMPRESA:\n${kbContext}\n\n`
    : '';

  const userPrompt =
    `Canal: ${channel.toUpperCase()}\n\n` +
    contextBlock +
    `Transcript:\n${transcript}\n\n` +
    '---\n' +
    'Analise a conversa e retorne este JSON com avaliacao estruturada:\n\n' +
    '{\n' +
    '  "predicted_csat": <numero 1-5>,\n' +
    '  "is_sales_conversation": <true/false>,\n' +
    '\n' +
    '  // SCORES POR PILAR (0-10 cada)\n' +
    '  "score_empathy": <0-10>,\n' +
    '  "score_professionalism": <0-10>,\n' +
    '  "score_clarity": <0-10>,\n' +
    '  "score_conflict_resolution": <0-10 ou null>,\n' +
    '  "score_rapport": <0-10 ou null se nao for venda>,\n' +
    '  "score_urgency": <0-10 ou null se nao for venda>,\n' +
    '  "score_value_proposition": <0-10 ou null se nao for venda>,\n' +
    '  "score_objection_handling": <0-10 ou null se nao houver objecao>,\n' +
    '  "score_investigation": <0-10, mede se o atendente investigou a dor, urgencia, contexto e objetivo do cliente antes de responder. 0=nao investigou nada, 10=diagnosticou profundamente>,\n' +
    '  "score_commercial_steering": <0-10, mede se o atendente tomou controle da conversa, guiou para proximo passo, propos solucao e evitou conversa passiva. 0=totalmente passivo, 10=conduziu com maestria>,\n' +
    '\n' +
    '  // TECNICAS USADAS\n' +
    '  "used_rapport": <true/false>,\n' +
    '  "used_urgency": <true/false>,\n' +
    '  "used_value_proposition": <true/false>,\n' +
    '  "used_objection_handling": <true/false>,\n' +
    '\n' +
    '  // COACHING\n' +
    '  "needs_coaching": <true/false>,\n' +
    '  "coaching_tips": [<ate 3 dicas praticas em portugues>],\n' +
    '  "training_tags": [<tags de areas de treinamento>],\n' +
    '\n' +
    '  // DIAGNOSTICO DA CONVERSA\n' +
    '  "diagnosis": {\n' +
    '    "conversation_type": "<tipo: venda, suporte, pos-venda, informacao, reclamacao>",\n' +
    '    "sales_stage": "<estagio: descoberta, proposta, objecao, fechamento, pos_venda, nao_aplicavel>",\n' +
    '    "customer_intent": "<intencao do cliente em 1 frase curta>",\n' +
    '    "interest_level": "<baixo, medio ou alto>"\n' +
    '  },\n' +
    '\n' +
    '  // PONTOS FORTES E MELHORIAS\n' +
    '  "strengths": [<2 a 4 pontos fortes observados, frases curtas e especificas>],\n' +
    '  "improvements": [<2 a 4 pontos a melhorar, frases curtas e acionaveis>],\n' +
    '\n' +
    '  // OPORTUNIDADES PERDIDAS (momentos especificos onde o atendente poderia ter avancado)\n' +
    '  "missed_opportunities": [\n' +
    '    {\n' +
    '      "turn": <numero da mensagem no transcript>,\n' +
    '      "agent_message": "<trecho exato da mensagem do atendente>",\n' +
    '      "missed_action": "<o que deveria ter feito naquele momento>",\n' +
    '      "impact": "<low, medium ou high>"\n' +
    '    }\n' +
    '  ],\n' +
    '\n' +
    '  // EVIDENCIA POR PILAR (trecho da conversa que justifica cada score)\n' +
    '  "pillar_evidence": {\n' +
    '    "empathy": "<trecho da conversa que justifica o score>",\n' +
    '    "professionalism": "<trecho>",\n' +
    '    "clarity": "<trecho>",\n' +
    '    "investigation": "<trecho que mostra se investigou ou nao>",\n' +
    '    "commercial_steering": "<trecho que mostra conducao ou falta dela>",\n' +
    '    "objection_handling": "<trecho ou null>"\n' +
    '  },\n' +
    '\n' +
    '  // TAGS DE FALHA NORMALIZADAS (use apenas estas tags quando aplicavel)\n' +
    '  // Tags possiveis: falta_investigacao, sem_proximo_passo, rapport_insuficiente,\n' +
    '  // sem_proposta_valor, objecao_ignorada, resposta_generica, sem_conducao,\n' +
    '  // perda_timing, falta_empatia, comunicacao_confusa, demora_resposta, passividade\n' +
    '  "failure_tags": [<tags aplicaveis desta lista>]\n' +
    '}\n' +
    '\n' +
    'IMPORTANTE:\n' +
    '- NAO inclua quality_score no JSON (sera calculado automaticamente)\n' +
    '- Seja especifico nos pontos fortes/melhorias, evite frases genericas como "foi educado"\n' +
    '- Em missed_opportunities, cite o trecho real da conversa\n' +
    '- Em pillar_evidence, cite trechos reais que comprovem o score dado\n' +
    '- failure_tags devem usar APENAS as tags da lista fornecida';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason === 'max_tokens') {
    console.warn('[AIAnalyzer] Response truncated due to max_tokens limit. Consider increasing.');
  }

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude.');
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return JSON: ${content.text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
}

async function saveAnalysis(
  conversation: ConversationForAnalysis,
  result: AIAnalysisResult,
  weightedBreakdown: WeightedBreakdown,
): Promise<void> {
  const normalized = normalizeAnalysis(result);
  const analyzedAt = new Date().toISOString();

  const structuredAnalysis = {
    missed_opportunities: normalized.missed_opportunities,
    strengths: normalized.strengths,
    improvements: normalized.improvements,
    diagnosis: normalized.diagnosis,
    pillar_evidence: normalized.pillar_evidence,
    weighted_breakdown: weightedBreakdown,
    failure_tags: normalized.failure_tags,
  };

  const { error } = await supabase
    .schema('app')
    .from('ai_conversation_analysis')
    .upsert(
      {
        company_id: conversation.company_id,
        conversation_id: conversation.id,
        agent_id: conversation.agent_id,
        quality_score: normalized.quality_score,
        predicted_csat: normalized.predicted_csat,
        is_sales_conversation: normalized.is_sales_conversation,
        score_empathy: normalized.score_empathy,
        score_professionalism: normalized.score_professionalism,
        score_clarity: normalized.score_clarity,
        score_conflict_resolution: normalized.score_conflict_resolution,
        score_rapport: normalized.score_rapport,
        score_urgency: normalized.score_urgency,
        score_value_proposition: normalized.score_value_proposition,
        score_objection_handling: normalized.score_objection_handling,
        score_investigation: normalized.score_investigation,
        score_commercial_steering: normalized.score_commercial_steering,
        used_rapport: normalized.used_rapport,
        used_urgency: normalized.used_urgency,
        used_value_proposition: normalized.used_value_proposition,
        used_objection_handling: normalized.used_objection_handling,
        needs_coaching: normalized.needs_coaching,
        coaching_tips: normalized.coaching_tips,
        training_tags: normalized.training_tags,
        model_used: MODEL,
        prompt_version: PROMPT_VERSION,
        raw_ai_response: result as unknown as Record<string, unknown>,
        structured_analysis: structuredAnalysis,
        analyzed_at: analyzedAt,
      },
      { onConflict: 'conversation_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert AI analysis for ${conversation.id}: ${error.message}`);
  }
}

async function createCoachingAlert(
  conversation: ConversationForAnalysis,
  result: AIAnalysisResult,
): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingError } = await supabase
    .schema('app')
    .from('alerts')
    .select('id')
    .eq('company_id', conversation.company_id)
    .eq('agent_id', conversation.agent_id)
    .eq('alert_type', 'COACHING_NEEDED')
    .gte('created_at', since24h)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to check coaching alert idempotency: ${existingError.message}`);
  }

  if (existing && existing.length > 0) {
    return;
  }

  const severity =
    (result.quality_score ?? 100) < 40
      ? 'high'
      : (result.quality_score ?? 100) < 60
        ? 'medium'
        : 'low';

  const tags = result.training_tags?.join(', ') ?? '';
  const tips = result.coaching_tips?.slice(0, 2).join('; ') ?? '';

  const { error } = await supabase
    .schema('app')
    .from('alerts')
    .insert({
      company_id: conversation.company_id,
      alert_type: 'COACHING_NEEDED',
      severity,
      title: `Atendimento abaixo do padrao - Score IA: ${result.quality_score}`,
      description: tips ? `Areas: ${tags}. Dicas: ${tips}.` : `Areas: ${tags}.`,
      reference_type: 'agent',
      reference_id: conversation.agent_id,
      agent_id: conversation.agent_id,
      meta: {
        conversation_id: conversation.id,
        quality_score: result.quality_score,
        training_tags: result.training_tags,
        coaching_tips: result.coaching_tips,
      },
    });

  if (error) {
    throw new Error(`Failed to create coaching alert: ${error.message}`);
  }
}

async function completeJob(
  jobId: string,
  counters: JobCounters,
  totalCandidates: number,
): Promise<void> {
  await updateJob(jobId, {
    status: 'completed',
    total_candidates: totalCandidates,
    processed_count: counters.processed_count,
    analyzed_count: counters.analyzed_count,
    skipped_count: counters.skipped_count,
    failed_count: counters.failed_count,
    error_message: null,
    finished_at: new Date().toISOString(),
  });
}

async function failJob(
  jobId: string,
  counters: JobCounters,
  errorMessage: string,
): Promise<void> {
  await updateJob(jobId, {
    status: 'failed',
    processed_count: counters.processed_count,
    analyzed_count: counters.analyzed_count,
    skipped_count: counters.skipped_count,
    failed_count: counters.failed_count,
    error_message: errorMessage,
    finished_at: new Date().toISOString(),
  });
}

async function updateJob(
  jobId: string,
  updates: Partial<AIAnalysisJobRow>,
): Promise<void> {
  const { error } = await supabase
    .schema('app')
    .from('ai_analysis_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to update job ${jobId}: ${error.message}`);
  }
}
