import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

export const SELLER_AUDIT_MODEL = 'claude-haiku-4-5-20251001';
export const SELLER_AUDIT_PROMPT_VERSION = 'v1-manager-hard';
export const SELLER_AUDIT_FRESH_HOURS = 6;

const MAX_ERROR_MESSAGE_LENGTH = 2000;
const QUERY_CHUNK_SIZE = 150;
const RAW_MESSAGE_CHUNK_SIZE = 30;
const MAX_MESSAGE_LINES_PER_SNIPPET = 3;
const MAX_LINE_LENGTH = 150;
const MAX_EVIDENCE_SAMPLES = 6;
const MAX_OPPORTUNITIES = 8;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
type AuditSource = 'manual' | 'ai_analysis_auto' | 'manager_copilot';
type AlertLevel = 'verde' | 'amarelo' | 'laranja' | 'vermelho';
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

interface AISellerAuditRunRow {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  source: AuditSource;
  status: JobStatus;
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

interface AgentRow {
  id: string;
  name: string;
}

interface FeedbackConversation {
  conversation_id: string;
  company_id: string;
  agent_id: string;
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

interface AnalysisRow {
  conversation_id: string;
  quality_score: number | null;
  predicted_csat: number | null;
  needs_coaching: boolean;
  training_tags: string[] | null;
  score_empathy: number | null;
  score_professionalism: number | null;
  score_clarity: number | null;
  score_rapport: number | null;
  score_urgency: number | null;
  score_value_proposition: number | null;
  score_objection_handling: number | null;
  score_investigation: number | null;
  score_commercial_steering: number | null;
  structured_analysis: Record<string, unknown> | null;
}

interface MetricRow {
  conversation_id: string;
  first_response_time_sec: number | null;
  avg_response_gap_sec: number | null;
  sla_first_response_met: boolean | null;
}

interface SignalRow {
  conversation_id: string;
  loss_risk_level: 'baixo' | 'medio' | 'alto';
  intent_level: 'fria' | 'morna' | 'quente';
  close_probability: number | null;
  next_best_action: string | null;
  estimated_value: number | null;
  stage: string | null;
}

interface OutcomeRow {
  conversation_id: string;
  outcome: 'won' | 'lost' | 'open';
  value: number;
  loss_reason: string | null;
}

interface CompanyAuditSettings {
  timezone: string;
  blockedNumbers: Set<string>;
}

interface BehaviorFlags {
  close_attempted: boolean;
  follow_up_present: boolean;
  real_diagnosis: boolean;
  passive_response: boolean;
  objection_mishandled: boolean;
  abandoned_without_next_step: boolean;
}

interface CompetencyScores {
  opening: number | null;
  timing: number | null;
  authority: number | null;
  follow_up: number | null;
  closing: number | null;
}

interface SeverityFinding {
  tag: string;
  severity: SeverityLevel;
  evidence: string;
  impact: string;
}

interface LostOpportunity {
  conversation_id: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  what_happened: string;
  why_it_was_lost: string;
  what_should_have_been_done: string;
  impact: 'low' | 'medium' | 'high';
  evidence: string | null;
}

interface EvidenceSample {
  conversation_id: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  category: 'forte' | 'fraco';
  excerpt: string;
}

interface ConversationMemory {
  conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  message_count: number;
  opening_excerpt: string;
  closing_excerpt: string;
  quality_score: number | null;
  predicted_csat: number | null;
  needs_coaching: boolean;
  training_tags: string[];
  failure_tags: string[];
  strengths: string[];
  improvements: string[];
  missed_opportunities: LostOpportunity[];
  behavior_flags: BehaviorFlags;
  competency_scores: CompetencyScores;
  severity_findings: SeverityFinding[];
  seller_profile_hint: string;
  diagnosis: {
    conversation_type: string;
    sales_stage: string;
    customer_intent: string;
    interest_level: string;
  };
  metrics: {
    first_response_time_sec: number | null;
    avg_response_gap_sec: number | null;
    sla_first_response_met: boolean | null;
  };
  signals: {
    loss_risk_level: string | null;
    intent_level: string | null;
    close_probability: number | null;
    next_best_action: string | null;
    estimated_value: number | null;
    stage: string | null;
  };
  outcome: {
    outcome: string | null;
    value: number | null;
    loss_reason: string | null;
  };
}

interface AuditScorecard {
  abertura: number | null;
  agilidade: number | null;
  diagnostico: number | null;
  conducao: number | null;
  construcao_valor: number | null;
  objecoes: number | null;
  fechamento: number | null;
  follow_up: number | null;
  comunicacao: number | null;
  consistencia: number | null;
}

interface AuditPerformanceMetrics {
  close_attempt_rate: number;
  follow_up_rate: number;
  real_diagnosis_rate: number;
  abandonment_rate: number;
  poor_objection_handling_rate: number;
  passive_response_rate: number;
}

interface AuditReport {
  executive_verdict: string;
  alert_level: AlertLevel;
  final_score: number | null;
  seller_level: string;
  scorecard: AuditScorecard;
  performance_metrics: AuditPerformanceMetrics;
  strengths: string[];
  main_errors: string[];
  recurring_patterns: string[];
  operational_impact: string[];
  behavior_profile: string;
  critical_failures: string[];
  high_failures: string[];
  medium_failures: string[];
  low_failures: string[];
  lost_opportunities: LostOpportunity[];
  unfiltered_manager_note: string;
  manager_actions: string[];
  intervention_plan_30d: {
    stop_now: string[];
    start_now: string[];
    train_next_30_days: string[];
  };
  recommended_training: {
    priority: string;
    reason: string;
  } | null;
  final_conclusion: string;
  final_questions: {
    extracts_opportunities_well: string;
    needs_more_leads_or_skill: string;
    main_problem_skill_or_posture: string;
    next_30_days_if_nothing_changes: string;
    train_pressure_monitor_or_replace: string;
  };
  evidence_samples: EvidenceSample[];
  totals: {
    conversations_considered: number;
    analyzed_conversations: number;
    open_alerts: number;
  };
}

interface SupportMetrics {
  total_conversations: number;
  analyzed_conversations: number;
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
  scorecard: AuditScorecard;
  performance_metrics: AuditPerformanceMetrics;
}

const closeAttemptRegex = /\b(fechar|fechamos|fechamento|avancar|avançar|seguir com|confirmar pedido|link de pagamento|pix|boleto|agendar|agendamos|posso emitir|posso reservar|posso te mandar o link)\b/i;
const followUpRegex = /\b(retomando|retorno|seguindo|voltando aqui|conseguiu ver|deu certo|ainda tem interesse|podemos continuar|ficou alguma duvida|ficou alguma dúvida)\b/i;
const diagnosisRegex = /\b(qual|como|quando|para quando|o que voce busca|o que você busca|objetivo|necessidade|cenario|cenário|quantas|hoje voce usa|hoje você usa)\b/i;
const objectionRegex = /\b(caro|valor alto|vou pensar|vou ver|depois eu volto|concorrente|mais barato|nao sei|não sei)\b/i;

const failureTagCatalog: Record<string, { label: string; severity: SeverityLevel; impact: string }> = {
  falta_investigacao: {
    label: 'Faz diagnostico raso e avanca sem entender a necessidade.',
    severity: 'critical',
    impact: 'Derruba a chance de construir valor e empurra a conversa para preco.',
  },
  sem_proximo_passo: {
    label: 'Encerra conversas sem definir proximo passo claro.',
    severity: 'critical',
    impact: 'Gera abandono silencioso e reduz taxa de avancao.',
  },
  rapport_insuficiente: {
    label: 'Nao cria conexao suficiente no inicio da conversa.',
    severity: 'medium',
    impact: 'A resposta inicial perde tracao e engajamento.',
  },
  sem_proposta_valor: {
    label: 'Entrega informacao e preco sem construir valor.',
    severity: 'high',
    impact: 'Enfraquece percepcao de valor e aumenta sensibilidade a preco.',
  },
  objecao_ignorada: {
    label: 'Recua diante da objecao em vez de trabalhar o motivo real.',
    severity: 'high',
    impact: 'Perde venda recuperavel e reduz capacidade de contorno.',
  },
  resposta_generica: {
    label: 'Responde como suporte, sem postura comercial.',
    severity: 'medium',
    impact: 'A conversa fica morna e sem diferenciacao.',
  },
  sem_conducao: {
    label: 'Nao assume o controle da conversa.',
    severity: 'critical',
    impact: 'O lead dita o ritmo e o vendedor nao cria avancos.',
  },
  perda_timing: {
    label: 'Perde timing e deixa o lead esfriar.',
    severity: 'high',
    impact: 'Reduz conversao por atraso em pontos decisivos.',
  },
  falta_empatia: {
    label: 'Nao reconhece contexto e insegurancas do cliente.',
    severity: 'medium',
    impact: 'Prejudica confianca e receptividade.',
  },
  comunicacao_confusa: {
    label: 'Escreve de forma pouco clara e dispersa.',
    severity: 'medium',
    impact: 'Cria atrito de entendimento e baixa percepcao profissional.',
  },
  demora_resposta: {
    label: 'Demora para responder quando precisava acelerar.',
    severity: 'high',
    impact: 'Deixa oportunidade esfriar e aumenta abandono.',
  },
  passividade: {
    label: 'Opera de forma passiva e depende do lead puxar o avancar.',
    severity: 'critical',
    impact: 'Transforma oportunidade em conversa sem direcao.',
  },
};

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
  if (size <= 0 || items.length === 0) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function clampNumber(value: unknown, min: number, max: number, digits = 0): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const factor = Math.pow(10, digits);
  const rounded = Math.round(numericValue * factor) / factor;
  return Math.min(max, Math.max(min, rounded));
}

function sanitizeText(value: unknown, maxLength = 260): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeStringArray(value: unknown, maxItems = 6, maxLength = 180): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function roundRate(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function roundScore(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Number(Math.max(0, Math.min(10, value)).toFixed(1));
}

function deriveAlertLevel(finalScore: number | null): AlertLevel {
  if (finalScore == null) return 'vermelho';
  if (finalScore >= 8) return 'verde';
  if (finalScore >= 6) return 'amarelo';
  if (finalScore >= 4.5) return 'laranja';
  return 'vermelho';
}

function deriveSellerLevel(finalScore: number | null): string {
  if (finalScore == null) return 'Critico';
  if (finalScore <= 3.9) return 'Critico';
  if (finalScore <= 5.9) return 'Fraco';
  if (finalScore <= 7.4) return 'Regular';
  if (finalScore <= 8.9) return 'Bom';
  return 'Elite';
}

function extractRawMessageText(message: RawMessageRow): string {
  const payload = message.raw_payload ?? {};
  const rawText = payload.text ?? payload.body ?? '';
  return typeof rawText === 'string' ? rawText.trim() : '';
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

function getTextualMessages(messages: RawMessageRow[]): RawMessageRow[] {
  return messages.filter((message) => extractRawMessageText(message).length > 0);
}

function buildSnippet(messages: RawMessageRow[], fromStart: boolean): string {
  const textual = getTextualMessages(messages);
  const selected = fromStart
    ? textual.slice(0, MAX_MESSAGE_LINES_PER_SNIPPET)
    : textual.slice(-MAX_MESSAGE_LINES_PER_SNIPPET);
  if (!selected.length) return 'Sem texto relevante.';
  return selected.map(formatTranscriptLine).join(' | ');
}

function buildCombinedAgentText(messages: RawMessageRow[]): string {
  return getTextualMessages(messages)
    .filter((message) => message.sender_type === 'agent')
    .map((message) => extractRawMessageText(message))
    .join(' \n ');
}

function buildCombinedCustomerText(messages: RawMessageRow[]): string {
  return getTextualMessages(messages)
    .filter((message) => message.sender_type === 'customer')
    .map((message) => extractRawMessageText(message))
    .join(' \n ');
}

function inferBehaviorFlags(
  messages: RawMessageRow[],
  failureTags: string[],
  existing: Partial<BehaviorFlags> | null,
): BehaviorFlags {
  const agentText = buildCombinedAgentText(messages);
  const customerText = buildCombinedCustomerText(messages);
  const agentMessages = getTextualMessages(messages).filter((message) => message.sender_type === 'agent');
  const agentQuestionCount = agentMessages.filter((message) => /\?/.test(extractRawMessageText(message)) || diagnosisRegex.test(extractRawMessageText(message))).length;
  const lastMessage = getTextualMessages(messages).at(-1);
  const lastMessageText = lastMessage ? extractRawMessageText(lastMessage) : '';

  const closeAttempted =
    existing?.close_attempted ??
    (closeAttemptRegex.test(agentText) ||
      /confirma|segue|avanco|avanço|pagamento|pedido/i.test(lastMessageText));

  const followUpPresent =
    existing?.follow_up_present ??
    (followUpRegex.test(agentText) || agentMessages.length >= 3);

  const realDiagnosis =
    existing?.real_diagnosis ??
    (agentQuestionCount >= 2 || /necessidade|objetivo|cenario|cenário|dor/i.test(agentText));

  const passiveResponse =
    existing?.passive_response ??
    (failureTags.includes('passividade') ||
      failureTags.includes('sem_conducao') ||
      (agentQuestionCount === 0 && !closeAttemptRegex.test(agentText)));

  const objectionMishandled =
    existing?.objection_mishandled ??
    (failureTags.includes('objecao_ignorada') ||
      (objectionRegex.test(customerText) && !/porque|entendo|faz sentido|o que te trava|o que te preocupa/i.test(agentText)));

  const abandonedWithoutNextStep =
    existing?.abandoned_without_next_step ??
    (failureTags.includes('sem_proximo_passo') ||
      failureTags.includes('perda_timing') ||
      (!!lastMessage && lastMessage.sender_type === 'customer' && !closeAttempted));

  return {
    close_attempted: !!closeAttempted,
    follow_up_present: !!followUpPresent,
    real_diagnosis: !!realDiagnosis,
    passive_response: !!passiveResponse,
    objection_mishandled: !!objectionMishandled,
    abandoned_without_next_step: !!abandonedWithoutNextStep,
  };
}

function inferCompetencyScores(
  analysis: AnalysisRow | null,
  metric: MetricRow | null,
  behaviorFlags: BehaviorFlags,
  existing: Partial<CompetencyScores> | null,
): CompetencyScores {
  const opening =
    existing?.opening ??
    average([analysis?.score_empathy ?? null, analysis?.score_clarity ?? null, analysis?.score_rapport ?? null]);

  const timing =
    existing?.timing ??
    (() => {
      const firstResponse = metric?.first_response_time_sec ?? null;
      if (firstResponse == null) return behaviorFlags.follow_up_present ? 6 : null;
      if (firstResponse <= 60) return 9.5;
      if (firstResponse <= 300) return 8;
      if (firstResponse <= 900) return 6.5;
      if (firstResponse <= 3600) return 4.5;
      return 2.5;
    })();

  const authority =
    existing?.authority ??
    average([analysis?.score_professionalism ?? null, analysis?.score_value_proposition ?? null]);

  const followUp =
    existing?.follow_up ??
    (behaviorFlags.follow_up_present ? 7.5 : 3.5);

  const closing =
    existing?.closing ??
    average([
      analysis?.score_urgency ?? null,
      analysis?.score_value_proposition ?? null,
      analysis?.score_commercial_steering ?? null,
      behaviorFlags.close_attempted ? 7 : 3,
    ]);

  return {
    opening: roundScore(opening),
    timing: roundScore(timing),
    authority: roundScore(authority),
    follow_up: roundScore(followUp),
    closing: roundScore(closing),
  };
}

function parseExistingBehaviorFlags(analysis: AnalysisRow | null): Partial<BehaviorFlags> | null {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured || !isRecord(structured.behavior_flags)) return null;
  const behaviorFlags = structured.behavior_flags as Record<string, unknown>;
  return {
    close_attempted: behaviorFlags.close_attempted === true,
    follow_up_present: behaviorFlags.follow_up_present === true,
    real_diagnosis: behaviorFlags.real_diagnosis === true,
    passive_response: behaviorFlags.passive_response === true,
    objection_mishandled: behaviorFlags.objection_mishandled === true,
    abandoned_without_next_step: behaviorFlags.abandoned_without_next_step === true,
  };
}

function parseExistingCompetencyScores(analysis: AnalysisRow | null): Partial<CompetencyScores> | null {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured || !isRecord(structured.competency_scores)) return null;
  const scores = structured.competency_scores as Record<string, unknown>;
  return {
    opening: clampNumber(scores.opening, 0, 10, 1),
    timing: clampNumber(scores.timing, 0, 10, 1),
    authority: clampNumber(scores.authority, 0, 10, 1),
    follow_up: clampNumber(scores.follow_up, 0, 10, 1),
    closing: clampNumber(scores.closing, 0, 10, 1),
  };
}

function parseExistingSeverityFindings(analysis: AnalysisRow | null): SeverityFinding[] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured || !Array.isArray(structured.severity_findings)) return [];
  return structured.severity_findings
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      tag: sanitizeText(item.tag, 80),
      severity: ['critical', 'high', 'medium', 'low'].includes(String(item.severity))
        ? (String(item.severity) as SeverityLevel)
        : 'medium',
      evidence: sanitizeText(item.evidence, 260),
      impact: sanitizeText(item.impact, 220),
    }))
    .filter((item) => item.tag.length > 0);
}

function deriveSeverityFindings(
  failureTags: string[],
  openingExcerpt: string,
  closingExcerpt: string,
  existing: SeverityFinding[],
): SeverityFinding[] {
  if (existing.length > 0) return existing.slice(0, 8);
  return failureTags
    .map((tag) => {
      const catalog = failureTagCatalog[tag];
      if (!catalog) return null;
      return {
        tag,
        severity: catalog.severity,
        evidence: tag === 'sem_proximo_passo' || tag === 'passividade' ? closingExcerpt : openingExcerpt,
        impact: catalog.impact,
      } satisfies SeverityFinding;
    })
    .filter((item): item is SeverityFinding => item !== null)
    .slice(0, 8);
}

function parseDiagnosis(analysis: AnalysisRow | null): ConversationMemory['diagnosis'] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  const diagnosis = structured && isRecord(structured.diagnosis) ? structured.diagnosis : null;
  return {
    conversation_type: diagnosis ? sanitizeText(diagnosis.conversation_type, 80) : '',
    sales_stage: diagnosis ? sanitizeText(diagnosis.sales_stage, 80) : '',
    customer_intent: diagnosis ? sanitizeText(diagnosis.customer_intent, 120) : '',
    interest_level: diagnosis ? sanitizeText(diagnosis.interest_level, 40) : '',
  };
}

function parseFailureTags(analysis: AnalysisRow | null): string[] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured) return [];
  return sanitizeStringArray(structured.failure_tags, 12, 80);
}

function parseStrengths(analysis: AnalysisRow | null): string[] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured) return [];
  return sanitizeStringArray(structured.strengths, 5, 160);
}

function parseImprovements(analysis: AnalysisRow | null): string[] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured) return [];
  return sanitizeStringArray(structured.improvements, 5, 180);
}

function parseMissedOpportunities(
  analysis: AnalysisRow | null,
  conversation: FeedbackConversation,
): LostOpportunity[] {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  if (!structured || !Array.isArray(structured.missed_opportunities)) return [];
  return structured.missed_opportunities
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      conversation_id: conversation.conversation_id,
      customer_name: conversation.customer_name,
      customer_phone_masked: maskPhone(conversation.customer_phone),
      what_happened: sanitizeText(item.agent_message, 220),
      why_it_was_lost: sanitizeText(item.missed_action, 220),
      what_should_have_been_done: sanitizeText(item.missed_action, 220),
      impact: ['low', 'medium', 'high'].includes(String(item.impact))
        ? (String(item.impact) as 'low' | 'medium' | 'high')
        : 'medium',
      evidence: sanitizeText(item.agent_message, 220) || null,
    }))
    .slice(0, 4);
}

function deriveSellerProfileHint(
  behaviorFlags: BehaviorFlags,
  analysis: AnalysisRow | null,
): string {
  const structured = isRecord(analysis?.structured_analysis) ? analysis?.structured_analysis : null;
  const explicit = structured ? sanitizeText(structured.seller_profile_hint, 120) : '';
  if (explicit) return explicit;
  if (behaviorFlags.passive_response && !behaviorFlags.close_attempted) return 'educado, mas passivo';
  if (behaviorFlags.follow_up_present && !behaviorFlags.real_diagnosis) return 'rapido, porem superficial';
  if (behaviorFlags.real_diagnosis && !behaviorFlags.close_attempted) return 'consultivo, mas pouco incisivo';
  if (!behaviorFlags.follow_up_present && behaviorFlags.close_attempted) return 'pressiona o fechamento, mas nao sustenta continuidade';
  return 'atendimento presente, mas sem consistencia comercial';
}

function buildConversationMemory(
  conversation: FeedbackConversation,
  messages: RawMessageRow[],
  analysis: AnalysisRow | null,
  metric: MetricRow | null,
  signal: SignalRow | null,
  outcome: OutcomeRow | null,
): ConversationMemory {
  const openingExcerpt = buildSnippet(messages, true);
  const closingExcerpt = buildSnippet(messages, false);
  const failureTags = parseFailureTags(analysis);
  const behaviorFlags = inferBehaviorFlags(messages, failureTags, parseExistingBehaviorFlags(analysis));
  const competencyScores = inferCompetencyScores(analysis, metric, behaviorFlags, parseExistingCompetencyScores(analysis));
  const severityFindings = deriveSeverityFindings(
    failureTags,
    openingExcerpt,
    closingExcerpt,
    parseExistingSeverityFindings(analysis),
  );

  return {
    conversation_id: conversation.conversation_id,
    started_at: conversation.started_at,
    status: conversation.status,
    customer_name: conversation.customer_name,
    customer_phone_masked: maskPhone(conversation.customer_phone),
    message_count: getTextualMessages(messages).length,
    opening_excerpt: openingExcerpt,
    closing_excerpt: closingExcerpt,
    quality_score: analysis?.quality_score ?? null,
    predicted_csat: analysis?.predicted_csat ?? null,
    needs_coaching: analysis?.needs_coaching ?? false,
    training_tags: sanitizeStringArray(analysis?.training_tags, 8, 80),
    failure_tags: failureTags,
    strengths: parseStrengths(analysis),
    improvements: parseImprovements(analysis),
    missed_opportunities: parseMissedOpportunities(analysis, conversation),
    behavior_flags: behaviorFlags,
    competency_scores: competencyScores,
    severity_findings: severityFindings,
    seller_profile_hint: deriveSellerProfileHint(behaviorFlags, analysis),
    diagnosis: parseDiagnosis(analysis),
    metrics: {
      first_response_time_sec: metric?.first_response_time_sec ?? null,
      avg_response_gap_sec: metric?.avg_response_gap_sec ?? null,
      sla_first_response_met: metric?.sla_first_response_met ?? null,
    },
    signals: {
      loss_risk_level: signal?.loss_risk_level ?? null,
      intent_level: signal?.intent_level ?? null,
      close_probability: signal?.close_probability ?? null,
      next_best_action: signal?.next_best_action ?? null,
      estimated_value: signal?.estimated_value ?? null,
      stage: signal?.stage ?? null,
    },
    outcome: {
      outcome: outcome?.outcome ?? null,
      value: outcome?.value ?? null,
      loss_reason: outcome?.loss_reason ?? null,
    },
  };
}

function buildScorecard(memories: ConversationMemory[]): AuditScorecard {
  const qualityScores = memories
    .map((memory) => (memory.quality_score != null ? memory.quality_score / 10 : null))
    .filter((value): value is number => value != null);
  const avgCore = average(qualityScores);
  const variance = qualityScores.length
    ? Math.sqrt(
      qualityScores.reduce((sum, value) => sum + Math.pow(value - (avgCore ?? 0), 2), 0) /
      qualityScores.length,
    )
    : null;

  return {
    abertura: roundScore(average(memories.map((memory) => memory.competency_scores.opening))),
    agilidade: roundScore(average(memories.map((memory) => memory.competency_scores.timing))),
    diagnostico: roundScore(
      average(memories.map((memory) => memory.behavior_flags.real_diagnosis ? 8 : (memory.quality_score ?? 50) / 15)),
    ),
    conducao: roundScore(
      average(memories.map((memory) => [
        memory.behavior_flags.passive_response ? 3 : 7,
        memory.quality_score != null ? memory.quality_score / 10 : null,
      ]).flat()),
    ),
    construcao_valor: roundScore(
      average(memories.map((memory) => memory.quality_score != null ? memory.quality_score / 10 : null)),
    ),
    objecoes: roundScore(
      average(memories.map((memory) => memory.behavior_flags.objection_mishandled ? 3 : 6.5)),
    ),
    fechamento: roundScore(average(memories.map((memory) => memory.competency_scores.closing))),
    follow_up: roundScore(average(memories.map((memory) => memory.competency_scores.follow_up))),
    comunicacao: roundScore(
      average(memories.map((memory) => [
        memory.competency_scores.opening,
        memory.competency_scores.authority,
      ]).flat()),
    ),
    consistencia: roundScore(avgCore != null ? Math.max(0, avgCore - (variance ?? 0) * 0.9) : null),
  };
}

function buildPerformanceMetrics(memories: ConversationMemory[]): AuditPerformanceMetrics {
  const denominator = Math.max(memories.length, 1);
  const count = (predicate: (memory: ConversationMemory) => boolean) => memories.filter(predicate).length;
  return {
    close_attempt_rate: roundRate((count((memory) => memory.behavior_flags.close_attempted) / denominator) * 100),
    follow_up_rate: roundRate((count((memory) => memory.behavior_flags.follow_up_present) / denominator) * 100),
    real_diagnosis_rate: roundRate((count((memory) => memory.behavior_flags.real_diagnosis) / denominator) * 100),
    abandonment_rate: roundRate((count((memory) => memory.behavior_flags.abandoned_without_next_step) / denominator) * 100),
    poor_objection_handling_rate: roundRate((count((memory) => memory.behavior_flags.objection_mishandled) / denominator) * 100),
    passive_response_rate: roundRate((count((memory) => memory.behavior_flags.passive_response) / denominator) * 100),
  };
}

function buildSupportMetrics(
  memories: ConversationMemory[],
  analysisRows: AnalysisRow[],
  metricRows: MetricRow[],
  signalRows: SignalRow[],
  outcomeRows: OutcomeRow[],
  openAlerts: number,
): SupportMetrics {
  const avgQuality = average(analysisRows.map((row) => row.quality_score));
  const avgCsat = average(analysisRows.map((row) => row.predicted_csat));
  const avgFirstResponse = average(metricRows.map((row) => row.first_response_time_sec));
  const slaMeasured = metricRows.filter((row) => row.sla_first_response_met !== null);
  const slaFirstResponsePct = slaMeasured.length
    ? roundRate((slaMeasured.filter((row) => row.sla_first_response_met === true).length / slaMeasured.length) * 100)
    : null;

  const scorecard = buildScorecard(memories);
  const performanceMetrics = buildPerformanceMetrics(memories);

  return {
    total_conversations: memories.length,
    analyzed_conversations: memories.length,
    avg_quality_score: avgQuality != null ? Number(avgQuality.toFixed(1)) : null,
    avg_predicted_csat: avgCsat != null ? Number(avgCsat.toFixed(2)) : null,
    coaching_needed_count: analysisRows.filter((row) => row.needs_coaching).length,
    avg_first_response_sec: avgFirstResponse != null ? Number(avgFirstResponse.toFixed(0)) : null,
    sla_first_response_pct: slaFirstResponsePct,
    high_risk_count: signalRows.filter((row) => row.loss_risk_level === 'alto').length,
    hot_intent_count: signalRows.filter((row) => row.intent_level === 'quente').length,
    won_count: outcomeRows.filter((row) => row.outcome === 'won').length,
    lost_count: outcomeRows.filter((row) => row.outcome === 'lost').length,
    won_value: Number(outcomeRows.filter((row) => row.outcome === 'won').reduce((sum, row) => sum + Number(row.value ?? 0), 0).toFixed(2)),
    open_alerts: openAlerts,
    scorecard,
    performance_metrics: performanceMetrics,
  };
}

function pickEvidenceSamples(memories: ConversationMemory[]): EvidenceSample[] {
  const ordered = [...memories].sort((left, right) => {
    const leftScore = left.quality_score ?? 0;
    const rightScore = right.quality_score ?? 0;
    return leftScore - rightScore;
  });

  const weakest = ordered.slice(0, 4).map((memory) => ({
    conversation_id: memory.conversation_id,
    customer_name: memory.customer_name,
    customer_phone_masked: memory.customer_phone_masked,
    category: 'fraco' as const,
    excerpt: memory.closing_excerpt,
  }));

  const strongest = ordered.slice(-2).reverse().map((memory) => ({
    conversation_id: memory.conversation_id,
    customer_name: memory.customer_name,
    customer_phone_masked: memory.customer_phone_masked,
    category: 'forte' as const,
    excerpt: memory.opening_excerpt,
  }));

  return [...weakest, ...strongest].slice(0, MAX_EVIDENCE_SAMPLES);
}

function summarizeTopFailures(memories: ConversationMemory[]): {
  critical: string[];
  high: string[];
  medium: string[];
  low: string[];
  mainErrors: string[];
} {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const tag of memory.failure_tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const grouped: Record<SeverityLevel, string[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  for (const [tag, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
    const catalog = failureTagCatalog[tag];
    if (!catalog) continue;
    grouped[catalog.severity].push(`${catalog.label} Recorrencia: ${count} conversa(s).`);
  }

  const mainErrors = [
    ...grouped.critical,
    ...grouped.high,
    ...grouped.medium,
    ...grouped.low,
  ].slice(0, 6);

  return {
    critical: grouped.critical.slice(0, 4),
    high: grouped.high.slice(0, 4),
    medium: grouped.medium.slice(0, 4),
    low: grouped.low.slice(0, 4),
    mainErrors,
  };
}

function summarizeStrengths(supportMetrics: SupportMetrics, scorecard: AuditScorecard): string[] {
  const strengths: string[] = [];
  if ((scorecard.abertura ?? 0) >= 7) strengths.push('A abertura costuma gerar continuacao da conversa sem parecer robotica.');
  if ((scorecard.comunicacao ?? 0) >= 7) strengths.push('Ha clareza de comunicacao acima da media em boa parte das conversas.');
  if (supportMetrics.performance_metrics.real_diagnosis_rate >= 45) strengths.push('Existe investigacao real em uma parcela relevante dos leads.');
  if (supportMetrics.performance_metrics.follow_up_rate >= 35) strengths.push('Ha retomada de oportunidades acima do padrao da operacao.');
  if (supportMetrics.won_count > 0) strengths.push('Existem sinais concretos de conversao e captura de receita no periodo.');
  if (!strengths.length) strengths.push('O ponto forte ainda e pontual, nao estrutural. O melhor sinal hoje e a presenca de atendimento ativo.');
  return strengths.slice(0, 5);
}

function deriveBehaviorProfile(supportMetrics: SupportMetrics, scorecard: AuditScorecard): string {
  if (supportMetrics.performance_metrics.passive_response_rate >= 55 && supportMetrics.performance_metrics.close_attempt_rate < 35) {
    return 'atendente com funcao de vendedor';
  }
  if ((scorecard.diagnostico ?? 0) >= 7 && (scorecard.fechamento ?? 0) < 6) {
    return 'consultivo, mas pouco incisivo';
  }
  if ((scorecard.agilidade ?? 0) >= 7 && (scorecard.diagnostico ?? 0) < 6) {
    return 'rapido, porem superficial';
  }
  if ((scorecard.conducao ?? 0) < 5) {
    return 'vendedor passivo';
  }
  if ((scorecard.fechamento ?? 0) >= 7 && (scorecard.conducao ?? 0) >= 7) {
    return 'vendedor consultivo e consistente';
  }
  return 'operador de resposta com oscilacao comercial';
}

function deriveRecurringPatterns(memories: ConversationMemory[], supportMetrics: SupportMetrics): string[] {
  const patterns: string[] = [];
  if (supportMetrics.performance_metrics.passive_response_rate >= 40) {
    patterns.push('Em grande parte das conversas, o vendedor responde, mas nao conduz o avancar.');
  }
  if (supportMetrics.performance_metrics.real_diagnosis_rate < 40) {
    patterns.push('A investigacao da necessidade aparece pouco e o meio da conversa fica raso.');
  }
  if (supportMetrics.performance_metrics.close_attempt_rate < 35) {
    patterns.push('Boa parte das conversas termina sem tentativa clara de fechamento ou proximo passo.');
  }
  if (supportMetrics.performance_metrics.follow_up_rate < 30) {
    patterns.push('Existe pouca retomada estruturada de leads mornos ou parados.');
  }
  if (memories.some((memory) => memory.failure_tags.includes('sem_proposta_valor'))) {
    patterns.push('Quando o cliente entra em preco, o vendedor perde forca de sustentacao de valor.');
  }
  return patterns.slice(0, 6);
}

function deriveOperationalImpact(supportMetrics: SupportMetrics, behaviorProfile: string): string[] {
  const impacts: string[] = [];
  if (supportMetrics.performance_metrics.passive_response_rate >= 40) impacts.push('Reduz taxa de avancao porque o lead precisa puxar a proxima etapa.');
  if (supportMetrics.performance_metrics.abandonment_rate >= 35) impacts.push('Aumenta desperdicio de lead por encerramentos sem direcao.');
  if (supportMetrics.performance_metrics.poor_objection_handling_rate >= 30) impacts.push('Perde vendas recuperaveis em momentos de objecao.');
  if (supportMetrics.high_risk_count > 0) impacts.push('Transforma oportunidades de risco alto em perda por falta de recuperacao ativa.');
  if (behaviorProfile.includes('atendente')) impacts.push('A operacao entrega lead para atendimento, mas nao recebe conducao comercial consistente.');
  return impacts.slice(0, 5);
}

function deriveLostOpportunities(memories: ConversationMemory[]): LostOpportunity[] {
  const explicit = memories.flatMap((memory) => memory.missed_opportunities);
  if (explicit.length > 0) {
    return explicit
      .sort((left, right) => {
        const impactWeight = { high: 3, medium: 2, low: 1 };
        return impactWeight[right.impact] - impactWeight[left.impact];
      })
      .slice(0, MAX_OPPORTUNITIES);
  }

  return memories
    .filter((memory) =>
      memory.behavior_flags.abandoned_without_next_step ||
      memory.signals.loss_risk_level === 'alto' ||
      memory.outcome.outcome === 'lost',
    )
    .map((memory) => ({
      conversation_id: memory.conversation_id,
      customer_name: memory.customer_name,
      customer_phone_masked: memory.customer_phone_masked,
      what_happened: memory.closing_excerpt,
      why_it_was_lost: memory.behavior_flags.passive_response
        ? 'A conversa perdeu conducao e o vendedor nao criou avancar.'
        : 'Houve sinal de risco ou perda sem recuperacao consistente.',
      what_should_have_been_done: memory.signals.next_best_action || 'Definir proximo passo claro, trabalhar objecao e retomar com timing.',
      impact: (memory.signals.loss_risk_level === 'alto' ? 'high' : 'medium') as 'high' | 'medium',
      evidence: memory.closing_excerpt,
    }))
    .slice(0, MAX_OPPORTUNITIES);
}

function deriveRecommendedTraining(scorecard: AuditScorecard): { priority: string; reason: string } {
  const entries = [
    ['abertura', scorecard.abertura],
    ['diagnostico', scorecard.diagnostico],
    ['objecao', scorecard.objecoes],
    ['fechamento', scorecard.fechamento],
    ['follow_up', scorecard.follow_up],
    ['comunicacao', scorecard.comunicacao],
    ['conducao', scorecard.conducao],
  ].filter((entry): entry is [string, number] => typeof entry[1] === 'number');

  const [priority] = entries.sort((left, right) => left[1] - right[1])[0] ?? ['conducao', 0];

  const reasons: Record<string, string> = {
    abertura: 'A primeira fase da conversa ainda nao cria tracao suficiente para gerar continuidade.',
    diagnostico: 'O vendedor avanca sem entender dor, contexto e urgencia com profundidade.',
    objecao: 'Quando aparece resistencia, a resposta desmonta em vez de recuperar a oportunidade.',
    fechamento: 'Falta pedir o avancar com clareza e transformar interesse em compromisso.',
    follow_up: 'A operacao perde leads por retomada fraca ou inexistente.',
    comunicacao: 'A forma de escrever ainda cria ruido e reduz autoridade.',
    conducao: 'O principal gargalo e postura comercial: responde, mas nao guia a venda.',
  };

  return {
    priority,
    reason: reasons[priority] ?? reasons.conducao,
  };
}

function buildFallbackAuditReport(
  agentName: string,
  supportMetrics: SupportMetrics,
  memories: ConversationMemory[],
): AuditReport {
  const scorecard = supportMetrics.scorecard;
  const finalScore = roundScore(
    average([
      scorecard.abertura,
      scorecard.agilidade,
      scorecard.diagnostico,
      scorecard.conducao,
      scorecard.construcao_valor,
      scorecard.objecoes,
      scorecard.fechamento,
      scorecard.follow_up,
      scorecard.comunicacao,
      scorecard.consistencia,
    ]),
  );
  const alertLevel = deriveAlertLevel(finalScore);
  const sellerLevel = deriveSellerLevel(finalScore);
  const strengths = summarizeStrengths(supportMetrics, scorecard);
  const failureSummary = summarizeTopFailures(memories);
  const behaviorProfile = deriveBehaviorProfile(supportMetrics, scorecard);
  const recurringPatterns = deriveRecurringPatterns(memories, supportMetrics);
  const operationalImpact = deriveOperationalImpact(supportMetrics, behaviorProfile);
  const lostOpportunities = deriveLostOpportunities(memories);
  const recommendedTraining = deriveRecommendedTraining(scorecard);
  const executiveVerdict = finalScore != null && finalScore >= 7
    ? `${agentName} opera em nivel funcional, mas ainda deixa margem de melhoria comercial em diagnostico, conducao e consistencia.`
    : `${agentName} opera abaixo do esperado para venda consultiva. Hoje atende mais do que vende e devolve parte da oportunidade sem avancar.`;
  const unfilteredManagerNote = supportMetrics.performance_metrics.passive_response_rate >= 50
    ? 'O problema principal nao parece ser ferramenta. E execucao: existe alta passividade e pouca forca de tracao comercial.'
    : 'Existe atendimento ativo, mas a operacao ainda nao recebe uma conducao comercial consistente ao longo do funil.';
  const managerActions = [
    'Corrigir imediatamente o criterio de proximo passo em toda conversa relevante.',
    'Acompanhar conversas diariamente ate reduzir passividade e abandono.',
    'Fazer roleplay semanal com foco em diagnostico, objecao e fechamento.',
    'Cobrar meta de avancao, nao apenas volume de resposta.',
  ].slice(0, 4);

  return {
    executive_verdict: executiveVerdict,
    alert_level: alertLevel,
    final_score: finalScore,
    seller_level: sellerLevel,
    scorecard,
    performance_metrics: supportMetrics.performance_metrics,
    strengths,
    main_errors: failureSummary.mainErrors,
    recurring_patterns: recurringPatterns,
    operational_impact: operationalImpact,
    behavior_profile: behaviorProfile,
    critical_failures: failureSummary.critical,
    high_failures: failureSummary.high,
    medium_failures: failureSummary.medium,
    low_failures: failureSummary.low,
    lost_opportunities: lostOpportunities,
    unfiltered_manager_note: unfilteredManagerNote,
    manager_actions: managerActions,
    intervention_plan_30d: {
      stop_now: [
        'Parar de encerrar conversa sem CTA claro.',
        'Parar de entregar preco sem construir valor antes.',
        'Parar de aceitar objecao sem explorar a causa real.',
      ],
      start_now: [
        'Comecar toda conversa relevante com perguntas de contexto e urgencia.',
        'Definir proximo passo em toda conversa com interesse ativo.',
        'Retomar leads mornos com mensagem que agregue valor, nao cobranca vazia.',
      ],
      train_next_30_days: [
        'Treinar diagnostico consultivo com perguntas de dor, cenario e objetivo.',
        'Treinar contorno de objecoes de preco e indecisao.',
        'Treinar fechamento com CTA, compromisso e proximo passo claro.',
      ],
    },
    recommended_training: recommendedTraining,
    final_conclusion: finalScore != null && finalScore >= 7
      ? 'Existe base de atendimento, mas ainda falta mais forca comercial para aproveitar melhor o lead.'
      : 'Hoje o gargalo esta no operador, nao no funil. Sem correcao, a operacao continuara desperdicando oportunidade.',
    final_questions: {
      extracts_opportunities_well: finalScore != null && finalScore >= 7 ? 'Extrai parcialmente.' : 'Nao extrai bem as oportunidades que recebe.',
      needs_more_leads_or_skill: 'Precisa de mais competencia antes de pedir mais lead.',
      main_problem_skill_or_posture: supportMetrics.performance_metrics.passive_response_rate >= 45 ? 'O problema principal e postura comercial.' : 'O problema principal combina skill insuficiente e baixa consistencia.',
      next_30_days_if_nothing_changes: 'A tendencia e continuar perdendo avancos, deixando leads esfriarem e sustentando conversao abaixo do potencial.',
      train_pressure_monitor_or_replace: finalScore != null && finalScore >= 7
        ? 'Treino com monitoramento proximo.'
        : 'Treino intensivo, monitoramento diario e pressao de execucao imediata.',
    },
    evidence_samples: pickEvidenceSamples(memories),
    totals: {
      conversations_considered: supportMetrics.total_conversations,
      analyzed_conversations: supportMetrics.analyzed_conversations,
      open_alerts: supportMetrics.open_alerts,
    },
  };
}

function buildMemoryPayload(memories: ConversationMemory[]): Array<Record<string, unknown>> {
  return memories.map((memory) => ({
    conversation_id: memory.conversation_id,
    started_at: memory.started_at,
    status: memory.status,
    customer_name: memory.customer_name,
    customer_phone_masked: memory.customer_phone_masked,
    quality_score: memory.quality_score,
    predicted_csat: memory.predicted_csat,
    needs_coaching: memory.needs_coaching,
    training_tags: memory.training_tags,
    failure_tags: memory.failure_tags,
    behavior_flags: memory.behavior_flags,
    competency_scores: memory.competency_scores,
    seller_profile_hint: memory.seller_profile_hint,
    diagnosis: memory.diagnosis,
    signals: memory.signals,
    outcome: memory.outcome,
    opening_excerpt: memory.opening_excerpt,
    closing_excerpt: memory.closing_excerpt,
    top_missed_opportunities: memory.missed_opportunities.slice(0, 2),
  }));
}

async function callClaudeForSellerAudit(
  agentName: string,
  periodStart: string,
  periodEnd: string,
  supportMetrics: SupportMetrics,
  memories: ConversationMemory[],
): Promise<Partial<AuditReport>> {
  if (!config.anthropicApiKey) {
    return {};
  }

  const systemPrompt =
    'Voce e uma IA especialista em auditoria comercial, performance de vendedores, vendas por WhatsApp e analise critica para gestor. ' +
    'Seu tom deve ser duro, executivo, claro e objetivo. ' +
    'Nao proteja o vendedor de um diagnostico ruim. ' +
    'Retorne apenas JSON valido, sem markdown ou texto fora do JSON. Responda em portugues.';

  const userPrompt =
    `Atendente: ${agentName}\n` +
    `Periodo: ${periodStart} ate ${periodEnd}\n\n` +
    `Metricas de apoio calculadas:\n${JSON.stringify(supportMetrics, null, 2)}\n\n` +
    `Memorias compactas por conversa:\n${JSON.stringify(buildMemoryPayload(memories), null, 2)}\n\n` +
    'Gere uma auditoria mensal dura para o gestor, baseada somente em comportamento observavel nas conversas.\n' +
    'A resposta deve seguir exatamente este JSON:\n' +
    '{\n' +
    '  "executive_verdict": "texto executivo de 3 a 6 linhas",\n' +
    '  "alert_level": "verde|amarelo|laranja|vermelho",\n' +
    '  "final_score": 0,\n' +
    '  "seller_level": "Critico|Fraco|Regular|Bom|Elite",\n' +
    '  "scorecard": {\n' +
    '    "abertura": 0,\n' +
    '    "agilidade": 0,\n' +
    '    "diagnostico": 0,\n' +
    '    "conducao": 0,\n' +
    '    "construcao_valor": 0,\n' +
    '    "objecoes": 0,\n' +
    '    "fechamento": 0,\n' +
    '    "follow_up": 0,\n' +
    '    "comunicacao": 0,\n' +
    '    "consistencia": 0\n' +
    '  },\n' +
    '  "performance_metrics": {\n' +
    '    "close_attempt_rate": 0,\n' +
    '    "follow_up_rate": 0,\n' +
    '    "real_diagnosis_rate": 0,\n' +
    '    "abandonment_rate": 0,\n' +
    '    "poor_objection_handling_rate": 0,\n' +
    '    "passive_response_rate": 0\n' +
    '  },\n' +
    '  "strengths": ["somente pontos fortes reais e relevantes"],\n' +
    '  "main_errors": ["erros principais do vendedor"],\n' +
    '  "recurring_patterns": ["padroes recorrentes ao longo do periodo"],\n' +
    '  "operational_impact": ["como prejudica a operacao"],\n' +
    '  "behavior_profile": "perfil predominante do vendedor",\n' +
    '  "critical_failures": ["falhas criticas"],\n' +
    '  "high_failures": ["falhas altas"],\n' +
    '  "medium_failures": ["falhas medias"],\n' +
    '  "low_failures": ["falhas baixas"],\n' +
    '  "lost_opportunities": [\n' +
    '    {\n' +
    '      "conversation_id": "uuid",\n' +
    '      "customer_name": "nome ou null",\n' +
    '      "customer_phone_masked": "telefone mascarado ou null",\n' +
    '      "what_happened": "o que aconteceu",\n' +
    '      "why_it_was_lost": "por que foi perdido",\n' +
    '      "what_should_have_been_done": "o que deveria ter sido feito",\n' +
    '      "impact": "low|medium|high",\n' +
    '      "evidence": "trecho curto ou null"\n' +
    '    }\n' +
    '  ],\n' +
    '  "unfiltered_manager_note": "leitura sem filtro para o gestor",\n' +
    '  "manager_actions": ["acoes diretas para o gestor"],\n' +
    '  "intervention_plan_30d": {\n' +
    '    "stop_now": ["3 erros para parar"],\n' +
    '    "start_now": ["3 comportamentos para iniciar"],\n' +
    '    "train_next_30_days": ["3 habilidades para treinar"]\n' +
    '  },\n' +
    '  "recommended_training": {\n' +
    '    "priority": "abertura|diagnostico|objecao|fechamento|follow_up|comunicacao|conducao",\n' +
    '    "reason": "justificativa direta"\n' +
    '  },\n' +
    '  "final_conclusion": "frase final forte",\n' +
    '  "final_questions": {\n' +
    '    "extracts_opportunities_well": "resposta objetiva",\n' +
    '    "needs_more_leads_or_skill": "resposta objetiva",\n' +
    '    "main_problem_skill_or_posture": "resposta objetiva",\n' +
    '    "next_30_days_if_nothing_changes": "resposta objetiva",\n' +
    '    "train_pressure_monitor_or_replace": "resposta objetiva"\n' +
    '  },\n' +
    '  "evidence_samples": [\n' +
    '    {\n' +
    '      "conversation_id": "uuid",\n' +
    '      "customer_name": "nome ou null",\n' +
    '      "customer_phone_masked": "telefone mascarado ou null",\n' +
    '      "category": "forte|fraco",\n' +
    '      "excerpt": "trecho curto que prova a observacao"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Regras:\n' +
    '- seja duro, tecnico e executivo\n' +
    '- nao invente contexto\n' +
    '- nao faca elogio vazio\n' +
    '- cite apenas conversation_id reais presentes nas memorias\n' +
    '- baseie tudo em comportamento observavel\n' +
    '- se o vendedor for fraco, diga com clareza que ele e fraco\n' +
    '- o compromisso e com a verdade comercial, nao com o conforto do vendedor';

  const response = await getAnthropicClient().messages.create({
    model: SELLER_AUDIT_MODEL,
    max_tokens: 3200,
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

  return JSON.parse(jsonMatch[0]) as Partial<AuditReport>;
}

function mergeScorecard(parsed: unknown, fallback: AuditScorecard): AuditScorecard {
  const record = isRecord(parsed) ? parsed : {};
  return {
    abertura: clampNumber(record.abertura, 0, 10, 1) ?? fallback.abertura,
    agilidade: clampNumber(record.agilidade, 0, 10, 1) ?? fallback.agilidade,
    diagnostico: clampNumber(record.diagnostico, 0, 10, 1) ?? fallback.diagnostico,
    conducao: clampNumber(record.conducao, 0, 10, 1) ?? fallback.conducao,
    construcao_valor: clampNumber(record.construcao_valor, 0, 10, 1) ?? fallback.construcao_valor,
    objecoes: clampNumber(record.objecoes, 0, 10, 1) ?? fallback.objecoes,
    fechamento: clampNumber(record.fechamento, 0, 10, 1) ?? fallback.fechamento,
    follow_up: clampNumber(record.follow_up, 0, 10, 1) ?? fallback.follow_up,
    comunicacao: clampNumber(record.comunicacao, 0, 10, 1) ?? fallback.comunicacao,
    consistencia: clampNumber(record.consistencia, 0, 10, 1) ?? fallback.consistencia,
  };
}

function mergePerformanceMetrics(parsed: unknown, fallback: AuditPerformanceMetrics): AuditPerformanceMetrics {
  const record = isRecord(parsed) ? parsed : {};
  return {
    close_attempt_rate: clampNumber(record.close_attempt_rate, 0, 100, 1) ?? fallback.close_attempt_rate,
    follow_up_rate: clampNumber(record.follow_up_rate, 0, 100, 1) ?? fallback.follow_up_rate,
    real_diagnosis_rate: clampNumber(record.real_diagnosis_rate, 0, 100, 1) ?? fallback.real_diagnosis_rate,
    abandonment_rate: clampNumber(record.abandonment_rate, 0, 100, 1) ?? fallback.abandonment_rate,
    poor_objection_handling_rate: clampNumber(record.poor_objection_handling_rate, 0, 100, 1) ?? fallback.poor_objection_handling_rate,
    passive_response_rate: clampNumber(record.passive_response_rate, 0, 100, 1) ?? fallback.passive_response_rate,
  };
}

function mergeLostOpportunities(parsed: unknown, fallback: LostOpportunity[]): LostOpportunity[] {
  if (!Array.isArray(parsed)) return fallback;
  const merged = parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      conversation_id: sanitizeText(item.conversation_id, 80),
      customer_name: sanitizeText(item.customer_name, 120) || null,
      customer_phone_masked: sanitizeText(item.customer_phone_masked, 40) || null,
      what_happened: sanitizeText(item.what_happened, 220),
      why_it_was_lost: sanitizeText(item.why_it_was_lost, 220),
      what_should_have_been_done: sanitizeText(item.what_should_have_been_done, 220),
      impact: ['low', 'medium', 'high'].includes(String(item.impact))
        ? (String(item.impact) as 'low' | 'medium' | 'high')
        : 'medium',
      evidence: sanitizeText(item.evidence, 220) || null,
    }))
    .filter((item) => item.conversation_id.length > 0)
    .slice(0, MAX_OPPORTUNITIES);

  return merged.length ? merged : fallback;
}

function mergeEvidenceSamples(parsed: unknown, fallback: EvidenceSample[]): EvidenceSample[] {
  if (!Array.isArray(parsed)) return fallback;
  const merged = parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      conversation_id: sanitizeText(item.conversation_id, 80),
      customer_name: sanitizeText(item.customer_name, 120) || null,
      customer_phone_masked: sanitizeText(item.customer_phone_masked, 40) || null,
      category: (item.category === 'forte' ? 'forte' : 'fraco') as 'forte' | 'fraco',
      excerpt: sanitizeText(item.excerpt, 240),
    }))
    .filter((item) => item.conversation_id.length > 0 && item.excerpt.length > 0)
    .slice(0, MAX_EVIDENCE_SAMPLES);

  return merged.length ? merged : fallback;
}

function mergeAuditReport(
  parsed: Partial<AuditReport>,
  fallback: AuditReport,
): AuditReport {
  const finalScore = roundScore(clampNumber(parsed.final_score, 0, 10, 1) ?? fallback.final_score);
  const alertLevel = ['verde', 'amarelo', 'laranja', 'vermelho'].includes(String(parsed.alert_level))
    ? (String(parsed.alert_level) as AlertLevel)
    : deriveAlertLevel(finalScore ?? fallback.final_score);

  const recommendedTraining = isRecord(parsed.recommended_training)
    ? {
      priority: sanitizeText(parsed.recommended_training.priority, 40) || (fallback.recommended_training?.priority || 'conducao'),
      reason: sanitizeText(parsed.recommended_training.reason, 220) || (fallback.recommended_training?.reason || ''),
    }
    : fallback.recommended_training;

  const finalQuestions = isRecord(parsed.final_questions)
    ? {
      extracts_opportunities_well: sanitizeText(parsed.final_questions.extracts_opportunities_well, 220) || fallback.final_questions.extracts_opportunities_well,
      needs_more_leads_or_skill: sanitizeText(parsed.final_questions.needs_more_leads_or_skill, 220) || fallback.final_questions.needs_more_leads_or_skill,
      main_problem_skill_or_posture: sanitizeText(parsed.final_questions.main_problem_skill_or_posture, 220) || fallback.final_questions.main_problem_skill_or_posture,
      next_30_days_if_nothing_changes: sanitizeText(parsed.final_questions.next_30_days_if_nothing_changes, 240) || fallback.final_questions.next_30_days_if_nothing_changes,
      train_pressure_monitor_or_replace: sanitizeText(parsed.final_questions.train_pressure_monitor_or_replace, 220) || fallback.final_questions.train_pressure_monitor_or_replace,
    }
    : fallback.final_questions;

  const interventionPlan = isRecord(parsed.intervention_plan_30d)
    ? {
      stop_now: sanitizeStringArray(parsed.intervention_plan_30d.stop_now, 3, 180).length
        ? sanitizeStringArray(parsed.intervention_plan_30d.stop_now, 3, 180)
        : fallback.intervention_plan_30d.stop_now,
      start_now: sanitizeStringArray(parsed.intervention_plan_30d.start_now, 3, 180).length
        ? sanitizeStringArray(parsed.intervention_plan_30d.start_now, 3, 180)
        : fallback.intervention_plan_30d.start_now,
      train_next_30_days: sanitizeStringArray(parsed.intervention_plan_30d.train_next_30_days, 3, 180).length
        ? sanitizeStringArray(parsed.intervention_plan_30d.train_next_30_days, 3, 180)
        : fallback.intervention_plan_30d.train_next_30_days,
    }
    : fallback.intervention_plan_30d;

  return {
    executive_verdict: sanitizeText(parsed.executive_verdict, 500) || fallback.executive_verdict,
    alert_level: alertLevel,
    final_score: finalScore ?? fallback.final_score,
    seller_level: sanitizeText(parsed.seller_level, 40) || deriveSellerLevel(finalScore ?? fallback.final_score),
    scorecard: mergeScorecard(parsed.scorecard, fallback.scorecard),
    performance_metrics: mergePerformanceMetrics(parsed.performance_metrics, fallback.performance_metrics),
    strengths: sanitizeStringArray(parsed.strengths, 5, 180).length ? sanitizeStringArray(parsed.strengths, 5, 180) : fallback.strengths,
    main_errors: sanitizeStringArray(parsed.main_errors, 6, 220).length ? sanitizeStringArray(parsed.main_errors, 6, 220) : fallback.main_errors,
    recurring_patterns: sanitizeStringArray(parsed.recurring_patterns, 6, 220).length ? sanitizeStringArray(parsed.recurring_patterns, 6, 220) : fallback.recurring_patterns,
    operational_impact: sanitizeStringArray(parsed.operational_impact, 5, 220).length ? sanitizeStringArray(parsed.operational_impact, 5, 220) : fallback.operational_impact,
    behavior_profile: sanitizeText(parsed.behavior_profile, 120) || fallback.behavior_profile,
    critical_failures: sanitizeStringArray(parsed.critical_failures, 4, 220).length ? sanitizeStringArray(parsed.critical_failures, 4, 220) : fallback.critical_failures,
    high_failures: sanitizeStringArray(parsed.high_failures, 4, 220).length ? sanitizeStringArray(parsed.high_failures, 4, 220) : fallback.high_failures,
    medium_failures: sanitizeStringArray(parsed.medium_failures, 4, 220).length ? sanitizeStringArray(parsed.medium_failures, 4, 220) : fallback.medium_failures,
    low_failures: sanitizeStringArray(parsed.low_failures, 4, 220).length ? sanitizeStringArray(parsed.low_failures, 4, 220) : fallback.low_failures,
    lost_opportunities: mergeLostOpportunities(parsed.lost_opportunities, fallback.lost_opportunities),
    unfiltered_manager_note: sanitizeText(parsed.unfiltered_manager_note, 420) || fallback.unfiltered_manager_note,
    manager_actions: sanitizeStringArray(parsed.manager_actions, 5, 180).length ? sanitizeStringArray(parsed.manager_actions, 5, 180) : fallback.manager_actions,
    intervention_plan_30d: interventionPlan,
    recommended_training: recommendedTraining,
    final_conclusion: sanitizeText(parsed.final_conclusion, 300) || fallback.final_conclusion,
    final_questions: finalQuestions,
    evidence_samples: mergeEvidenceSamples(parsed.evidence_samples, fallback.evidence_samples),
    totals: fallback.totals,
  };
}

function buildAuditMarkdown(
  agentName: string,
  periodStart: string,
  periodEnd: string,
  report: AuditReport,
): string {
  const opportunityLines = report.lost_opportunities.length
    ? report.lost_opportunities.map((opportunity) =>
      `- [Conversa ${opportunity.conversation_id.slice(0, 8)}](/conversations/${opportunity.conversation_id}) - ${opportunity.what_happened}. Correto seria: ${opportunity.what_should_have_been_done}.`,
    )
    : ['- Nenhuma oportunidade perdida relevante foi consolidada no periodo.'];

  const evidenceLines = report.evidence_samples.length
    ? report.evidence_samples.map((sample) =>
      `- [Conversa ${sample.conversation_id.slice(0, 8)}](/conversations/${sample.conversation_id}) - ${sample.category}: ${sample.excerpt}`,
    )
    : ['- Sem evidencias textuais suficientes no periodo.'];

  return [
    `### Auditoria mensal do vendedor - ${agentName}`,
    '',
    `Periodo: ${periodStart} ate ${periodEnd}`,
    '',
    `**Veredito executivo**`,
    report.executive_verdict,
    '',
    `**Nivel de alerta**`,
    `- ${report.alert_level.toUpperCase()}`,
    '',
    `**Nota final**`,
    `- ${report.final_score != null ? report.final_score.toFixed(1) : '--'}/10`,
    `- Nivel: ${report.seller_level}`,
    '',
    `**Placar por competencia**`,
    `- Abertura: ${report.scorecard.abertura ?? '--'}`,
    `- Agilidade: ${report.scorecard.agilidade ?? '--'}`,
    `- Diagnostico: ${report.scorecard.diagnostico ?? '--'}`,
    `- Conducao: ${report.scorecard.conducao ?? '--'}`,
    `- Construcao de valor: ${report.scorecard.construcao_valor ?? '--'}`,
    `- Objecoes: ${report.scorecard.objecoes ?? '--'}`,
    `- Fechamento: ${report.scorecard.fechamento ?? '--'}`,
    `- Follow-up: ${report.scorecard.follow_up ?? '--'}`,
    `- Comunicacao: ${report.scorecard.comunicacao ?? '--'}`,
    `- Consistencia: ${report.scorecard.consistencia ?? '--'}`,
    '',
    `**O que esta fazendo de errado**`,
    ...report.main_errors.map((item) => `- ${item}`),
    '',
    `**Como esta prejudicando a operacao**`,
    ...report.operational_impact.map((item) => `- ${item}`),
    '',
    `**Perfil predominante**`,
    `- ${report.behavior_profile}`,
    '',
    `**Falhas mais graves**`,
    ...report.critical_failures.map((item) => `- Critica: ${item}`),
    ...report.high_failures.map((item) => `- Alta: ${item}`),
    ...report.medium_failures.map((item) => `- Media: ${item}`),
    ...report.low_failures.map((item) => `- Baixa: ${item}`),
    '',
    `**O que o gestor precisa saber sem filtro**`,
    report.unfiltered_manager_note,
    '',
    `**Oportunidades perdidas**`,
    ...opportunityLines,
    '',
    `**Acoes recomendadas ao gestor**`,
    ...report.manager_actions.map((item) => `- ${item}`),
    '',
    `**Plano de intervencao - 30 dias**`,
    ...report.intervention_plan_30d.stop_now.map((item) => `- Parar agora: ${item}`),
    ...report.intervention_plan_30d.start_now.map((item) => `- Comecar agora: ${item}`),
    ...report.intervention_plan_30d.train_next_30_days.map((item) => `- Treinar: ${item}`),
    '',
    `**Treinamento recomendado**`,
    report.recommended_training
      ? `- ${report.recommended_training.priority}: ${report.recommended_training.reason}`
      : '- Sem recomendacao especifica.',
    '',
    `**Perguntas finais obrigatorias**`,
    `- Extrai bem as oportunidades? ${report.final_questions.extracts_opportunities_well}`,
    `- Precisa de mais lead ou skill? ${report.final_questions.needs_more_leads_or_skill}`,
    `- Problema principal e skill ou postura? ${report.final_questions.main_problem_skill_or_posture}`,
    `- Proximos 30 dias se nada mudar: ${report.final_questions.next_30_days_if_nothing_changes}`,
    `- Treino, pressao, monitoramento ou substituicao? ${report.final_questions.train_pressure_monitor_or_replace}`,
    '',
    `**Evidencias**`,
    ...evidenceLines,
    '',
    `**Conclusao final**`,
    report.final_conclusion,
    '',
    `_Modelo: ${SELLER_AUDIT_MODEL} | Prompt: ${SELLER_AUDIT_PROMPT_VERSION}_`,
  ].join('\n');
}

async function getCompanyAuditSettings(companyId: string): Promise<CompanyAuditSettings> {
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
  const blockedNumbers = new Set<string>();
  let blockTeamAnalysis = false;

  if (isRecord(data) && isRecord(data.settings)) {
    const settings = data.settings;
    const timezoneValue = sanitizeText(settings.timezone, 80);
    if (timezoneValue) timezone = timezoneValue;

    if (Array.isArray(settings.blocked_report_numbers)) {
      for (const item of settings.blocked_report_numbers) {
        const normalized = normalizePhone(typeof item === 'string' ? item : '');
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
      throw new Error(`Failed to load team phones for blocking: ${agentsError.message}`);
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
  agentId: string;
  periodStart: string;
  periodEnd: string;
  companyTimezone: string;
  blockedNumbers: Set<string>;
}): Promise<FeedbackConversation[]> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('get_manager_feedback_conversations', {
      p_company_id: params.companyId,
      p_agent_id: params.agentId,
      p_period_start: params.periodStart,
      p_period_end: params.periodEnd,
      p_timezone: params.companyTimezone,
      p_limit: null,
    });

  if (error) {
    throw new Error(`Failed to load seller audit conversations: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as FeedbackConversation[];
  return rows.filter((row) => !params.blockedNumbers.has(normalizePhone(row.customer_phone)));
}

async function fetchAgent(companyId: string, agentId: string): Promise<AgentRow> {
  const { data, error } = await supabase
    .schema('app')
    .from('agents')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('id', agentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load agent: ${error.message}`);
  }
  if (!data) {
    throw new Error('Agent not found for seller audit run.');
  }
  return data as AgentRow;
}

async function fetchAnalysisRows(companyId: string, agentId: string, conversationIds: string[]): Promise<AnalysisRow[]> {
  if (!conversationIds.length) return [];
  const rows: AnalysisRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('ai_conversation_analysis')
      .select('conversation_id, quality_score, predicted_csat, needs_coaching, training_tags, score_empathy, score_professionalism, score_clarity, score_rapport, score_urgency, score_value_proposition, score_objection_handling, score_investigation, score_commercial_steering, structured_analysis')
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load ai_conversation_analysis: ${error.message}`);
    }

    rows.push(...((data ?? []) as AnalysisRow[]));
  }
  return rows;
}

async function fetchMetricRows(companyId: string, agentId: string, conversationIds: string[]): Promise<MetricRow[]> {
  if (!conversationIds.length) return [];
  const rows: MetricRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('metrics_conversation')
      .select('conversation_id, first_response_time_sec, avg_response_gap_sec, sla_first_response_met')
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load metrics_conversation: ${error.message}`);
    }

    rows.push(...((data ?? []) as MetricRow[]));
  }
  return rows;
}

async function fetchSignalRows(companyId: string, agentId: string, conversationIds: string[]): Promise<SignalRow[]> {
  if (!conversationIds.length) return [];
  const rows: SignalRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('deal_signals')
      .select('conversation_id, loss_risk_level, intent_level, close_probability, next_best_action, estimated_value, stage')
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load deal_signals: ${error.message}`);
    }

    rows.push(...((data ?? []) as SignalRow[]));
  }
  return rows;
}

async function fetchOutcomeRows(companyId: string, agentId: string, conversationIds: string[]): Promise<OutcomeRow[]> {
  if (!conversationIds.length) return [];
  const rows: OutcomeRow[] = [];
  for (const chunk of chunkArray(conversationIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('app')
      .from('revenue_outcomes')
      .select('conversation_id, outcome, value, loss_reason')
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .in('conversation_id', chunk);

    if (error) {
      throw new Error(`Failed to load revenue_outcomes: ${error.message}`);
    }

    rows.push(...((data ?? []) as OutcomeRow[]));
  }
  return rows;
}

async function fetchOpenAlerts(companyId: string, agentId: string): Promise<number> {
  const { count, error } = await supabase
    .schema('app')
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('agent_id', agentId)
    .eq('status', 'open');

  if (error) {
    throw new Error(`Failed to load open alerts: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchRawConversationExternalIds(rawConversationIds: string[]): Promise<Map<string, string>> {
  if (!rawConversationIds.length) return new Map();
  const mapping = new Map<string, string>();
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

async function fetchRawMessages(
  companyId: string,
  externalIds: string[],
): Promise<Map<string, RawMessageRow[]>> {
  const byExternalId = new Map<string, RawMessageRow[]>();
  if (!externalIds.length) return byExternalId;

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
      const current = byExternalId.get(row.conversation_external_id) ?? [];
      current.push(row);
      byExternalId.set(row.conversation_external_id, current);
    }
  }

  return byExternalId;
}

function mapRowsByConversation<T extends { conversation_id: string }>(rows: T[]): Map<string, T> {
  const mapping = new Map<string, T>();
  for (const row of rows) {
    mapping.set(row.conversation_id, row);
  }
  return mapping;
}

async function updateRun(
  runId: string,
  updates: Partial<AISellerAuditRunRow>,
): Promise<void> {
  const { error } = await supabase
    .schema('app')
    .from('ai_seller_audit_runs')
    .update(updates)
    .eq('id', runId);

  if (error) {
    throw new Error(`Failed to update seller audit run ${runId}: ${error.message}`);
  }
}

function buildEmptyAuditReport(agentName: string, openAlerts: number): AuditReport {
  return {
    executive_verdict: `${agentName} nao teve conversas elegiveis no periodo filtrado. Sem base de conversa, nao existe auditoria confiavel para gestor.`,
    alert_level: 'amarelo',
    final_score: null,
    seller_level: 'Sem base',
    scorecard: {
      abertura: null,
      agilidade: null,
      diagnostico: null,
      conducao: null,
      construcao_valor: null,
      objecoes: null,
      fechamento: null,
      follow_up: null,
      comunicacao: null,
      consistencia: null,
    },
    performance_metrics: {
      close_attempt_rate: 0,
      follow_up_rate: 0,
      real_diagnosis_rate: 0,
      abandonment_rate: 0,
      poor_objection_handling_rate: 0,
      passive_response_rate: 0,
    },
    strengths: [],
    main_errors: ['Nao ha conversas suficientes para concluir performance mensal.'],
    recurring_patterns: [],
    operational_impact: [],
    behavior_profile: 'sem base de analise',
    critical_failures: [],
    high_failures: [],
    medium_failures: [],
    low_failures: [],
    lost_opportunities: [],
    unfiltered_manager_note: 'Sem conversa nao existe diagnostico. A gestao precisa primeiro garantir volume ou ampliar o periodo.',
    manager_actions: ['Ampliar o periodo de analise ou validar se houve operacao real no recorte.'],
    intervention_plan_30d: {
      stop_now: [],
      start_now: ['Garantir volume minimo analisavel antes de cobrar conclusoes.'],
      train_next_30_days: [],
    },
    recommended_training: null,
    final_conclusion: 'Nao ha base suficiente para concluir se o problema e skill, postura ou processo.',
    final_questions: {
      extracts_opportunities_well: 'Sem base suficiente.',
      needs_more_leads_or_skill: 'Sem base suficiente.',
      main_problem_skill_or_posture: 'Sem base suficiente.',
      next_30_days_if_nothing_changes: 'A operacao continuara sem visibilidade real deste vendedor.',
      train_pressure_monitor_or_replace: 'Primeiro valide volume operacional.',
    },
    evidence_samples: [],
    totals: {
      conversations_considered: 0,
      analyzed_conversations: 0,
      open_alerts: openAlerts,
    },
  };
}

async function generateSellerAudit(
  run: AISellerAuditRunRow,
): Promise<{ report: AuditReport; markdown: string; totalConversations: number; analyzedCount: number; failedCount: number }> {
  const settings = await getCompanyAuditSettings(run.company_id);
  const companyTimezone = sanitizeText(run.company_timezone, 80) || settings.timezone;
  const agent = await fetchAgent(run.company_id, run.agent_id);
  const conversations = await loadCandidateConversations({
    companyId: run.company_id,
    agentId: run.agent_id,
    periodStart: run.period_start,
    periodEnd: run.period_end,
    companyTimezone,
    blockedNumbers: settings.blockedNumbers,
  });

  const totalConversations = conversations.length;
  const openAlerts = await fetchOpenAlerts(run.company_id, run.agent_id);

  if (totalConversations === 0) {
    const report = buildEmptyAuditReport(agent.name, openAlerts);
    return {
      report,
      markdown: buildAuditMarkdown(agent.name, run.period_start, run.period_end, report),
      totalConversations: 0,
      analyzedCount: 0,
      failedCount: 0,
    };
  }

  const conversationIds = conversations.map((conversation) => conversation.conversation_id);
  const rawConversationIds = conversations.map((conversation) => conversation.raw_conversation_id);
  const [analysisRows, metricRows, signalRows, outcomeRows, externalIdMap] = await Promise.all([
    fetchAnalysisRows(run.company_id, run.agent_id, conversationIds),
    fetchMetricRows(run.company_id, run.agent_id, conversationIds),
    fetchSignalRows(run.company_id, run.agent_id, conversationIds),
    fetchOutcomeRows(run.company_id, run.agent_id, conversationIds),
    fetchRawConversationExternalIds(rawConversationIds),
  ]);

  const rawMessagesMap = await fetchRawMessages(
    run.company_id,
    Array.from(externalIdMap.values()),
  );

  const analysisByConversation = mapRowsByConversation(analysisRows);
  const metricByConversation = mapRowsByConversation(metricRows);
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
          analysisByConversation.get(conversation.conversation_id) ?? null,
          metricByConversation.get(conversation.conversation_id) ?? null,
          signalByConversation.get(conversation.conversation_id) ?? null,
          outcomeByConversation.get(conversation.conversation_id) ?? null,
        ),
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[SellerAudit] Failed to build memory for conversation ${conversation.conversation_id}:`, error);
    }

    if ((index + 1) % 5 === 0 || index === conversations.length - 1) {
      await updateRun(run.id, {
        total_conversations: totalConversations,
        processed_count: index + 1,
        analyzed_count: memories.length,
        failed_count: failedCount,
      });
    }
  }

  const supportMetrics = buildSupportMetrics(
    memories,
    analysisRows,
    metricRows,
    signalRows,
    outcomeRows,
    openAlerts,
  );
  const fallbackReport = buildFallbackAuditReport(agent.name, supportMetrics, memories);

  let parsedReport: Partial<AuditReport> = {};
  try {
    parsedReport = await callClaudeForSellerAudit(
      agent.name,
      run.period_start,
      run.period_end,
      supportMetrics,
      memories,
    );
  } catch (error) {
    console.error(`[SellerAudit] Claude generation failed for run ${run.id}, using fallback report:`, error);
  }

  const report = mergeAuditReport(parsedReport, fallbackReport);
  return {
    report,
    markdown: buildAuditMarkdown(agent.name, run.period_start, run.period_end, report),
    totalConversations,
    analyzedCount: memories.length,
    failedCount,
  };
}

async function completeRun(
  runId: string,
  report: AuditReport,
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
    model_used: SELLER_AUDIT_MODEL,
    prompt_version: SELLER_AUDIT_PROMPT_VERSION,
    error_message: null,
    finished_at: new Date().toISOString(),
  });
}

async function failRun(runId: string, totalConversations: number, analyzedCount: number, failedCount: number, errorMessage: string): Promise<void> {
  await updateRun(runId, {
    status: 'failed',
    total_conversations: totalConversations,
    processed_count: totalConversations,
    analyzed_count: analyzedCount,
    failed_count: failedCount,
    error_message: errorMessage,
    finished_at: new Date().toISOString(),
  });
}

async function reuseFreshRun(currentRun: AISellerAuditRunRow, existing: AISellerAuditRunRow): Promise<void> {
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

async function executeSellerAuditRun(run: AISellerAuditRunRow): Promise<AISellerAuditRunRow> {
  const fresh = await findFreshCompletedSellerAuditRun({
    companyId: run.company_id,
    agentId: run.agent_id,
    periodStart: run.period_start,
    periodEnd: run.period_end,
  }, run.id);

  if (fresh) {
    await reuseFreshRun(run, fresh);
    const { data } = await supabase
      .schema('app')
      .from('ai_seller_audit_runs')
      .select('*')
      .eq('id', run.id)
      .single();
    return data as AISellerAuditRunRow;
  }

  try {
    const generated = await generateSellerAudit(run);
    await completeRun(
      run.id,
      generated.report,
      generated.markdown,
      generated.totalConversations,
      generated.analyzedCount,
      generated.failedCount,
    );
  } catch (error) {
    const message = trimErrorMessage(error);
    await failRun(run.id, run.total_conversations ?? 0, run.analyzed_count ?? 0, run.failed_count ?? 0, message);
    throw error;
  }

  const { data, error } = await supabase
    .schema('app')
    .from('ai_seller_audit_runs')
    .select('*')
    .eq('id', run.id)
    .single();

  if (error || !data) {
    throw new Error(`Failed to reload seller audit run ${run.id}: ${error?.message ?? 'not found'}`);
  }

  return data as AISellerAuditRunRow;
}

export async function findFreshCompletedSellerAuditRun(
  params: {
    companyId: string;
    agentId: string;
    periodStart: string;
    periodEnd: string;
  },
  excludeRunId?: string,
): Promise<AISellerAuditRunRow | null> {
  let query = supabase
    .schema('app')
    .from('ai_seller_audit_runs')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('agent_id', params.agentId)
    .eq('period_start', params.periodStart)
    .eq('period_end', params.periodEnd)
    .eq('prompt_version', SELLER_AUDIT_PROMPT_VERSION)
    .eq('status', 'completed')
    .gte('created_at', new Date(Date.now() - SELLER_AUDIT_FRESH_HOURS * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (excludeRunId) {
    query = query.neq('id', excludeRunId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to query fresh seller audit runs: ${error.message}`);
  }

  return (data as AISellerAuditRunRow | null) ?? null;
}

export async function queueSellerAuditRun(params: {
  companyId: string;
  requestedByUserId: string;
  agentId: string;
  periodStart: string;
  periodEnd: string;
  companyTimezone: string;
  source: AuditSource;
}): Promise<{ run: AISellerAuditRunRow; reused: boolean }> {
  const existing = await findFreshCompletedSellerAuditRun({
    companyId: params.companyId,
    agentId: params.agentId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  if (existing) {
    return { run: existing, reused: true };
  }

  const settings = await getCompanyAuditSettings(params.companyId);
  const conversations = await loadCandidateConversations({
    companyId: params.companyId,
    agentId: params.agentId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    companyTimezone: sanitizeText(params.companyTimezone, 80) || settings.timezone,
    blockedNumbers: settings.blockedNumbers,
  });

  const { data, error } = await supabase
    .schema('app')
    .from('ai_seller_audit_runs')
    .insert({
      company_id: params.companyId,
      requested_by_user_id: params.requestedByUserId,
      agent_id: params.agentId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      company_timezone: sanitizeText(params.companyTimezone, 80) || settings.timezone,
      source: params.source,
      status: 'queued',
      total_conversations: conversations.length,
      processed_count: 0,
      analyzed_count: 0,
      failed_count: 0,
      prompt_version: SELLER_AUDIT_PROMPT_VERSION,
      report_json: {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to queue seller audit run: ${error?.message ?? 'unknown error'}`);
  }

  return { run: data as AISellerAuditRunRow, reused: false };
}

export async function ensureSellerAuditReport(params: {
  companyId: string;
  requestedByUserId: string;
  agentId: string;
  periodStart: string;
  periodEnd: string;
  companyTimezone: string;
  source: AuditSource;
}): Promise<AISellerAuditRunRow> {
  const existing = await findFreshCompletedSellerAuditRun({
    companyId: params.companyId,
    agentId: params.agentId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  if (existing) return existing;

  const settings = await getCompanyAuditSettings(params.companyId);
  const conversations = await loadCandidateConversations({
    companyId: params.companyId,
    agentId: params.agentId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    companyTimezone: sanitizeText(params.companyTimezone, 80) || settings.timezone,
    blockedNumbers: settings.blockedNumbers,
  });

  const { data, error } = await supabase
    .schema('app')
    .from('ai_seller_audit_runs')
    .insert({
      company_id: params.companyId,
      requested_by_user_id: params.requestedByUserId,
      agent_id: params.agentId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      company_timezone: sanitizeText(params.companyTimezone, 80) || settings.timezone,
      source: params.source,
      status: 'running',
      total_conversations: conversations.length,
      processed_count: 0,
      analyzed_count: 0,
      failed_count: 0,
      prompt_version: SELLER_AUDIT_PROMPT_VERSION,
      report_json: {},
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create inline seller audit run: ${error?.message ?? 'unknown error'}`);
  }

  return executeSellerAuditRun(data as AISellerAuditRunRow);
}

async function dequeueSellerAuditRun(): Promise<AISellerAuditRunRow | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_ai_seller_audit_run');

  if (error) {
    throw new Error(`[SellerAudit] Failed to dequeue run: ${error.message}`);
  }

  return coerceRpcSingleRow<AISellerAuditRunRow>(data);
}

export async function processSellerAuditRuns(): Promise<void> {
  const run = await dequeueSellerAuditRun();
  if (!run) {
    console.log('[SellerAudit] No queued seller audit runs.');
    return;
  }

  try {
    await executeSellerAuditRun(run);
    console.log(`[SellerAudit] Run ${run.id} completed.`);
  } catch (error) {
    console.error(`[SellerAudit] Run ${run.id} failed:`, error);
  }
}
