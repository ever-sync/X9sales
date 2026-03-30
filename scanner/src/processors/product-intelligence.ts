import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

export const PRODUCT_INTELLIGENCE_MODEL = 'claude-haiku-4-5-20251001';
export const PRODUCT_INTELLIGENCE_PROMPT_VERSION = 'v1-product-market-intel';
export const PRODUCT_INTELLIGENCE_FRESH_HOURS = 6;

const MAX_ERROR_MESSAGE_LENGTH = 2000;
const QUERY_CHUNK_SIZE = 150;
const RAW_MESSAGE_CHUNK_SIZE = 30;
const MAX_MESSAGE_LINES_PER_SNIPPET = 3;
const MAX_LINE_LENGTH = 160;
const MAX_MEMORY_PAYLOAD = 70;
const MAX_ITEMS_PER_SECTION = 6;
const MAX_DECISIONS = 5;

type RunStatus = 'queued' | 'running' | 'completed' | 'failed';
type CauseLevel = 'produto' | 'comunicacao' | 'posicionamento' | 'oferta' | 'atendimento' | 'preco' | 'expectativa';
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

interface ProductIntelligenceRunRow {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  source: 'manual';
  status: RunStatus;
  total_conversations: number;
  processed_count: number;
  analyzed_count: number;
  failed_count: number;
  report_json: Record<string, unknown>;
  report_markdown: string | null;
  prompt_version: string;
  model_used: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface CandidateConversation {
  conversation_id: string;
  company_id: string;
  agent_id: string | null;
  agent_name: string | null;
  raw_conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
}

interface RawConversationRow {
  id: string;
  conversation_external_id: string | null;
}

interface RawMessageRow {
  conversation_external_id: string;
  sender_type: 'agent' | 'customer' | 'system' | 'bot';
  message_timestamp: string;
  raw_payload: { text?: unknown; body?: unknown; [key: string]: unknown } | null;
}

interface ProductReportRow {
  conversation_id: string;
  produto_citado: string | null;
  produto_interesse: string | null;
  produtos_comparados: string[] | null;
  motivo_interesse: string | null;
  dificuldade_entendimento: 'alto' | 'medio' | 'baixo' | null;
  barreiras_produto: string[] | null;
  objecao_tratada: boolean | null;
  oportunidade_perdida: boolean | null;
}

interface CustomerReportRow {
  conversation_id: string;
  intencao_principal: string | null;
  estagio_funil: string | null;
  nivel_interesse: string | null;
  sensibilidade_preco: string | null;
  urgencia: string | null;
  perfil_comportamental: string | null;
  principais_duvidas: string[] | null;
  principais_objecoes: string[] | null;
  motivadores_compra: string[] | null;
  risco_perda: string | null;
  oportunidade_perdida: boolean | null;
}

interface SignalRow {
  conversation_id: string;
  loss_risk_level: string | null;
  intent_level: string | null;
  close_probability: number | null;
  estimated_value: number | null;
  stage: string | null;
}

interface OutcomeRow {
  conversation_id: string;
  outcome: 'won' | 'lost' | 'open';
  value: number | null;
  loss_reason: string | null;
}

interface CompanyProductSettings {
  timezone: string;
  blockedNumbers: Set<string>;
}

interface ConversationMemory {
  conversation_id: string;
  started_at: string;
  agent_name: string | null;
  customer_name: string | null;
  customer_phone_masked: string | null;
  product_cited: string | null;
  product_interest: string | null;
  products_compared: string[];
  interest_reason: string | null;
  difficulty_understanding: 'alto' | 'medio' | 'baixo' | null;
  product_barriers: string[];
  customer_questions: string[];
  customer_objections: string[];
  customer_motivators: string[];
  customer_intent: string | null;
  customer_profile: string | null;
  urgency: string | null;
  interest_level: string | null;
  loss_risk: string | null;
  signal_stage: string | null;
  outcome: string | null;
  loss_reason: string | null;
  estimated_value: number | null;
  opening_excerpt: string;
  customer_excerpt: string;
  closing_excerpt: string;
  opportunity_lost: boolean;
  objection_treated: boolean | null;
}

interface CountBucket {
  label: string;
  count: number;
  conversation_ids: string[];
}

interface StrategicItem {
  title: string;
  summary: string;
  frequency: number | null;
  impact: string;
  urgency: string;
  severity: SeverityLevel;
  likely_cause: CauseLevel;
  evidence_conversation_ids: string[];
}

interface ClientProfileItem {
  profile: string;
  what_they_seek: string;
  main_blockers: string;
  best_approach: string;
  frequency: number | null;
}

interface DecisionItem {
  title: string;
  why_now: string;
  expected_impact: string;
  urgency: string;
  evidence_conversation_ids: string[];
}

interface ProductStrategicReport {
  resumo_executivo: string;
  percepcao_geral_produto: {
    clareza: string;
    valor_percebido: string;
    interesse_gerado: string;
    principal_risco: string;
    principal_oportunidade: string;
  };
  clientes_buscam: StrategicItem[];
  principais_dores: StrategicItem[];
  duvidas_frequentes: StrategicItem[];
  objecoes_frequentes: StrategicItem[];
  valor_percebido: StrategicItem[];
  pontos_de_confusao: StrategicItem[];
  melhorias_de_produto: StrategicItem[];
  melhorias_de_oferta_e_comunicacao: StrategicItem[];
  perfis_de_cliente: ClientProfileItem[];
  sinais_estrategicos: StrategicItem[];
  top_5_decisoes_recomendadas: DecisionItem[];
  totals: {
    conversations_considered: number;
    analyzed_conversations: number;
    evidence_items: number;
  };
}

interface ProductSupportSummary {
  total_conversations: number;
  analyzed_conversations: number;
  high_difficulty_rate: number;
  lost_opportunity_rate: number;
  objection_treated_rate: number;
  high_risk_rate: number;
  won_rate: number;
  avg_close_probability: number | null;
  top_products: CountBucket[];
  top_interest_reasons: CountBucket[];
  top_barriers: CountBucket[];
  top_doubts: CountBucket[];
  top_objections: CountBucket[];
  top_motivators: CountBucket[];
  top_profiles: CountBucket[];
  top_customer_intents: CountBucket[];
  top_loss_reasons: CountBucket[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (!digits) return null;
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${digits.slice(0, 4)}${'*'.repeat(Math.max(digits.length - 6, 2))}${digits.slice(-2)}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items.length || size <= 0) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sanitizeText(value: unknown, maxLength = 220): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeStringArray(value: unknown, maxItems = MAX_ITEMS_PER_SECTION, maxLength = 180): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function clampNumber(value: unknown, min: number, max: number, digits = 0): number | null {
  if (value == null || value === '') return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const factor = Math.pow(10, digits);
  const rounded = Math.round(numericValue * factor) / factor;
  return Math.min(max, Math.max(min, rounded));
}

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function roundRate(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function extractRawMessageText(message: RawMessageRow): string {
  const payload = message.raw_payload ?? {};
  const rawText = payload.text ?? payload.body ?? '';
  return typeof rawText === 'string' ? rawText.trim() : '';
}

function getTextualMessages(messages: RawMessageRow[]): RawMessageRow[] {
  return messages.filter((message) => extractRawMessageText(message).length > 0);
}

function formatTranscriptLine(message: RawMessageRow): string {
  const speaker =
    message.sender_type === 'agent'
      ? 'Atendente'
      : message.sender_type === 'customer'
        ? 'Cliente'
        : 'Sistema';
  return `${speaker}: ${extractRawMessageText(message)}`.slice(0, MAX_LINE_LENGTH);
}

function buildSnippet(messages: RawMessageRow[], fromStart: boolean): string {
  const textual = getTextualMessages(messages);
  const selected = fromStart
    ? textual.slice(0, MAX_MESSAGE_LINES_PER_SNIPPET)
    : textual.slice(-MAX_MESSAGE_LINES_PER_SNIPPET);
  if (!selected.length) return 'Sem texto relevante.';
  return selected.map(formatTranscriptLine).join(' | ');
}

function buildSpeakerSnippet(messages: RawMessageRow[], speaker: 'agent' | 'customer'): string {
  const selected = getTextualMessages(messages)
    .filter((message) => message.sender_type === speaker)
    .slice(0, MAX_MESSAGE_LINES_PER_SNIPPET);
  if (!selected.length) return 'Sem texto relevante.';
  return selected.map(formatTranscriptLine).join(' | ');
}

function mapRowsByConversation<T extends { conversation_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(row.conversation_id, row);
  }
  return map;
}

function collectBuckets(
  memories: ConversationMemory[],
  extractor: (memory: ConversationMemory) => Array<string | null | undefined>,
  limit = MAX_ITEMS_PER_SECTION,
): CountBucket[] {
  const buckets = new Map<string, { count: number; ids: Set<string> }>();

  for (const memory of memories) {
    for (const rawValue of extractor(memory)) {
      const label = sanitizeText(rawValue, 120);
      if (!label) continue;
      const current = buckets.get(label) ?? { count: 0, ids: new Set<string>() };
      current.count += 1;
      current.ids.add(memory.conversation_id);
      buckets.set(label, current);
    }
  }

  return Array.from(buckets.entries())
    .map(([label, bucket]) => ({
      label,
      count: bucket.count,
      conversation_ids: Array.from(bucket.ids).slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function computeRate(count: number, total: number): number {
  if (!total) return 0;
  return roundRate((count / total) * 100);
}

function classifyCause(text: string, fallback: CauseLevel = 'comunicacao'): CauseLevel {
  const normalized = text.toLowerCase();
  if (/(preco|caro|valor|mensalidade|plano)/.test(normalized)) return 'preco';
  if (/(nao entendi|não entendi|confuso|duvida|dúvida|explicar|clareza|comunica)/.test(normalized)) return 'comunicacao';
  if (/(posicion|serve para mim|nao e prioridade|não é prioridade|nao preciso|não preciso)/.test(normalized)) return 'posicionamento';
  if (/(oferta|pacote|proposta|empacot)/.test(normalized)) return 'oferta';
  if (/(atendimento|demora|retorno|follow|suporte|resposta)/.test(normalized)) return 'atendimento';
  if (/(expectativa|promessa|achei que|esperava)/.test(normalized)) return 'expectativa';
  if (/(funcionalidade|integracao|integração|complex|produto|recurso|sistema|automat)/.test(normalized)) return 'produto';
  return fallback;
}

function severityFromRate(rate: number): SeverityLevel {
  if (rate >= 35) return 'critical';
  if (rate >= 20) return 'high';
  if (rate >= 10) return 'medium';
  return 'low';
}

function urgencyFromSeverity(severity: SeverityLevel): string {
  if (severity === 'critical' || severity === 'high') return 'alta';
  if (severity === 'medium') return 'media';
  return 'baixa';
}

function countRichSignals(memory: ConversationMemory): number {
  return [
    memory.product_interest,
    memory.product_cited,
    memory.interest_reason,
    memory.customer_intent,
    memory.customer_profile,
    memory.loss_reason,
    memory.difficulty_understanding,
    memory.opening_excerpt !== 'Sem texto relevante.' ? memory.opening_excerpt : '',
    memory.customer_excerpt !== 'Sem texto relevante.' ? memory.customer_excerpt : '',
    memory.closing_excerpt !== 'Sem texto relevante.' ? memory.closing_excerpt : '',
  ].filter(Boolean).length
    + memory.product_barriers.length
    + memory.customer_questions.length
    + memory.customer_objections.length
    + memory.customer_motivators.length;
}

function buildPromptMemories(memories: ConversationMemory[]): Array<Record<string, unknown>> {
  return [...memories]
    .sort((a, b) => countRichSignals(b) - countRichSignals(a))
    .slice(0, MAX_MEMORY_PAYLOAD)
    .map((memory) => ({
      conversation_id: memory.conversation_id,
      started_at: memory.started_at,
      agent_name: memory.agent_name,
      customer_name: memory.customer_name,
      customer_phone_masked: memory.customer_phone_masked,
      product_cited: memory.product_cited,
      product_interest: memory.product_interest,
      products_compared: memory.products_compared,
      interest_reason: memory.interest_reason,
      difficulty_understanding: memory.difficulty_understanding,
      product_barriers: memory.product_barriers,
      customer_questions: memory.customer_questions,
      customer_objections: memory.customer_objections,
      customer_motivators: memory.customer_motivators,
      customer_intent: memory.customer_intent,
      customer_profile: memory.customer_profile,
      urgency: memory.urgency,
      interest_level: memory.interest_level,
      loss_risk: memory.loss_risk,
      signal_stage: memory.signal_stage,
      outcome: memory.outcome,
      loss_reason: memory.loss_reason,
      estimated_value: memory.estimated_value,
      opportunity_lost: memory.opportunity_lost,
      objection_treated: memory.objection_treated,
      opening_excerpt: memory.opening_excerpt,
      customer_excerpt: memory.customer_excerpt,
      closing_excerpt: memory.closing_excerpt,
    }));
}

async function getCompanyProductSettings(companyId: string): Promise<CompanyProductSettings> {
  const { data, error } = await supabase
    .schema('app')
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();

  if (error) {
    throw new Error(`Failed to load company settings: ${error.message}`);
  }

  let timezone = 'UTC';
  let blockTeamAnalysis = false;
  const blockedNumbers = new Set<string>();

  if (isRecord(data) && isRecord(data.settings)) {
    const settings = data.settings;
    if (typeof settings.timezone === 'string' && settings.timezone.trim()) {
      timezone = settings.timezone.trim();
    }

    if (Array.isArray(settings.blocked_report_numbers)) {
      for (const value of settings.blocked_report_numbers) {
        const normalized = normalizePhone(typeof value === 'string' ? value : '');
        if (normalized) blockedNumbers.add(normalized);
      }
    }

    if (Array.isArray(settings.blocked_analysis_customers)) {
      for (const item of settings.blocked_analysis_customers) {
        if (!isRecord(item)) continue;
        const normalized = normalizePhone(typeof item.phone === 'string' ? item.phone : '');
        if (normalized) blockedNumbers.add(normalized);
      }
    }

    blockTeamAnalysis = settings.block_team_analysis === true;
  }

  if (blockTeamAnalysis) {
    const { data: agents, error: agentsError } = await supabase
      .schema('app')
      .from('agents')
      .select('phone')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('phone', 'is', null);

    if (agentsError) {
      throw new Error(`Failed to load team phones: ${agentsError.message}`);
    }

    for (const agent of agents ?? []) {
      const normalized = normalizePhone(typeof agent.phone === 'string' ? agent.phone : '');
      if (normalized) blockedNumbers.add(normalized);
    }
  }

  return { timezone, blockedNumbers };
}

async function loadCandidateConversations(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  companyTimezone: string;
  blockedNumbers: Set<string>;
}): Promise<CandidateConversation[]> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('get_product_intelligence_conversations', {
      p_company_id: params.companyId,
      p_period_start: params.periodStart,
      p_period_end: params.periodEnd,
      p_timezone: params.companyTimezone,
      p_limit: null,
    });

  if (error) {
    throw new Error(`Failed to load product intelligence conversations: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as CandidateConversation[];
  return rows.filter((row) => !params.blockedNumbers.has(normalizePhone(row.customer_phone)));
}

async function fetchRawConversationExternalIds(rawConversationIds: string[]): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  if (!rawConversationIds.length) return mapping;

  for (const chunk of chunkArray(rawConversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('raw')
      .from('conversations')
      .select('id, conversation_external_id')
      .in('id', chunk);

    if (error) {
      throw new Error(`Failed to load raw conversations: ${error.message}`);
    }

    for (const row of (data ?? []) as RawConversationRow[]) {
      if (row.id && row.conversation_external_id) {
        mapping.set(row.id, row.conversation_external_id);
      }
    }
  }

  return mapping;
}

async function fetchRawMessages(companyId: string, externalIds: string[]): Promise<Map<string, RawMessageRow[]>> {
  const map = new Map<string, RawMessageRow[]>();
  if (!externalIds.length) return map;

  for (const chunk of chunkArray(externalIds, RAW_MESSAGE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('raw')
      .from('messages')
      .select('conversation_external_id, sender_type, message_timestamp, raw_payload')
      .eq('company_id', companyId)
      .in('conversation_external_id', chunk)
      .order('message_timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to load raw messages: ${error.message}`);
    }

    for (const row of (data ?? []) as RawMessageRow[]) {
      const current = map.get(row.conversation_external_id) ?? [];
      current.push(row);
      map.set(row.conversation_external_id, current);
    }
  }

  return map;
}

async function fetchProductRows(companyId: string, conversationIds: string[]): Promise<ProductReportRow[]> {
  const rows: ProductReportRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('product_intelligence_reports')
      .select('conversation_id, produto_citado, produto_interesse, produtos_comparados, motivo_interesse, dificuldade_entendimento, barreiras_produto, objecao_tratada, oportunidade_perdida')
      .eq('company_id', companyId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load product intelligence reports: ${error.message}`);
    }

    rows.push(...((data ?? []) as ProductReportRow[]));
  }
  return rows;
}

async function fetchCustomerRows(companyId: string, conversationIds: string[]): Promise<CustomerReportRow[]> {
  const rows: CustomerReportRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('customer_intelligence_reports')
      .select('conversation_id, intencao_principal, estagio_funil, nivel_interesse, sensibilidade_preco, urgencia, perfil_comportamental, principais_duvidas, principais_objecoes, motivadores_compra, risco_perda, oportunidade_perdida')
      .eq('company_id', companyId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load customer intelligence reports: ${error.message}`);
    }

    rows.push(...((data ?? []) as CustomerReportRow[]));
  }
  return rows;
}

async function fetchSignalRows(companyId: string, conversationIds: string[]): Promise<SignalRow[]> {
  const rows: SignalRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('deal_signals')
      .select('conversation_id, loss_risk_level, intent_level, close_probability, estimated_value, stage')
      .eq('company_id', companyId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load deal signals: ${error.message}`);
    }

    rows.push(...((data ?? []) as SignalRow[]));
  }
  return rows;
}

async function fetchOutcomeRows(companyId: string, conversationIds: string[]): Promise<OutcomeRow[]> {
  const rows: OutcomeRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('revenue_outcomes')
      .select('conversation_id, outcome, value, loss_reason')
      .eq('company_id', companyId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load revenue outcomes: ${error.message}`);
    }

    rows.push(...((data ?? []) as OutcomeRow[]));
  }
  return rows;
}

function buildConversationMemory(
  conversation: CandidateConversation,
  messages: RawMessageRow[],
  productRow: ProductReportRow | null,
  customerRow: CustomerReportRow | null,
  signalRow: SignalRow | null,
  outcomeRow: OutcomeRow | null,
): ConversationMemory {
  return {
    conversation_id: conversation.conversation_id,
    started_at: conversation.started_at,
    agent_name: sanitizeText(conversation.agent_name, 120) || null,
    customer_name: sanitizeText(conversation.customer_name, 120) || null,
    customer_phone_masked: maskPhone(conversation.customer_phone),
    product_cited: sanitizeText(productRow?.produto_citado, 120) || null,
    product_interest: sanitizeText(productRow?.produto_interesse, 120) || null,
    products_compared: sanitizeStringArray(productRow?.produtos_comparados, 5, 100),
    interest_reason: sanitizeText(productRow?.motivo_interesse, 180) || null,
    difficulty_understanding: productRow?.dificuldade_entendimento ?? null,
    product_barriers: sanitizeStringArray(productRow?.barreiras_produto, 6, 120),
    customer_questions: sanitizeStringArray(customerRow?.principais_duvidas, 6, 120),
    customer_objections: sanitizeStringArray(customerRow?.principais_objecoes, 6, 120),
    customer_motivators: sanitizeStringArray(customerRow?.motivadores_compra, 6, 120),
    customer_intent: sanitizeText(customerRow?.intencao_principal, 140) || null,
    customer_profile: sanitizeText(customerRow?.perfil_comportamental, 80) || null,
    urgency: sanitizeText(customerRow?.urgencia, 40) || null,
    interest_level: sanitizeText(customerRow?.nivel_interesse, 40) || null,
    loss_risk: sanitizeText(signalRow?.loss_risk_level ?? customerRow?.risco_perda, 40) || null,
    signal_stage: sanitizeText(signalRow?.stage ?? customerRow?.estagio_funil, 80) || null,
    outcome: sanitizeText(outcomeRow?.outcome, 40) || null,
    loss_reason: sanitizeText(outcomeRow?.loss_reason, 180) || null,
    estimated_value: clampNumber(signalRow?.estimated_value ?? outcomeRow?.value, 0, 999999999, 2),
    opening_excerpt: buildSnippet(messages, true),
    customer_excerpt: buildSpeakerSnippet(messages, 'customer'),
    closing_excerpt: buildSnippet(messages, false),
    opportunity_lost: productRow?.oportunidade_perdida === true || customerRow?.oportunidade_perdida === true || outcomeRow?.outcome === 'lost',
    objection_treated: productRow?.objecao_tratada ?? null,
  };
}

function buildSupportSummary(memories: ConversationMemory[]): ProductSupportSummary {
  const total = memories.length;
  const analyzedConversations = memories.filter((memory) =>
    memory.product_interest ||
    memory.product_cited ||
    memory.customer_questions.length > 0 ||
    memory.customer_objections.length > 0 ||
    memory.customer_motivators.length > 0 ||
    memory.customer_intent ||
    memory.loss_reason,
  ).length;

  const highDifficultyCount = memories.filter((memory) => memory.difficulty_understanding === 'alto').length;
  const lostOpportunityCount = memories.filter((memory) => memory.opportunity_lost).length;
  const objectionTreatedCount = memories.filter((memory) => memory.objection_treated === true).length;
  const highRiskCount = memories.filter((memory) => memory.loss_risk === 'alto').length;
  const wonCount = memories.filter((memory) => memory.outcome === 'won').length;
  const avgCloseProbability = average(
    memories.map((memory) => (memory.estimated_value != null ? Math.min(100, Math.max(0, memory.estimated_value / 1000)) : null)),
  );

  return {
    total_conversations: total,
    analyzed_conversations: analyzedConversations,
    high_difficulty_rate: computeRate(highDifficultyCount, total),
    lost_opportunity_rate: computeRate(lostOpportunityCount, total),
    objection_treated_rate: computeRate(objectionTreatedCount, total),
    high_risk_rate: computeRate(highRiskCount, total),
    won_rate: computeRate(wonCount, total),
    avg_close_probability: avgCloseProbability != null ? roundRate(avgCloseProbability) : null,
    top_products: collectBuckets(memories, (memory) => [memory.product_interest, memory.product_cited]),
    top_interest_reasons: collectBuckets(memories, (memory) => [memory.interest_reason]),
    top_barriers: collectBuckets(memories, (memory) => memory.product_barriers),
    top_doubts: collectBuckets(memories, (memory) => memory.customer_questions),
    top_objections: collectBuckets(memories, (memory) => memory.customer_objections),
    top_motivators: collectBuckets(memories, (memory) => memory.customer_motivators),
    top_profiles: collectBuckets(memories, (memory) => [memory.customer_profile]),
    top_customer_intents: collectBuckets(memories, (memory) => [memory.customer_intent]),
    top_loss_reasons: collectBuckets(memories, (memory) => [memory.loss_reason]),
  };
}

function strategicItemFromBucket(
  bucket: CountBucket,
  totalConversations: number,
  summary: string,
  cause: CauseLevel,
  overrideSeverity?: SeverityLevel,
): StrategicItem {
  const rate = computeRate(bucket.count, totalConversations);
  const severity = overrideSeverity ?? severityFromRate(rate);
  return {
    title: bucket.label,
    summary,
    frequency: bucket.count,
    impact: rate >= 25 ? 'Alto impacto potencial sobre percepcao e conversao.' : rate >= 10 ? 'Impacto moderado e recorrente.' : 'Impacto localizado, mas repetido.',
    urgency: urgencyFromSeverity(severity),
    severity,
    likely_cause: cause,
    evidence_conversation_ids: bucket.conversation_ids,
  };
}

function buildProfileItems(summary: ProductSupportSummary): ClientProfileItem[] {
  return summary.top_profiles.slice(0, 4).map((bucket) => ({
    profile: bucket.label,
    what_they_seek: `Busca previsibilidade, clareza e aderencia ao seu contexto em ${bucket.count} conversas do periodo.`,
    main_blockers: 'Tende a travar quando o valor nao fica claro ou quando a oferta parece mais complexa que o necessario.',
    best_approach: 'Explicar resultado pratico, reduzir ambiguidade e mostrar aplicacao direta para o perfil.',
    frequency: bucket.count,
  }));
}

function buildDecisionItems(summary: ProductSupportSummary): DecisionItem[] {
  const decisions: DecisionItem[] = [];

  if (summary.top_barriers[0]) {
    decisions.push({
      title: `Simplificar a comunicacao sobre ${summary.top_barriers[0].label}`,
      why_now: `Essa barreira apareceu em ${summary.top_barriers[0].count} conversas e esta puxando ruido de entendimento.`,
      expected_impact: 'Reduzir friccao inicial e acelerar avancos de conversa.',
      urgency: 'alta',
      evidence_conversation_ids: summary.top_barriers[0].conversation_ids,
    });
  }

  if (summary.top_objections[0]) {
    decisions.push({
      title: `Reforcar argumento comercial contra "${summary.top_objections[0].label}"`,
      why_now: `A objecao lider aparece em ${summary.top_objections[0].count} conversas e trava a percepcao de valor.`,
      expected_impact: 'Diminuir perdas evitaveis e melhorar taxa de continuidade.',
      urgency: 'alta',
      evidence_conversation_ids: summary.top_objections[0].conversation_ids,
    });
  }

  if (summary.top_doubts[0]) {
    decisions.push({
      title: `Criar material de apoio para responder "${summary.top_doubts[0].label}"`,
      why_now: `A duvida reaparece em ${summary.top_doubts[0].count} conversas e sinaliza explicacao insuficiente.`,
      expected_impact: 'Ganhar clareza e reduzir necessidade de retrabalho comercial.',
      urgency: 'media',
      evidence_conversation_ids: summary.top_doubts[0].conversation_ids,
    });
  }

  if (summary.top_motivators[0]) {
    decisions.push({
      title: `Ampliar o destaque do beneficio "${summary.top_motivators[0].label}"`,
      why_now: `Esse motivo concentra a maior parte do interesse real nas conversas do periodo.`,
      expected_impact: 'Aumentar aderencia do discurso comercial e do posicionamento.',
      urgency: 'media',
      evidence_conversation_ids: summary.top_motivators[0].conversation_ids,
    });
  }

  if (summary.top_products[0]) {
    decisions.push({
      title: `Revisar posicionamento e onboarding do produto "${summary.top_products[0].label}"`,
      why_now: 'O produto mais citado merece jornada e comunicacao proporcionais ao volume de interesse.',
      expected_impact: 'Melhor alinhamento entre interesse, entendimento e conversao.',
      urgency: 'media',
      evidence_conversation_ids: summary.top_products[0].conversation_ids,
    });
  }

  return decisions.slice(0, MAX_DECISIONS);
}

function buildEmptyProductReport(): ProductStrategicReport {
  return {
    resumo_executivo: 'Nao houve conversas elegiveis no periodo. Sem base de conversa, nao existe inteligencia de produto confiavel para tomada de decisao.',
    percepcao_geral_produto: {
      clareza: 'Sem base suficiente.',
      valor_percebido: 'Sem base suficiente.',
      interesse_gerado: 'Sem base suficiente.',
      principal_risco: 'Sem base suficiente.',
      principal_oportunidade: 'Sem base suficiente.',
    },
    clientes_buscam: [],
    principais_dores: [],
    duvidas_frequentes: [],
    objecoes_frequentes: [],
    valor_percebido: [],
    pontos_de_confusao: [],
    melhorias_de_produto: [],
    melhorias_de_oferta_e_comunicacao: [],
    perfis_de_cliente: [],
    sinais_estrategicos: [],
    top_5_decisoes_recomendadas: [],
    totals: {
      conversations_considered: 0,
      analyzed_conversations: 0,
      evidence_items: 0,
    },
  };
}

function buildFallbackProductReport(summary: ProductSupportSummary): ProductStrategicReport {
  const topProduct = summary.top_products[0]?.label ?? 'o produto principal';
  const topMotivator = summary.top_motivators[0]?.label ?? 'ganho pratico e clareza de resultado';
  const topBarrier = summary.top_barriers[0]?.label ?? 'ruido de entendimento da oferta';

  return {
    resumo_executivo:
      `O periodo mostra que o produto esta sendo lido pelo mercado com interesse real, mas ainda com atrito de clareza e objecoes recorrentes. ` +
      `O que mais atrai hoje e "${topMotivator}", enquanto o que mais trava e "${topBarrier}". ` +
      `O principal risco atual e a empresa perder avancos por ruido de comunicacao e valor insuficientemente sustentado. ` +
      `A principal oportunidade e simplificar o discurso e reforcar os beneficios que o cliente ja esta sinalizando como valiosos.`,
    percepcao_geral_produto: {
      clareza: summary.high_difficulty_rate >= 30
        ? 'O produto ainda chega confuso em parte relevante das conversas. Ha ruido recorrente de entendimento.'
        : 'O produto nao parece completamente opaco, mas ainda exige explicacao ativa para ganhar clareza.',
      valor_percebido: summary.top_motivators.length
        ? `O valor e percebido principalmente por "${topMotivator}", mas a sustentacao ainda oscila quando surgem objecoes.`
        : 'Existe interesse, mas o valor percebido ainda nao aparece de forma nitida nas conversas.',
      interesse_gerado: summary.top_products.length
        ? `Existe interesse real em "${topProduct}", com procura repetida ao longo do periodo.`
        : 'O interesse aparece mais como curiosidade do que como desejo claramente ancorado.',
      principal_risco: summary.lost_opportunity_rate >= 25
        ? 'A operacao esta deixando interesse virar conversa morna por falta de clareza e contorno de objecoes.'
        : 'O principal risco e o produto parecer mais complexo ou menos prioritario do que deveria.',
      principal_oportunidade: summary.top_motivators.length
        ? `Amplificar e simplificar a comunicacao do beneficio "${topMotivator}" para aumentar aderencia.`
        : 'Transformar curiosidade dispersa em proposta de valor mais objetiva.',
    },
    clientes_buscam: (summary.top_motivators.length ? summary.top_motivators : summary.top_products).slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Tema recorrente quando o cliente explica o que quer ganhar ao comprar.', 'posicionamento'),
    ),
    principais_dores: (summary.top_customer_intents.length ? summary.top_customer_intents : summary.top_barriers).slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Esse padrao aparece como necessidade, trava ou dor principal por tras da compra.', classifyCause(bucket.label, 'produto')),
    ),
    duvidas_frequentes: summary.top_doubts.slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Duvida recorrente que atrasa entendimento, confianca ou avancar da conversa.', classifyCause(bucket.label, 'comunicacao')),
    ),
    objecoes_frequentes: (summary.top_objections.length ? summary.top_objections : summary.top_barriers).slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Objecao repetida no periodo, com impacto direto sobre valor percebido e continuidade.', classifyCause(bucket.label, 'preco')),
    ),
    valor_percebido: summary.top_motivators.slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Beneficio ou ganho que o cliente efetivamente reconhece como valor.', 'posicionamento', 'medium'),
    ),
    pontos_de_confusao: (summary.top_barriers.length ? summary.top_barriers : summary.top_doubts).slice(0, 4).map((bucket) =>
      strategicItemFromBucket(bucket, summary.total_conversations, 'Ponto com ruido de entendimento, linguagem ou posicionamento do produto.', classifyCause(bucket.label, 'comunicacao')),
    ),
    melhorias_de_produto: (summary.top_barriers.length ? summary.top_barriers : summary.top_loss_reasons).slice(0, 4).map((bucket): StrategicItem => ({
      title: `Revisar ${bucket.label}`,
      summary: 'As conversas sugerem necessidade de simplificacao, clareza funcional ou ajuste de experiencia.',
      frequency: bucket.count,
      impact: 'Pode aumentar valor percebido e reduzir travas repetidas.',
      urgency: 'media',
      severity: severityFromRate(computeRate(bucket.count, summary.total_conversations)),
      likely_cause: classifyCause(bucket.label, 'produto'),
      evidence_conversation_ids: bucket.conversation_ids,
    })),
    melhorias_de_oferta_e_comunicacao: (summary.top_doubts.length ? summary.top_doubts : summary.top_objections).slice(0, 4).map((bucket): StrategicItem => ({
      title: `Ajustar comunicacao sobre ${bucket.label}`,
      summary: 'O problema parece mais ligado a explicacao, oferta ou framing do que a ausencia de interesse.',
      frequency: bucket.count,
      impact: 'Reduz atrito comercial e melhora entendimento do mercado.',
      urgency: 'alta',
      severity: severityFromRate(computeRate(bucket.count, summary.total_conversations)),
      likely_cause: classifyCause(bucket.label, 'comunicacao'),
      evidence_conversation_ids: bucket.conversation_ids,
    })),
    perfis_de_cliente: buildProfileItems(summary),
    sinais_estrategicos: ([
      {
        title: 'Clareza do produto',
        summary: `${summary.high_difficulty_rate}% das conversas mostram dificuldade alta de entendimento.`,
        frequency: Math.round((summary.high_difficulty_rate / 100) * summary.total_conversations),
        impact: 'Afeta entendimento e retarda percepcao de valor.',
        urgency: summary.high_difficulty_rate >= 30 ? 'alta' : 'media',
        severity: severityFromRate(summary.high_difficulty_rate),
        likely_cause: 'comunicacao' as CauseLevel,
        evidence_conversation_ids: summary.top_doubts[0]?.conversation_ids ?? summary.top_barriers[0]?.conversation_ids ?? [],
      },
      {
        title: 'Perda de oportunidade',
        summary: `${summary.lost_opportunity_rate}% das conversas sinalizam perda evitavel ou falta de avancar.`,
        frequency: Math.round((summary.lost_opportunity_rate / 100) * summary.total_conversations),
        impact: 'Converte interesse em conversa morna e devolve dinheiro para a mesa.',
        urgency: summary.lost_opportunity_rate >= 20 ? 'alta' : 'media',
        severity: severityFromRate(summary.lost_opportunity_rate),
        likely_cause: 'atendimento' as CauseLevel,
        evidence_conversation_ids: summary.top_objections[0]?.conversation_ids ?? [],
      },
      {
        title: 'Valor percebido',
        summary: summary.top_motivators[0]
          ? `O mercado reage melhor ao beneficio "${summary.top_motivators[0].label}".`
          : 'O beneficio dominante ainda nao esta claramente estabilizado.',
        frequency: summary.top_motivators[0]?.count ?? null,
        impact: 'Indica o eixo de mensagem com maior chance de ganhar tracao.',
        urgency: 'media',
        severity: 'medium' as SeverityLevel,
        likely_cause: 'posicionamento' as CauseLevel,
        evidence_conversation_ids: summary.top_motivators[0]?.conversation_ids ?? [],
      },
      {
        title: 'Pressao de objecoes',
        summary: summary.top_objections[0]
          ? `A objecao lider do periodo foi "${summary.top_objections[0].label}".`
          : 'As objecoes nao se consolidaram em um unico tema dominante.',
        frequency: summary.top_objections[0]?.count ?? null,
        impact: 'Mostra onde a oferta e o argumento estao falhando em sustentacao.',
        urgency: 'alta',
        severity: summary.top_objections[0]
          ? severityFromRate(computeRate(summary.top_objections[0].count, summary.total_conversations))
          : 'medium',
        likely_cause: classifyCause(summary.top_objections[0]?.label ?? '', 'preco'),
        evidence_conversation_ids: summary.top_objections[0]?.conversation_ids ?? [],
      },
    ] as StrategicItem[]).slice(0, 4),
    top_5_decisoes_recomendadas: buildDecisionItems(summary),
    totals: {
      conversations_considered: summary.total_conversations,
      analyzed_conversations: summary.analyzed_conversations,
      evidence_items: Math.min(summary.total_conversations, MAX_MEMORY_PAYLOAD),
    },
  };
}

async function callClaudeForProductIntelligence(
  periodStart: string,
  periodEnd: string,
  supportSummary: ProductSupportSummary,
  memories: ConversationMemory[],
): Promise<Partial<ProductStrategicReport>> {
  if (!config.anthropicApiKey) {
    return {};
  }

  const systemPrompt =
    'Voce e uma IA especialista em analise de produto, inteligencia de mercado, comportamento do cliente e atendimento comercial. ' +
    'Sua funcao e analisar conversas de todos os atendentes para extrair inteligencia estrategica sobre produto, oferta, posicionamento, comunicacao e mercado. ' +
    'Nao resuma conversa por conversa. Analise o conjunto, detecte padroes recorrentes, frequencia, impacto e urgencia. ' +
    'Sempre diferencie a causa mais provavel entre produto, comunicacao, posicionamento, oferta, atendimento, preco e expectativa. ' +
    'Retorne apenas JSON valido, sem markdown nem texto extra. Responda em portugues.';

  const userPrompt =
    `Periodo analisado: ${periodStart} ate ${periodEnd}\n\n` +
    'Objetivo:\n' +
    '- descobrir como os clientes percebem o produto\n' +
    '- entender o que mais atrai, o que mais trava, o que mais gera duvida e objecao\n' +
    '- separar o que parece problema de produto, comunicacao, posicionamento, oferta, atendimento, preco ou expectativa\n' +
    '- transformar conversas em inteligencia pratica para tomada de decisao\n\n' +
    `Resumo agregado do periodo:\n${JSON.stringify(supportSummary, null, 2)}\n\n` +
    `Memorias compactas de evidencia:\n${JSON.stringify(buildPromptMemories(memories), null, 2)}\n\n` +
    'Gere exatamente este JSON:\n' +
    '{\n' +
    '  "resumo_executivo": "texto objetivo em poucas linhas",\n' +
    '  "percepcao_geral_produto": {\n' +
    '    "clareza": "como o produto esta sendo entendido",\n' +
    '    "valor_percebido": "como o valor esta sendo percebido",\n' +
    '    "interesse_gerado": "se gera interesse real ou curiosidade fraca",\n' +
    '    "principal_risco": "principal risco atual",\n' +
    '    "principal_oportunidade": "principal oportunidade atual"\n' +
    '  },\n' +
    '  "clientes_buscam": [{"title":"tema","summary":"explicacao objetiva","frequency":0,"impact":"impacto","urgency":"alta|media|baixa","severity":"critical|high|medium|low","likely_cause":"produto|comunicacao|posicionamento|oferta|atendimento|preco|expectativa","evidence_conversation_ids":["uuid"]}],\n' +
    '  "principais_dores": [],\n' +
    '  "duvidas_frequentes": [],\n' +
    '  "objecoes_frequentes": [],\n' +
    '  "valor_percebido": [],\n' +
    '  "pontos_de_confusao": [],\n' +
    '  "melhorias_de_produto": [],\n' +
    '  "melhorias_de_oferta_e_comunicacao": [],\n' +
    '  "perfis_de_cliente": [{"profile":"perfil","what_they_seek":"busca","main_blockers":"travas","best_approach":"abordagem","frequency":0}],\n' +
    '  "sinais_estrategicos": [],\n' +
    '  "top_5_decisoes_recomendadas": [{"title":"decisao","why_now":"por que agora","expected_impact":"impacto esperado","urgency":"alta|media|baixa","evidence_conversation_ids":["uuid"]}]\n' +
    '}\n\n' +
    'Regras:\n' +
    '- seja estrategico, claro e objetivo\n' +
    '- nao elogie por educacao\n' +
    '- nao invente conclusoes sem padrao observavel\n' +
    '- nao trate caso isolado como verdade geral\n' +
    '- destaque frequencia, impacto e relevancia\n' +
    '- foque no que a empresa precisa decidir primeiro\n' +
    '- cite apenas conversation_id reais presentes nas memorias compactas';

  const response = await getAnthropicClient().messages.create({
    model: PRODUCT_INTELLIGENCE_MODEL,
    max_tokens: 3600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude.');
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return JSON: ${content.text.slice(0, 260)}`);
  }

  return JSON.parse(jsonMatch[0]) as Partial<ProductStrategicReport>;
}

function sanitizeCause(value: unknown): CauseLevel {
  const candidate = sanitizeText(value, 40) as CauseLevel;
  const allowed: CauseLevel[] = ['produto', 'comunicacao', 'posicionamento', 'oferta', 'atendimento', 'preco', 'expectativa'];
  return allowed.includes(candidate) ? candidate : 'comunicacao';
}

function sanitizeSeverity(value: unknown): SeverityLevel {
  const candidate = sanitizeText(value, 20) as SeverityLevel;
  const allowed: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];
  return allowed.includes(candidate) ? candidate : 'medium';
}

function sanitizeEvidenceIds(value: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, 80))
    .filter((item) => validIds.has(item))
    .slice(0, 5);
}

function mergeStrategicItems(parsed: unknown, fallback: StrategicItem[], validIds: Set<string>): StrategicItem[] {
  if (!Array.isArray(parsed)) return fallback;
  const merged = parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      title: sanitizeText(item.title, 120),
      summary: sanitizeText(item.summary, 260),
      frequency: clampNumber(item.frequency, 0, 999999, 0),
      impact: sanitizeText(item.impact, 220),
      urgency: sanitizeText(item.urgency, 20) || 'media',
      severity: sanitizeSeverity(item.severity),
      likely_cause: sanitizeCause(item.likely_cause),
      evidence_conversation_ids: sanitizeEvidenceIds(item.evidence_conversation_ids, validIds),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, MAX_ITEMS_PER_SECTION);

  return merged.length ? merged : fallback;
}

function mergeProfiles(parsed: unknown, fallback: ClientProfileItem[]): ClientProfileItem[] {
  if (!Array.isArray(parsed)) return fallback;
  const merged = parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      profile: sanitizeText(item.profile, 120),
      what_they_seek: sanitizeText(item.what_they_seek, 220),
      main_blockers: sanitizeText(item.main_blockers, 220),
      best_approach: sanitizeText(item.best_approach, 220),
      frequency: clampNumber(item.frequency, 0, 999999, 0),
    }))
    .filter((item) => item.profile.length > 0)
    .slice(0, 4);

  return merged.length ? merged : fallback;
}

function mergeDecisions(parsed: unknown, fallback: DecisionItem[], validIds: Set<string>): DecisionItem[] {
  if (!Array.isArray(parsed)) return fallback;
  const merged = parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      title: sanitizeText(item.title, 140),
      why_now: sanitizeText(item.why_now, 260),
      expected_impact: sanitizeText(item.expected_impact, 220),
      urgency: sanitizeText(item.urgency, 20) || 'media',
      evidence_conversation_ids: sanitizeEvidenceIds(item.evidence_conversation_ids, validIds),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, MAX_DECISIONS);

  return merged.length ? merged : fallback;
}

function mergeProductReport(
  parsed: Partial<ProductStrategicReport>,
  fallback: ProductStrategicReport,
  validIds: Set<string>,
): ProductStrategicReport {
  const overview = isRecord(parsed.percepcao_geral_produto)
    ? {
      clareza: sanitizeText(parsed.percepcao_geral_produto.clareza, 240) || fallback.percepcao_geral_produto.clareza,
      valor_percebido: sanitizeText(parsed.percepcao_geral_produto.valor_percebido, 240) || fallback.percepcao_geral_produto.valor_percebido,
      interesse_gerado: sanitizeText(parsed.percepcao_geral_produto.interesse_gerado, 240) || fallback.percepcao_geral_produto.interesse_gerado,
      principal_risco: sanitizeText(parsed.percepcao_geral_produto.principal_risco, 240) || fallback.percepcao_geral_produto.principal_risco,
      principal_oportunidade: sanitizeText(parsed.percepcao_geral_produto.principal_oportunidade, 240) || fallback.percepcao_geral_produto.principal_oportunidade,
    }
    : fallback.percepcao_geral_produto;

  return {
    resumo_executivo: sanitizeText(parsed.resumo_executivo, 600) || fallback.resumo_executivo,
    percepcao_geral_produto: overview,
    clientes_buscam: mergeStrategicItems(parsed.clientes_buscam, fallback.clientes_buscam, validIds),
    principais_dores: mergeStrategicItems(parsed.principais_dores, fallback.principais_dores, validIds),
    duvidas_frequentes: mergeStrategicItems(parsed.duvidas_frequentes, fallback.duvidas_frequentes, validIds),
    objecoes_frequentes: mergeStrategicItems(parsed.objecoes_frequentes, fallback.objecoes_frequentes, validIds),
    valor_percebido: mergeStrategicItems(parsed.valor_percebido, fallback.valor_percebido, validIds),
    pontos_de_confusao: mergeStrategicItems(parsed.pontos_de_confusao, fallback.pontos_de_confusao, validIds),
    melhorias_de_produto: mergeStrategicItems(parsed.melhorias_de_produto, fallback.melhorias_de_produto, validIds),
    melhorias_de_oferta_e_comunicacao: mergeStrategicItems(parsed.melhorias_de_oferta_e_comunicacao, fallback.melhorias_de_oferta_e_comunicacao, validIds),
    perfis_de_cliente: mergeProfiles(parsed.perfis_de_cliente, fallback.perfis_de_cliente),
    sinais_estrategicos: mergeStrategicItems(parsed.sinais_estrategicos, fallback.sinais_estrategicos, validIds),
    top_5_decisoes_recomendadas: mergeDecisions(parsed.top_5_decisoes_recomendadas, fallback.top_5_decisoes_recomendadas, validIds),
    totals: fallback.totals,
  };
}

function buildItemMarkdown(item: StrategicItem): string {
  const evidence = item.evidence_conversation_ids.length
    ? ` Evidencias: ${item.evidence_conversation_ids
      .slice(0, 3)
      .map((conversationId) => `[${conversationId.slice(0, 8)}](/conversations/${conversationId})`)
      .join(', ')}.`
    : '';
  return `- **${item.title}** (${item.frequency ?? '--'} ocorrencias, severidade ${item.severity}, causa ${item.likely_cause}) - ${item.summary}${evidence}`;
}

function buildProductMarkdown(periodStart: string, periodEnd: string, report: ProductStrategicReport): string {
  const section = (title: string, items: StrategicItem[]) => [
    `**${title}**`,
    ...(items.length ? items.map(buildItemMarkdown) : ['- Sem sinais suficientes neste bloco.']),
    '',
  ];

  const profilesSection = report.perfis_de_cliente.length
    ? report.perfis_de_cliente.map((profile) =>
      `- **${profile.profile}** - Busca: ${profile.what_they_seek}. Trava: ${profile.main_blockers}. Melhor abordagem: ${profile.best_approach}.`,
    )
    : ['- Perfis ainda nao consolidados.'];

  const decisionsSection = report.top_5_decisoes_recomendadas.length
    ? report.top_5_decisoes_recomendadas.map((decision, index) => {
      const evidence = decision.evidence_conversation_ids.length
        ? ` Evidencias: ${decision.evidence_conversation_ids
          .slice(0, 3)
          .map((conversationId) => `[${conversationId.slice(0, 8)}](/conversations/${conversationId})`)
          .join(', ')}.`
        : '';
      return `${index + 1}. **${decision.title}** - ${decision.why_now} Impacto esperado: ${decision.expected_impact}.${evidence}`;
    })
    : ['1. Consolidar mais base de conversa antes de decidir mudancas maiores.'];

  return [
    '### Inteligencia de produto',
    '',
    `Periodo: ${periodStart} ate ${periodEnd}`,
    '',
    '**Resumo executivo**',
    report.resumo_executivo,
    '',
    '**O que voce precisa saber agora**',
    `- Clareza: ${report.percepcao_geral_produto.clareza}`,
    `- Valor percebido: ${report.percepcao_geral_produto.valor_percebido}`,
    `- Interesse gerado: ${report.percepcao_geral_produto.interesse_gerado}`,
    `- Principal risco: ${report.percepcao_geral_produto.principal_risco}`,
    `- Principal oportunidade: ${report.percepcao_geral_produto.principal_oportunidade}`,
    '',
    ...section('O que os clientes mais buscam', report.clientes_buscam),
    ...section('Principais dores dos clientes', report.principais_dores),
    ...section('Duvidas mais frequentes', report.duvidas_frequentes),
    ...section('Objecoes mais frequentes', report.objecoes_frequentes),
    ...section('Valor percebido pelos clientes', report.valor_percebido),
    ...section('Pontos de confusao', report.pontos_de_confusao),
    ...section('Oportunidades de melhoria de produto', report.melhorias_de_produto),
    ...section('Oportunidades de melhoria na oferta e comunicacao', report.melhorias_de_oferta_e_comunicacao),
    '**Perfis de cliente identificados**',
    ...profilesSection,
    '',
    ...section('Sinais estrategicos para tomada de decisao', report.sinais_estrategicos),
    '**Top 5 decisoes recomendadas**',
    ...decisionsSection,
  ].join('\n');
}

async function updateRun(runId: string, updates: Partial<ProductIntelligenceRunRow>): Promise<void> {
  const { error } = await supabase
    .schema('app')
    .from('product_intelligence_runs')
    .update(updates)
    .eq('id', runId);

  if (error) {
    throw new Error(`Failed to update product intelligence run ${runId}: ${error.message}`);
  }
}

async function findFreshCompletedProductRun(
  params: { companyId: string; periodStart: string; periodEnd: string },
  excludeRunId?: string,
): Promise<ProductIntelligenceRunRow | null> {
  let query = supabase
    .schema('app')
    .from('product_intelligence_runs')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('period_start', params.periodStart)
    .eq('period_end', params.periodEnd)
    .eq('prompt_version', PRODUCT_INTELLIGENCE_PROMPT_VERSION)
    .eq('status', 'completed')
    .gte('created_at', new Date(Date.now() - PRODUCT_INTELLIGENCE_FRESH_HOURS * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (excludeRunId) {
    query = query.neq('id', excludeRunId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to query fresh product intelligence runs: ${error.message}`);
  }

  return (data as ProductIntelligenceRunRow | null) ?? null;
}

async function generateProductIntelligence(
  run: ProductIntelligenceRunRow,
): Promise<{ report: ProductStrategicReport; markdown: string; totalConversations: number; analyzedCount: number; failedCount: number }> {
  const settings = await getCompanyProductSettings(run.company_id);
  const companyTimezone = sanitizeText(run.company_timezone, 80) || settings.timezone;
  const conversations = await loadCandidateConversations({
    companyId: run.company_id,
    periodStart: run.period_start,
    periodEnd: run.period_end,
    companyTimezone,
    blockedNumbers: settings.blockedNumbers,
  });

  const totalConversations = conversations.length;
  if (totalConversations === 0) {
    const report = buildEmptyProductReport();
    return {
      report,
      markdown: buildProductMarkdown(run.period_start, run.period_end, report),
      totalConversations: 0,
      analyzedCount: 0,
      failedCount: 0,
    };
  }

  const conversationIds = conversations.map((conversation) => conversation.conversation_id);
  const rawConversationIds = conversations.map((conversation) => conversation.raw_conversation_id);

  const [productRows, customerRows, signalRows, outcomeRows, externalIdMap] = await Promise.all([
    fetchProductRows(run.company_id, conversationIds),
    fetchCustomerRows(run.company_id, conversationIds),
    fetchSignalRows(run.company_id, conversationIds),
    fetchOutcomeRows(run.company_id, conversationIds),
    fetchRawConversationExternalIds(rawConversationIds),
  ]);

  const rawMessagesMap = await fetchRawMessages(run.company_id, Array.from(externalIdMap.values()));
  const productByConversation = mapRowsByConversation(productRows);
  const customerByConversation = mapRowsByConversation(customerRows);
  const signalByConversation = mapRowsByConversation(signalRows);
  const outcomeByConversation = mapRowsByConversation(outcomeRows);

  const memories: ConversationMemory[] = [];
  let failedCount = 0;

  for (let index = 0; index < conversations.length; index += 1) {
    const conversation = conversations[index];
    try {
      const externalId = externalIdMap.get(conversation.raw_conversation_id);
      const messages = externalId ? rawMessagesMap.get(externalId) ?? [] : [];
      memories.push(
        buildConversationMemory(
          conversation,
          messages,
          productByConversation.get(conversation.conversation_id) ?? null,
          customerByConversation.get(conversation.conversation_id) ?? null,
          signalByConversation.get(conversation.conversation_id) ?? null,
          outcomeByConversation.get(conversation.conversation_id) ?? null,
        ),
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[ProductIntelligence] Failed to build memory for conversation ${conversation.conversation_id}:`, error);
    }

    if ((index + 1) % 10 === 0 || index === conversations.length - 1) {
      await updateRun(run.id, {
        total_conversations: totalConversations,
        processed_count: index + 1,
        analyzed_count: memories.length,
        failed_count: failedCount,
      });
    }
  }

  const supportSummary = buildSupportSummary(memories);
  const fallbackReport = buildFallbackProductReport(supportSummary);

  let parsedReport: Partial<ProductStrategicReport> = {};
  try {
    parsedReport = await callClaudeForProductIntelligence(run.period_start, run.period_end, supportSummary, memories);
  } catch (error) {
    console.error(`[ProductIntelligence] Claude generation failed for run ${run.id}, using fallback report:`, error);
  }

  const validIds = new Set(memories.map((memory) => memory.conversation_id));
  const report = mergeProductReport(parsedReport, fallbackReport, validIds);

  return {
    report,
    markdown: buildProductMarkdown(run.period_start, run.period_end, report),
    totalConversations,
    analyzedCount: memories.length,
    failedCount,
  };
}

async function completeRun(
  runId: string,
  report: ProductStrategicReport,
  markdown: string,
  totalConversations: number,
  analyzedCount: number,
  failedCount: number,
): Promise<void> {
  await updateRun(runId, {
    status: 'completed',
    total_conversations: totalConversations,
    processed_count: totalConversations,
    analyzed_count: analyzedCount,
    failed_count: failedCount,
    report_json: report as unknown as Record<string, unknown>,
    report_markdown: markdown,
    model_used: PRODUCT_INTELLIGENCE_MODEL,
    prompt_version: PRODUCT_INTELLIGENCE_PROMPT_VERSION,
    error_message: null,
    finished_at: new Date().toISOString(),
  });
}

async function failRun(runId: string, run: ProductIntelligenceRunRow, errorMessage: string): Promise<void> {
  await updateRun(runId, {
    status: 'failed',
    total_conversations: run.total_conversations ?? 0,
    processed_count: run.processed_count ?? 0,
    analyzed_count: run.analyzed_count ?? 0,
    failed_count: run.failed_count ?? 0,
    error_message: errorMessage,
    finished_at: new Date().toISOString(),
  });
}

async function reuseFreshRun(currentRun: ProductIntelligenceRunRow, existing: ProductIntelligenceRunRow): Promise<void> {
  await updateRun(currentRun.id, {
    status: 'completed',
    total_conversations: existing.total_conversations,
    processed_count: existing.total_conversations,
    analyzed_count: existing.analyzed_count,
    failed_count: existing.failed_count,
    report_json: existing.report_json,
    report_markdown: existing.report_markdown,
    model_used: existing.model_used,
    prompt_version: existing.prompt_version,
    error_message: null,
    finished_at: new Date().toISOString(),
  });
}

async function executeProductIntelligenceRun(run: ProductIntelligenceRunRow): Promise<ProductIntelligenceRunRow> {
  const fresh = await findFreshCompletedProductRun({
    companyId: run.company_id,
    periodStart: run.period_start,
    periodEnd: run.period_end,
  }, run.id);

  if (fresh) {
    await reuseFreshRun(run, fresh);
    const { data } = await supabase
      .schema('app')
      .from('product_intelligence_runs')
      .select('*')
      .eq('id', run.id)
      .single();
    return data as ProductIntelligenceRunRow;
  }

  try {
    const generated = await generateProductIntelligence(run);
    await completeRun(run.id, generated.report, generated.markdown, generated.totalConversations, generated.analyzedCount, generated.failedCount);
  } catch (error) {
    const message = trimErrorMessage(error);
    await failRun(run.id, run, message);
    throw error;
  }

  const { data, error } = await supabase
    .schema('app')
    .from('product_intelligence_runs')
    .select('*')
    .eq('id', run.id)
    .single();

  if (error || !data) {
    throw new Error(`Failed to reload product intelligence run ${run.id}: ${error?.message ?? 'not found'}`);
  }

  return data as ProductIntelligenceRunRow;
}

async function dequeueProductIntelligenceRun(): Promise<ProductIntelligenceRunRow | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_product_intelligence_run');

  if (error) {
    throw new Error(`[ProductIntelligence] Failed to dequeue run: ${error.message}`);
  }

  return coerceRpcSingleRow<ProductIntelligenceRunRow>(data);
}

export async function processProductIntelligenceRuns(): Promise<void> {
  const run = await dequeueProductIntelligenceRun();
  if (!run) {
    console.log('[ProductIntelligence] No queued product intelligence runs.');
    return;
  }

  try {
    await executeProductIntelligenceRun(run);
    console.log(`[ProductIntelligence] Run ${run.id} completed.`);
  } catch (error) {
    console.error(`[ProductIntelligence] Run ${run.id} failed:`, error);
  }
}
