import { supabase } from '../config';

const MODEL = 'heuristic-copilot-v1';
const PROMPT_VERSION = 'v1';
const MAX_ERROR_MESSAGE_LENGTH = 2000;

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
type JobScope = 'single' | 'all';
type AnalysisOutcome = 'analyzed' | 'skipped';
type DealStage = 'descoberta' | 'proposta' | 'objecao' | 'fechamento' | 'pos_venda';
type IntentLevel = 'fria' | 'morna' | 'quente';
type LossRiskLevel = 'baixo' | 'medio' | 'alto';

interface RevenueCopilotJobRow {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  agent_id: string | null;
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
  agent_id: string | null;
  raw_conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
}

interface MessageRow {
  sender_type: 'agent' | 'customer' | 'system' | 'bot';
  content: string | null;
  created_at: string;
}

interface DealSignalAnalysis {
  stage: DealStage;
  intent_level: IntentLevel;
  loss_risk_level: LossRiskLevel;
  estimated_value: number | null;
  close_probability: number;
  next_best_action: string;
  suggested_reply: string;
}

function coerceRpcSingleRow<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return value as T;
}

function trimErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? 'Unknown error');
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function textIncludesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseCurrencyToNumber(raw: string): number | null {
  const normalized = raw
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/\s/g, '')
    .trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function detectEstimatedValue(messages: MessageRow[]): number | null {
  const regex = /(?:r\$|\$)\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)/gi;
  let maxValue: number | null = null;

  for (const message of messages) {
    if (!message.content) continue;
    const content = message.content;
    let match: RegExpExecArray | null = regex.exec(content);
    while (match) {
      const parsed = parseCurrencyToNumber(match[1]);
      if (parsed != null && (maxValue == null || parsed > maxValue)) {
        maxValue = parsed;
      }
      match = regex.exec(content);
    }
  }

  return maxValue;
}

function detectStage(transcriptLower: string): DealStage {
  if (textIncludesAny(transcriptLower, [
    'entrega',
    'pos venda',
    'pós venda',
    'suporte',
    'garantia',
    'acompanhamento',
    'instalacao',
    'instalação',
  ])) {
    return 'pos_venda';
  }

  if (textIncludesAny(transcriptLower, [
    'fechar',
    'contratar',
    'confirmo',
    'confirmar agora',
    'pagar',
    'pix',
    'boleto',
    'cartao',
    'cartão',
    'assinar',
    'assinatura',
    'pedido final',
  ])) {
    return 'fechamento';
  }

  if (textIncludesAny(transcriptLower, [
    'caro',
    'muito caro',
    'desconto',
    'nao tenho certeza',
    'não tenho certeza',
    'vou pensar',
    'concorrente',
    'objecao',
    'objeção',
  ])) {
    return 'objecao';
  }

  if (textIncludesAny(transcriptLower, [
    'valor',
    'preco',
    'preço',
    'orcamento',
    'orçamento',
    'proposta',
    'plano',
    'pacote',
    'condicao',
    'condição',
  ])) {
    return 'proposta';
  }

  return 'descoberta';
}

function detectIntent(transcriptLower: string): IntentLevel {
  if (textIncludesAny(transcriptLower, [
    'quero fechar',
    'vamos fechar',
    'pode emitir',
    'pode gerar',
    'quero contratar',
    'consigo pagar',
    'vamos seguir',
    'vou pagar',
    'fecha pra mim',
  ])) {
    return 'quente';
  }

  if (textIncludesAny(transcriptLower, [
    'quanto custa',
    'quanto fica',
    'tenho interesse',
    'como funciona',
    'me passa',
    'valor',
    'preco',
    'preço',
    'orcamento',
    'orçamento',
  ])) {
    return 'morna';
  }

  return 'fria';
}

function detectLossRisk(
  status: string,
  lastCustomerMessageAt: Date | null,
  lastAgentMessageAt: Date | null,
  stage: DealStage,
  intent: IntentLevel,
): LossRiskLevel {
  if (status === 'waiting') return 'alto';
  if (!lastCustomerMessageAt) return 'baixo';

  const now = Date.now();
  const customerMs = lastCustomerMessageAt.getTime();
  const agentMs = lastAgentMessageAt?.getTime() ?? 0;
  const isCustomerWaitingForAgent = customerMs > agentMs;

  if (isCustomerWaitingForAgent) {
    const gapHours = (now - customerMs) / (1000 * 60 * 60);
    if (gapHours >= 6) return 'alto';
    if (gapHours >= 2) return 'medio';
  }

  if (stage === 'objecao' && intent !== 'quente') return 'medio';
  return 'baixo';
}

function computeCloseProbability(
  stage: DealStage,
  intent: IntentLevel,
  lossRisk: LossRiskLevel,
): number {
  const stageBase: Record<DealStage, number> = {
    descoberta: 30,
    proposta: 55,
    objecao: 45,
    fechamento: 82,
    pos_venda: 95,
  };
  const intentAdj: Record<IntentLevel, number> = {
    fria: -15,
    morna: 0,
    quente: 15,
  };
  const riskAdj: Record<LossRiskLevel, number> = {
    baixo: 0,
    medio: -8,
    alto: -20,
  };

  return clamp(stageBase[stage] + intentAdj[intent] + riskAdj[lossRisk], 5, 99);
}

function buildNextBestAction(stage: DealStage, lossRisk: LossRiskLevel, intent: IntentLevel): string {
  if (lossRisk === 'alto') {
    return 'Priorize follow-up imediato com CTA claro e prazo de retorno de no maximo 30 minutos.';
  }

  switch (stage) {
    case 'descoberta':
      return 'Faca qualificacao objetiva com 2 a 3 perguntas para mapear necessidade, prazo e orcamento.';
    case 'proposta':
      return 'Recapitule valor entregue, detalhe beneficios do plano indicado e proponha proximo passo com data.';
    case 'objecao':
      return 'Trate a principal objecao com prova social, comparativo de custo-beneficio e CTA de teste/piloto.';
    case 'fechamento':
      return intent === 'quente'
        ? 'Conduza para fechamento agora com opcao de pagamento e confirmacao final.'
        : 'Reforce urgencia com condicao valida por prazo curto e confirme decisor presente.';
    case 'pos_venda':
      return 'Solicite feedback rapido, valide sucesso inicial e ofereca cross-sell relevante.';
    default:
      return 'Mantenha a conversa ativa e conduza para proximo passo claro.';
  }
}

function buildSuggestedReply(stage: DealStage, intent: IntentLevel, lossRisk: LossRiskLevel): string {
  if (lossRisk === 'alto') {
    return 'Oi! Vi sua mensagem e quero te ajudar a decidir agora. Posso te enviar a melhor condicao e concluir em 2 minutos?';
  }

  switch (stage) {
    case 'descoberta':
      return 'Perfeito! Para te indicar a melhor opcao, me diz rapidinho: qual seu objetivo principal, prazo e faixa de investimento?';
    case 'proposta':
      return 'Com base no que voce me contou, a opcao mais indicada e [PLANO]. Ela resolve [DOR] e entrega [BENEFICIO]. Quer que eu te envie as condicoes finais?';
    case 'objecao':
      return 'Entendo seu ponto e faz sentido comparar. O diferencial aqui e [VALOR]. Se eu ajustar [CONDICAO], conseguimos avancar hoje?';
    case 'fechamento':
      return intent === 'quente'
        ? 'Perfeito, vamos fechar agora. Te envio o link/pix e ja deixo tudo confirmado em seguida.'
        : 'Se fizer sentido para voce, eu consigo segurar essa condicao ate hoje e ja deixamos tudo encaminhado.';
    case 'pos_venda':
      return 'Quero garantir que tudo ficou como esperado. Em uma nota de 0 a 10, como foi sua experiencia ate aqui?';
    default:
      return 'Posso te ajudar com o proximo passo agora?';
  }
}

function analyzeConversation(messages: MessageRow[], candidate: CandidateConversation): DealSignalAnalysis | null {
  const lines = messages
    .map((message) => (message.content ?? '').trim())
    .filter((content) => content.length > 0);

  if (lines.length === 0) return null;

  const transcriptLower = lines.join('\n').toLowerCase();
  const stage = detectStage(transcriptLower);
  const intent_level = detectIntent(transcriptLower);

  const customerMessages = messages.filter((message) => message.sender_type === 'customer');
  const agentMessages = messages.filter((message) => message.sender_type === 'agent');
  const lastCustomerMessageAt = customerMessages.length
    ? new Date(customerMessages[customerMessages.length - 1].created_at)
    : null;
  const lastAgentMessageAt = agentMessages.length
    ? new Date(agentMessages[agentMessages.length - 1].created_at)
    : null;

  const loss_risk_level = detectLossRisk(
    candidate.status,
    lastCustomerMessageAt,
    lastAgentMessageAt,
    stage,
    intent_level,
  );

  const close_probability = computeCloseProbability(stage, intent_level, loss_risk_level);
  const next_best_action = buildNextBestAction(stage, loss_risk_level, intent_level);
  const suggested_reply = buildSuggestedReply(stage, intent_level, loss_risk_level);

  return {
    stage,
    intent_level,
    loss_risk_level,
    estimated_value: detectEstimatedValue(messages),
    close_probability,
    next_best_action,
    suggested_reply,
  };
}

export async function processRevenueCopilotJobs(): Promise<void> {
  const job = await dequeueRevenueCopilotJob();
  if (!job) {
    console.log('[RevenueCopilot] No queued jobs.');
    return;
  }

  await runRevenueCopilotJob(job);
}

async function dequeueRevenueCopilotJob(): Promise<RevenueCopilotJobRow | null> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('dequeue_revenue_copilot_job');

  if (error) {
    throw new Error(`[RevenueCopilot] Failed to dequeue job: ${error.message}`);
  }

  return coerceRpcSingleRow<RevenueCopilotJobRow>(data);
}

async function runRevenueCopilotJob(job: RevenueCopilotJobRow): Promise<void> {
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
      console.log(`[RevenueCopilot] Job ${job.id} completed with zero candidates.`);
      return;
    }

    console.log(
      `[RevenueCopilot] Running job ${job.id}: scope=${job.scope}, candidates=${candidates.length}`,
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
          `[RevenueCopilot] Job ${job.id} failed conversation ${candidate.conversation_id}:`,
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
      `[RevenueCopilot] Job ${job.id} completed: analyzed=${counters.analyzed_count}, skipped=${counters.skipped_count}, failed=${counters.failed_count}`,
    );
  } catch (error) {
    const message = trimErrorMessage(error);
    console.error(`[RevenueCopilot] Job ${job.id} failed: ${message}`);
    await failJob(job.id, counters, message);
  }
}

async function fetchJobCandidates(job: RevenueCopilotJobRow): Promise<CandidateConversation[]> {
  const { data, error } = await supabase
    .schema('app')
    .rpc('get_revenue_copilot_candidates', {
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
  const { data: messagesRaw, error: messagesError } = await supabase
    .schema('app')
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('company_id', candidate.company_id)
    .eq('conversation_id', candidate.conversation_id)
    .order('created_at', { ascending: true })
    .limit(250);

  if (messagesError) {
    throw new Error(`Failed to load app messages for ${candidate.conversation_id}: ${messagesError.message}`);
  }

  const messages = (messagesRaw ?? []) as MessageRow[];
  const analysis = analyzeConversation(messages, candidate);
  if (!analysis) return 'skipped';

  await saveDealSignal(candidate, analysis);
  return 'analyzed';
}

async function saveDealSignal(
  candidate: CandidateConversation,
  analysis: DealSignalAnalysis,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload = {
    company_id: candidate.company_id,
    conversation_id: candidate.conversation_id,
    agent_id: candidate.agent_id,
    stage: analysis.stage,
    intent_level: analysis.intent_level,
    loss_risk_level: analysis.loss_risk_level,
    estimated_value: analysis.estimated_value,
    close_probability: analysis.close_probability,
    next_best_action: analysis.next_best_action,
    suggested_reply: analysis.suggested_reply,
    model_used: MODEL,
    prompt_version: PROMPT_VERSION,
    generated_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .schema('app')
    .from('deal_signals')
    .upsert(payload, { onConflict: 'conversation_id' });

  if (error) {
    throw new Error(`Failed to upsert deal signal for ${candidate.conversation_id}: ${error.message}`);
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
  updates: Partial<RevenueCopilotJobRow>,
): Promise<void> {
  const { error } = await supabase
    .schema('app')
    .from('revenue_copilot_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to update revenue copilot job ${jobId}: ${error.message}`);
  }
}
