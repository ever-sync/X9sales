import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v1-manager-copilot';
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const SAMPLE_MAX_CONVERSATIONS = 8;
const SAMPLE_MAX_SNIPPETS = 12;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ManagerFeedbackJob {
  id: string;
  thread_id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string;
  period_start: string;
  period_end: string;
  company_timezone: string;
  status: JobStatus;
  total_conversations: number;
  processed_count: number;
  quick_answer_message_id: string | null;
  final_answer_message_id: string | null;
  result_summary: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
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

interface AnalysisRow {
  conversation_id: string;
  quality_score: number | null;
  predicted_csat: number | null;
  needs_coaching: boolean;
  training_tags: string[] | null;
}

interface MetricRow {
  conversation_id: string;
  first_response_time_sec: number | null;
  sla_first_response_met: boolean | null;
}

interface SignalRow {
  conversation_id: string;
  loss_risk_level: 'baixo' | 'medio' | 'alto';
  intent_level: 'fria' | 'morna' | 'quente';
  close_probability: number | null;
  next_best_action: string | null;
}

interface OutcomeRow {
  conversation_id: string;
  outcome: 'won' | 'lost' | 'open';
  value: number;
  loss_reason: string | null;
}

interface AgentRow {
  id: string;
  name: string;
}

interface MessageRow {
  conversation_id: string;
  sender_type: 'agent' | 'customer' | 'system' | 'bot';
  content: string | null;
  created_at: string;
}

interface EvidenceSnippet {
  conversation_id: string;
  started_at: string;
  customer_name: string | null;
  customer_phone_masked: string | null;
  category: 'forte' | 'fraco';
  snippet: string;
}

interface AggregatedStats {
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

interface LlmStructuredFeedback {
  resumo_executivo: string;
  pontos_fortes: string[];
  pontos_fracos: string[];
  insights_preciosos: string[];
  plano_acao_7d: string[];
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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toFixedOrNull(value: number | null, digits: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function trimErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? 'Unknown error');
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  const middleLen = Math.max(digits.length - 6, 2);
  return `${digits.slice(0, 4)}${'*'.repeat(middleLen)}${digits.slice(-2)}`;
}

function pickSampleConversationIds(
  conversations: FeedbackConversation[],
  analyses: AnalysisRow[],
  signals: SignalRow[],
  outcomes: OutcomeRow[],
): string[] {
  const byScoreDesc = [...analyses]
    .filter((row) => typeof row.quality_score === 'number')
    .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
    .map((row) => row.conversation_id);

  const byScoreAsc = [...analyses]
    .filter((row) => typeof row.quality_score === 'number')
    .sort((a, b) => (a.quality_score ?? 0) - (b.quality_score ?? 0))
    .map((row) => row.conversation_id);

  const coachingIds = analyses
    .filter((row) => row.needs_coaching)
    .map((row) => row.conversation_id);

  const highRiskIds = signals
    .filter((row) => row.loss_risk_level === 'alto')
    .map((row) => row.conversation_id);

  const lostIds = outcomes
    .filter((row) => row.outcome === 'lost')
    .map((row) => row.conversation_id);

  const orderedFallback = conversations.map((row) => row.conversation_id);

  const combined = [
    ...byScoreDesc.slice(0, 3),
    ...byScoreAsc.slice(0, 3),
    ...coachingIds.slice(0, 3),
    ...highRiskIds.slice(0, 3),
    ...lostIds.slice(0, 3),
    ...orderedFallback.slice(0, 6),
  ];

  const unique: string[] = [];
  for (const conversationId of combined) {
    if (unique.includes(conversationId)) continue;
    unique.push(conversationId);
    if (unique.length >= SAMPLE_MAX_CONVERSATIONS) break;
  }

  return unique;
}

function buildSnippets(
  sampleConversations: FeedbackConversation[],
  analysesByConversation: Map<string, AnalysisRow>,
  messagesByConversation: Map<string, MessageRow[]>,
): EvidenceSnippet[] {
  const evidence: EvidenceSnippet[] = [];

  for (const conversation of sampleConversations) {
    const messages = messagesByConversation.get(conversation.conversation_id) ?? [];
    const textual = messages
      .map((message) => (message.content ?? '').trim())
      .filter((line) => line.length > 0);

    if (!textual.length) continue;

    const analysis = analysesByConversation.get(conversation.conversation_id);
    const category: EvidenceSnippet['category'] =
      analysis?.needs_coaching || (analysis?.quality_score ?? 100) < 65 ? 'fraco' : 'forte';

    const snippetLines = textual.slice(0, 2).concat(textual.slice(-1)).slice(0, 3);
    evidence.push({
      conversation_id: conversation.conversation_id,
      started_at: conversation.started_at,
      customer_name: conversation.customer_name,
      customer_phone_masked: maskPhone(conversation.customer_phone),
      category,
      snippet: snippetLines.join(' | ').slice(0, 320),
    });
  }

  return evidence.slice(0, SAMPLE_MAX_SNIPPETS);
}

function formatMetric(value: number | null, digits = 1, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${value.toFixed(digits)}${suffix}`;
}

function buildFallbackStructuredFeedback(
  agentName: string,
  periodStart: string,
  periodEnd: string,
  stats: AggregatedStats,
): LlmStructuredFeedback {
  return {
    resumo_executivo:
      `No periodo de ${periodStart} a ${periodEnd}, ${agentName} teve ${stats.total_conversations} conversas, ` +
      `score medio ${formatMetric(stats.avg_quality_score, 0)} e CSAT previsto ${formatMetric(stats.avg_predicted_csat, 2)}.`,
    pontos_fortes: [
      `SLA de primeira resposta em ${formatMetric(stats.sla_first_response_pct, 1, '%')}.`,
      `Intencao quente identificada em ${stats.hot_intent_count} conversa(s).`,
      `Receita ganha no periodo de R$ ${formatMetric(stats.won_value, 2)}.`,
    ],
    pontos_fracos: [
      `${stats.coaching_needed_count} conversa(s) marcadas com necessidade de coaching.`,
      `${stats.high_risk_count} conversa(s) com risco alto de perda.`,
      `${stats.lost_count} outcome(s) perdidos no periodo.`,
    ],
    insights_preciosos: [
      'Padroes de perda tendem a aparecer junto com risco alto e baixa velocidade de resposta.',
      'Conversas com melhor score costumam apresentar maior clareza de proposta e fechamento objetivo.',
      'Acoes de coaching devem priorizar contorno de objecao e follow-up com prazo.',
    ],
    plano_acao_7d: [
      'Revisar diariamente conversas de risco alto e aplicar follow-up em ate 30 minutos.',
      'Treinar roteiro de proposta de valor e CTA para reduzir conversas mornas sem proximo passo.',
      'Acompanhar score IA e CSAT previsto por lote de conversas para feedback continuo.',
    ],
  };
}

async function callClaudeForStructuredFeedback(
  payload: {
    agentName: string;
    periodStart: string;
    periodEnd: string;
    stats: AggregatedStats;
    evidence: EvidenceSnippet[];
  },
): Promise<LlmStructuredFeedback> {
  if (!config.anthropicApiKey) {
    return buildFallbackStructuredFeedback(
      payload.agentName,
      payload.periodStart,
      payload.periodEnd,
      payload.stats,
    );
  }

  const systemPrompt =
    'Voce e um especialista em performance de atendimento para gestores. ' +
    'Responda apenas em JSON valido, em portugues, sem texto adicional.';

  const userPrompt =
    `Atendente: ${payload.agentName}\n` +
    `Periodo: ${payload.periodStart} ate ${payload.periodEnd}\n\n` +
    `Metricas agregadas:\n${JSON.stringify(payload.stats, null, 2)}\n\n` +
    `Evidencias amostradas:\n${JSON.stringify(payload.evidence, null, 2)}\n\n` +
    'Retorne JSON com a estrutura:\n' +
    '{\n' +
    '  "resumo_executivo": "texto curto",\n' +
    '  "pontos_fortes": ["3-5 itens objetivos"],\n' +
    '  "pontos_fracos": ["3-5 itens objetivos"],\n' +
    '  "insights_preciosos": ["3-5 insights acionaveis"],\n' +
    '  "plano_acao_7d": ["3-5 passos praticos"]\n' +
    '}';

  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const firstContent = response.content[0];
  if (firstContent.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude.');
  }

  const jsonMatch = firstContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return JSON: ${firstContent.text.slice(0, 220)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmStructuredFeedback>;
  const fallback = buildFallbackStructuredFeedback(
    payload.agentName,
    payload.periodStart,
    payload.periodEnd,
    payload.stats,
  );

  return {
    resumo_executivo: parsed.resumo_executivo?.toString().trim() || fallback.resumo_executivo,
    pontos_fortes: Array.isArray(parsed.pontos_fortes) && parsed.pontos_fortes.length
      ? parsed.pontos_fortes.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 5)
      : fallback.pontos_fortes,
    pontos_fracos: Array.isArray(parsed.pontos_fracos) && parsed.pontos_fracos.length
      ? parsed.pontos_fracos.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 5)
      : fallback.pontos_fracos,
    insights_preciosos: Array.isArray(parsed.insights_preciosos) && parsed.insights_preciosos.length
      ? parsed.insights_preciosos.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 5)
      : fallback.insights_preciosos,
    plano_acao_7d: Array.isArray(parsed.plano_acao_7d) && parsed.plano_acao_7d.length
      ? parsed.plano_acao_7d.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 5)
      : fallback.plano_acao_7d,
  };
}

function buildFinalMarkdown(
  agentName: string,
  periodStart: string,
  periodEnd: string,
  stats: AggregatedStats,
  structured: LlmStructuredFeedback,
  evidence: EvidenceSnippet[],
): string {
  const evidenceLines = evidence.map((item) => {
    const customerName = item.customer_name?.trim() || 'Cliente';
    const phone = item.customer_phone_masked ? ` (${item.customer_phone_masked})` : '';
    const category = item.category === 'forte' ? 'forte' : 'fraco';
    return `- [Conversa ${item.conversation_id.slice(0, 8)}](/conversations/${item.conversation_id}) ` +
      `- ${customerName}${phone} - ponto ${category}: ${item.snippet}`;
  });

  return [
    `### Analise profunda - ${agentName}`,
    '',
    `Periodo: ${periodStart} ate ${periodEnd}`,
    '',
    `**Resumo executivo**`,
    structured.resumo_executivo,
    '',
    `**Pontos fortes**`,
    ...structured.pontos_fortes.map((item) => `- ${item}`),
    '',
    `**Pontos fracos**`,
    ...structured.pontos_fracos.map((item) => `- ${item}`),
    '',
    `**Insights preciosos**`,
    ...structured.insights_preciosos.map((item) => `- ${item}`),
    '',
    `**Plano de acao (7 dias)**`,
    ...structured.plano_acao_7d.map((item) => `- ${item}`),
    '',
    `**Evidencias**`,
    ...(evidenceLines.length ? evidenceLines : ['- Sem evidencias textuais suficientes no periodo.']),
    '',
    `**Painel rapido**`,
    `- Conversas: ${stats.total_conversations}`,
    `- Score medio IA: ${formatMetric(stats.avg_quality_score, 0)}`,
    `- CSAT previsto medio: ${formatMetric(stats.avg_predicted_csat, 2)}`,
    `- Coaching recomendado: ${stats.coaching_needed_count}`,
    `- SLA primeira resposta: ${formatMetric(stats.sla_first_response_pct, 1, '%')}`,
    `- Receita ganha: R$ ${formatMetric(stats.won_value, 2)}`,
    '',
    `_Modelo: ${MODEL} | Prompt: ${PROMPT_VERSION}_`,
  ].join('\n');
}

export async function processManagerFeedbackJobs(): Promise<void> {
  const job = await dequeueManagerFeedbackJob();
  if (!job) {
    console.log('[ManagerFeedback] No queued jobs.');
    return;
  }

  await runManagerFeedbackJob(job);
}

async function dequeueManagerFeedbackJob(): Promise<ManagerFeedbackJob | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_manager_feedback_job');

  if (error) {
    throw new Error(`[ManagerFeedback] Failed to dequeue job: ${error.message}`);
  }

  return coerceRpcSingleRow<ManagerFeedbackJob>(data);
}

async function runManagerFeedbackJob(job: ManagerFeedbackJob): Promise<void> {
  try {
    const { data: agent, error: agentError } = await supabase
      .schema('app')
      .from('agents')
      .select('id, name')
      .eq('id', job.agent_id)
      .eq('company_id', job.company_id)
      .maybeSingle();

    if (agentError) {
      throw new Error(`Failed to load agent: ${agentError.message}`);
    }
    if (!agent) {
      throw new Error('Agent not found for manager feedback job.');
    }

    const { data: candidateData, error: candidatesError } = await supabase
      .schema('app')
      .rpc('get_manager_feedback_conversations', {
        p_company_id: job.company_id,
        p_agent_id: job.agent_id,
        p_period_start: job.period_start,
        p_period_end: job.period_end,
        p_timezone: job.company_timezone,
        p_limit: null,
      });

    if (candidatesError) {
      throw new Error(`Failed to load conversations for job ${job.id}: ${candidatesError.message}`);
    }

    const conversations = (Array.isArray(candidateData) ? candidateData : []) as FeedbackConversation[];
    const totalConversations = conversations.length;
    const conversationIds = conversations.map((row) => row.conversation_id);

    if (totalConversations === 0) {
      await finishEmptyJob(job, agent as AgentRow);
      return;
    }

    const analysisRows = await fetchAnalysisRows(job.company_id, job.agent_id, conversationIds);
    const metricRows = await fetchMetricRows(job.company_id, job.agent_id, conversationIds);
    const signalRows = await fetchSignalRows(job.company_id, job.agent_id, conversationIds);
    const outcomeRows = await fetchOutcomeRows(job.company_id, job.agent_id, conversationIds);
    const openAlerts = await fetchOpenAlerts(job.company_id, job.agent_id);

    const stats = buildAggregatedStats({
      totalConversations,
      analysisRows,
      metricRows,
      signalRows,
      outcomeRows,
      openAlerts,
    });

    const sampleConversationIds = pickSampleConversationIds(
      conversations,
      analysisRows,
      signalRows,
      outcomeRows,
    );

    const sampleConversations = conversations.filter((row) =>
      sampleConversationIds.includes(row.conversation_id)
    );

    const messages = await fetchMessagesForSamples(job.company_id, sampleConversationIds);
    const messagesByConversation = groupMessagesByConversation(messages);
    const analysesByConversation = new Map(analysisRows.map((row) => [row.conversation_id, row]));
    const evidence = buildSnippets(sampleConversations, analysesByConversation, messagesByConversation);

    const structured = await callClaudeForStructuredFeedback({
      agentName: (agent as AgentRow).name,
      periodStart: job.period_start,
      periodEnd: job.period_end,
      stats,
      evidence,
    });

    const finalMarkdown = buildFinalMarkdown(
      (agent as AgentRow).name,
      job.period_start,
      job.period_end,
      stats,
      structured,
      evidence,
    );

    if (job.final_answer_message_id) {
      const { error: messageUpdateError } = await supabase
        .schema('app')
        .from('manager_copilot_messages')
        .update({
          status: 'ready',
          content_md: finalMarkdown,
          sources: evidence.map((row) => ({
            conversation_id: row.conversation_id,
            category: row.category,
            customer_phone_masked: row.customer_phone_masked,
          })),
          meta: {
            mode: 'deep',
            model_used: MODEL,
            prompt_version: PROMPT_VERSION,
            period_start: job.period_start,
            period_end: job.period_end,
          },
        })
        .eq('id', job.final_answer_message_id);

      if (messageUpdateError) {
        throw new Error(`Failed to update final message: ${messageUpdateError.message}`);
      }
    }

    const nowIso = new Date().toISOString();
    const { error: jobUpdateError } = await supabase
      .schema('app')
      .from('manager_feedback_jobs')
      .update({
        status: 'completed',
        total_conversations: totalConversations,
        processed_count: totalConversations,
        result_summary: {
          stats,
          structured,
          evidence_count: evidence.length,
        },
        error_message: null,
        finished_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', job.id);

    if (jobUpdateError) {
      throw new Error(`Failed to update job as completed: ${jobUpdateError.message}`);
    }

    await supabase
      .schema('app')
      .from('manager_copilot_threads')
      .update({ updated_at: nowIso })
      .eq('id', job.thread_id);

    console.log(
      `[ManagerFeedback] Job ${job.id} completed. conversations=${totalConversations}, evidence=${evidence.length}`,
    );
  } catch (error) {
    const message = trimErrorMessage(error);
    console.error(`[ManagerFeedback] Job ${job.id} failed: ${message}`);
    await failJob(job, message);
  }
}

async function finishEmptyJob(job: ManagerFeedbackJob, agent: AgentRow): Promise<void> {
  const markdown = [
    `### Analise profunda - ${agent.name}`,
    '',
    `Periodo: ${job.period_start} ate ${job.period_end}`,
    '',
    'Nao foram encontradas conversas elegiveis para este atendente no periodo informado.',
    '',
    'Dica: amplie a janela de datas para obter feedback acionavel.',
  ].join('\n');

  if (job.final_answer_message_id) {
    await supabase
      .schema('app')
      .from('manager_copilot_messages')
      .update({
        status: 'ready',
        content_md: markdown,
        sources: [],
        meta: { mode: 'deep', reason: 'no_conversations' },
      })
      .eq('id', job.final_answer_message_id);
  }

  const nowIso = new Date().toISOString();
  await supabase
    .schema('app')
    .from('manager_feedback_jobs')
    .update({
      status: 'completed',
      total_conversations: 0,
      processed_count: 0,
      result_summary: { stats: { total_conversations: 0 } },
      error_message: null,
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', job.id);

  await supabase
    .schema('app')
    .from('manager_copilot_threads')
    .update({ updated_at: nowIso })
    .eq('id', job.thread_id);

  console.log(`[ManagerFeedback] Job ${job.id} completed with zero conversations.`);
}

async function failJob(job: ManagerFeedbackJob, errorMessage: string): Promise<void> {
  const nowIso = new Date().toISOString();

  if (job.final_answer_message_id) {
    await supabase
      .schema('app')
      .from('manager_copilot_messages')
      .update({
        status: 'error',
        content_md: 'Nao foi possivel concluir a analise profunda. Tente novamente.',
        meta: {
          mode: 'deep',
          error_message: errorMessage,
        },
      })
      .eq('id', job.final_answer_message_id);
  }

  await supabase
    .schema('app')
    .from('manager_feedback_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', job.id);
}

function groupMessagesByConversation(messages: MessageRow[]): Map<string, MessageRow[]> {
  const byConversation = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const current = byConversation.get(message.conversation_id) ?? [];
    current.push(message);
    byConversation.set(message.conversation_id, current);
  }
  return byConversation;
}

async function fetchAnalysisRows(
  companyId: string,
  agentId: string,
  conversationIds: string[],
): Promise<AnalysisRow[]> {
  const rows: AnalysisRow[] = [];
  for (const chunk of chunkArray(conversationIds, 150)) {
    const { data, error } = await supabase
      .schema('app')
      .from('ai_conversation_analysis')
      .select('conversation_id, quality_score, predicted_csat, needs_coaching, training_tags')
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

async function fetchMetricRows(
  companyId: string,
  agentId: string,
  conversationIds: string[],
): Promise<MetricRow[]> {
  const rows: MetricRow[] = [];
  for (const chunk of chunkArray(conversationIds, 150)) {
    const { data, error } = await supabase
      .schema('app')
      .from('metrics_conversation')
      .select('conversation_id, first_response_time_sec, sla_first_response_met')
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

async function fetchSignalRows(
  companyId: string,
  agentId: string,
  conversationIds: string[],
): Promise<SignalRow[]> {
  const rows: SignalRow[] = [];
  for (const chunk of chunkArray(conversationIds, 150)) {
    const { data, error } = await supabase
      .schema('app')
      .from('deal_signals')
      .select('conversation_id, loss_risk_level, intent_level, close_probability, next_best_action')
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

async function fetchOutcomeRows(
  companyId: string,
  agentId: string,
  conversationIds: string[],
): Promise<OutcomeRow[]> {
  const rows: OutcomeRow[] = [];
  for (const chunk of chunkArray(conversationIds, 150)) {
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

async function fetchMessagesForSamples(
  companyId: string,
  sampleConversationIds: string[],
): Promise<MessageRow[]> {
  if (!sampleConversationIds.length) return [];

  const rows: MessageRow[] = [];
  for (const chunk of chunkArray(sampleConversationIds, 30)) {
    const { data, error } = await supabase
      .schema('app')
      .from('messages')
      .select('conversation_id, sender_type, content, created_at')
      .eq('company_id', companyId)
      .in('conversation_id', chunk)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to load app.messages samples: ${error.message}`);
    }
    rows.push(...((data ?? []) as MessageRow[]));
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

function buildAggregatedStats(params: {
  totalConversations: number;
  analysisRows: AnalysisRow[];
  metricRows: MetricRow[];
  signalRows: SignalRow[];
  outcomeRows: OutcomeRow[];
  openAlerts: number;
}): AggregatedStats {
  const qualityAvg = average(
    params.analysisRows
      .map((row) => row.quality_score)
      .filter((value): value is number => typeof value === 'number'),
  );
  const csatAvg = average(
    params.analysisRows
      .map((row) => row.predicted_csat)
      .filter((value): value is number => typeof value === 'number'),
  );
  const frtAvg = average(
    params.metricRows
      .map((row) => row.first_response_time_sec)
      .filter((value): value is number => typeof value === 'number'),
  );

  const slaMeasured = params.metricRows.filter((row) => row.sla_first_response_met !== null);
  const slaMet = slaMeasured.filter((row) => row.sla_first_response_met === true).length;

  const wonRows = params.outcomeRows.filter((row) => row.outcome === 'won');
  const lostRows = params.outcomeRows.filter((row) => row.outcome === 'lost');

  return {
    total_conversations: params.totalConversations,
    avg_quality_score: toFixedOrNull(qualityAvg, 2),
    avg_predicted_csat: toFixedOrNull(csatAvg, 2),
    coaching_needed_count: params.analysisRows.filter((row) => row.needs_coaching).length,
    avg_first_response_sec: toFixedOrNull(frtAvg, 2),
    sla_first_response_pct: slaMeasured.length ? toFixedOrNull((slaMet / slaMeasured.length) * 100, 2) : null,
    high_risk_count: params.signalRows.filter((row) => row.loss_risk_level === 'alto').length,
    hot_intent_count: params.signalRows.filter((row) => row.intent_level === 'quente').length,
    won_count: wonRows.length,
    lost_count: lostRows.length,
    won_value: toFixedOrNull(wonRows.reduce((sum, row) => sum + Number(row.value || 0), 0), 2) ?? 0,
    open_alerts: params.openAlerts,
  };
}
