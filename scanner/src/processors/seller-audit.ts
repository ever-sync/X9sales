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
    closeAttemptRegex.test(agentText) ||
    /confirma|segue|avanco|avanço|pagamento|pedido/i.test(lastMessageText);

  const followUpPresent =
    existing?.follow_up_present ??
    followUpRegex.test(agentText) ||
    agentMessages.length >= 3;

  const realDiagnosis =
    existing?.real_diagnosis ??
    agentQuestionCount >= 2 ||
    /necessidade|objetivo|cenario|cenário|dor/i.test(agentText);

  const passiveResponse =
    existing?.passive_response ??
    failureTags.includes('passividade') ||
    failureTags.includes('sem_conducao') ||
    (agentQuestionCount === 0 && !closeAttemptRegex.test(agentText));

  const objectionMishandled =
    existing?.objection_mishandled ??
    failureTags.includes('objecao_ignorada') ||
    (objectionRegex.test(customerText) && !/porque|entendo|faz sentido|o que te trava|o que te preocupa/i.test(agentText));

  const abandonedWithoutNextStep =
    existing?.abandoned_without_next_step ??
    failureTags.includes('sem_proximo_passo') ||
    failureTags.includes('perda_timing') ||
    (!!lastMessage && lastMessage.sender_type === 'customer' && !closeAttempted);

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
