import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Brain,
  BookOpen,
  TrendingUp,
  MessageSquare,
  Loader2,
  PlayCircle,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Agent, AIAnalysisJob, AIConversationAnalysis } from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { MetricCard } from '../components/dashboard/MetricCard';
import { Button } from '../components/ui/button';
import { channelLabel, cn, formatDateTime } from '../lib/utils';
import { toast } from 'sonner';

interface PreviewCandidate {
  conversation_id: string;
  started_at: string;
  status: 'active' | 'waiting' | 'closed' | 'snoozed';
  customer_name: string | null;
  customer_phone: string | null;
}

interface PreviewResponse {
  success: boolean;
  candidates: PreviewCandidate[];
  count: number;
  error?: string;
}

interface StartResponse {
  success: boolean;
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_candidates: number;
  error?: string;
}

interface FunctionPayload {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

type AnalysisScope = 'single' | 'all';
type ModalStep = 'form' | 'processing' | 'result';

interface ManualAnalysisForm {
  agentId: string;
  scope: AnalysisScope;
  periodStart: string;
  periodEnd: string;
  conversationId: string;
}

const DEFAULT_FORM: ManualAnalysisForm = {
  agentId: '',
  scope: 'all',
  periodStart: '',
  periodEnd: '',
  conversationId: '',
};

function validatePeriod(periodStart: string, periodEnd: string): string | null {
  if (!periodStart || !periodEnd) return 'Periodo inicial e final sao obrigatorios.';
  if (periodEnd < periodStart) return 'Data final nao pode ser menor que data inicial.';

  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Periodo invalido.';

  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days > 365) return 'Periodo maximo permitido e de 365 dias.';

  return null;
}

function mapHttpError(status: number, backendMessage: string): string {
  if (status === 401) return 'Sessao expirada. Faca login novamente.';
  if (status === 403) return 'Voce nao tem permissao para executar analise manual.';
  if (status === 400) return backendMessage || 'Parametros invalidos para analise manual.';
  return backendMessage || `Falha HTTP ${status} ao executar analise manual.`;
}

async function invokeRunAiAnalysis<T>(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/run-ai-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let parsed: FunctionPayload | null = null;

  try {
    parsed = rawText ? (JSON.parse(rawText) as FunctionPayload) : null;
  } catch {
    parsed = null;
  }

  const backendMessage = (parsed && typeof parsed.error === 'string' ? parsed.error : rawText).trim();

  if (!response.ok) throw new Error(mapHttpError(response.status, backendMessage));
  if (!parsed || parsed.success !== true) {
    throw new Error(backendMessage || 'Resposta invalida da funcao run-ai-analysis.');
  }

  return parsed as T;
}

function candidateLabel(candidate: PreviewCandidate): string {
  const name = candidate.customer_name?.trim() || 'Sem nome';
  const phone = candidate.customer_phone ? ` (${candidate.customer_phone})` : '';
  return `${name}${phone} - ${formatDateTime(candidate.started_at)} - ${candidate.status}`;
}

export default function AIInsights() {
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const canRunManualAnalysis = role === 'owner_admin' || role === 'manager' || role === 'qa_reviewer';

  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('form');
  const [form, setForm] = useState<ManualAnalysisForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [submittedTotalCandidates, setSubmittedTotalCandidates] = useState<number>(0);
  const finishedJobRef = useRef<string | null>(null);

  const { data: analyses, isLoading } = useQuery<AIConversationAnalysis[]>({
    queryKey: ['ai-insights-all', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select(
          '*, agent:agents(id, name), conversation:conversations(channel, started_at, customer:customers(name, phone))',
        )
        .eq('company_id', companyId)
        .order('analyzed_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as AIConversationAnalysis[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ['agents-for-manual-ai', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, company_id, member_id, external_id, name, email, phone, avatar_url, is_active, created_at')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: !!companyId && showModal,
  });

  const effectiveAgentId = form.agentId || agents?.[0]?.id || '';

  const periodError = useMemo(() => {
    if (!form.periodStart || !form.periodEnd) return null;
    return validatePeriod(form.periodStart, form.periodEnd);
  }, [form.periodStart, form.periodEnd]);

  const previewQuery = useQuery<PreviewResponse, Error>({
    queryKey: [
      'ai-analysis-preview',
      companyId,
      effectiveAgentId,
      form.scope,
      form.periodStart,
      form.periodEnd,
    ],
    enabled:
      showModal &&
      modalStep === 'form' &&
      form.scope === 'single' &&
      !!companyId &&
      !!effectiveAgentId &&
      !!form.periodStart &&
      !!form.periodEnd &&
      !periodError,
    queryFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Nao foi possivel validar a sessao. Faca login novamente.');

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessao expirada. Entre novamente na plataforma.');

      return invokeRunAiAnalysis<PreviewResponse>(accessToken, {
        action: 'preview',
        company_id: companyId,
        agent_id: effectiveAgentId,
        period_start: form.periodStart,
        period_end: form.periodEnd,
        limit: 200,
      });
    },
    staleTime: 0,
  });

  const previewCandidates = useMemo(
    () => previewQuery.data?.candidates ?? [],
    [previewQuery.data],
  );

  const effectiveConversationId =
    form.scope === 'single' &&
    form.conversationId &&
    previewCandidates.some((candidate) => candidate.conversation_id === form.conversationId)
      ? form.conversationId
      : '';

  const filteredCandidates = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return previewCandidates;

    return previewCandidates.filter((candidate) => {
      const normalized = `${candidate.customer_name ?? ''} ${candidate.customer_phone ?? ''} ${candidate.conversation_id}`.toLowerCase();
      return normalized.includes(query);
    });
  }, [previewCandidates, conversationSearch]);

  const startManualAnalysisMutation = useMutation<StartResponse, Error>({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      if (!effectiveAgentId) throw new Error('Selecione um atendente.');

      const periodValidation = validatePeriod(form.periodStart, form.periodEnd);
      if (periodValidation) throw new Error(periodValidation);

      if (form.scope === 'single') {
        if (!effectiveConversationId) throw new Error('Selecione uma conversa para analisar.');
        if (previewCandidates.length === 0) {
          throw new Error('Nao ha conversas elegiveis para os filtros informados.');
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Nao foi possivel validar a sessao. Faca login novamente.');

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessao expirada. Entre novamente na plataforma.');

      return invokeRunAiAnalysis<StartResponse>(accessToken, {
        action: 'start',
        company_id: companyId,
        agent_id: effectiveAgentId,
        scope: form.scope,
        conversation_id: form.scope === 'single' ? effectiveConversationId : null,
        period_start: form.periodStart,
        period_end: form.periodEnd,
      });
    },
    onSuccess: (result) => {
      setJobId(result.job_id);
      setSubmittedTotalCandidates(result.total_candidates ?? 0);
      finishedJobRef.current = null;
      setModalStep('processing');
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error.message || 'Erro ao iniciar analise manual.');
    },
  });

  const jobQuery = useQuery<AIAnalysisJob, Error>({
    queryKey: ['ai-analysis-job', companyId, jobId],
    enabled:
      !!companyId && !!jobId && showModal && (modalStep === 'processing' || modalStep === 'result'),
    queryFn: async () => {
      if (!companyId || !jobId) throw new Error('Job invalido.');

      const { data, error } = await supabase
        .from('ai_analysis_jobs')
        .select(
          'id, company_id, requested_by_user_id, agent_id, scope, conversation_id, period_start, period_end, company_timezone, status, total_candidates, processed_count, analyzed_count, skipped_count, failed_count, error_message, created_at, started_at, finished_at, updated_at',
        )
        .eq('company_id', companyId)
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return data as AIAnalysisJob;
    },
    refetchInterval: (query) => {
      const status = (query.state.data as AIAnalysisJob | undefined)?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000;
    },
  });

  const activeJob = jobQuery.data;
  const resolvedModalStep: ModalStep =
    modalStep === 'processing' &&
    activeJob &&
    (activeJob.status === 'completed' || activeJob.status === 'failed')
      ? 'result'
      : modalStep;

  useEffect(() => {
    const job = jobQuery.data;
    if (!job || !jobId) return;
    if (job.status !== 'completed' && job.status !== 'failed') return;
    if (finishedJobRef.current === job.id) return;
    finishedJobRef.current = job.id;

    if (job.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['ai-insights-all', companyId] });
      toast.success(
        `Analise concluida: ${job.analyzed_count} analisada(s), ${job.skipped_count} pulada(s), ${job.failed_count} com erro.`,
      );
      return;
    }

    toast.error(job.error_message || 'Erro no processamento do job de analise.');
  }, [jobQuery.data, jobId, queryClient, companyId]);

  const scored = analyses?.filter((analysis) => analysis.quality_score != null) ?? [];
  const needsCoaching = analyses?.filter((analysis) => analysis.needs_coaching) ?? [];

  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, analysis) => sum + (analysis.quality_score ?? 0), 0) / scored.length)
      : null;

  const lowestScore =
    scored.length > 0 ? Math.min(...scored.map((analysis) => analysis.quality_score ?? 100)) : null;

  const agentMap = new Map<string, { name: string; scores: number[]; coaching: number }>();
  for (const analysis of analyses ?? []) {
    if (!analysis.agent_id || !analysis.agent) continue;

    const agentName = (analysis.agent as { name?: string }).name ?? '--';
    if (!agentMap.has(analysis.agent_id)) {
      agentMap.set(analysis.agent_id, { name: agentName, scores: [], coaching: 0 });
    }

    const entry = agentMap.get(analysis.agent_id);
    if (!entry) continue;

    if (analysis.quality_score != null) entry.scores.push(analysis.quality_score);
    if (analysis.needs_coaching) entry.coaching += 1;
  }

  const agentRanking = Array.from(agentMap.entries())
    .map(([agentId, data]) => ({
      agentId,
      name: data.name,
      avgScore:
        data.scores.length > 0
          ? Math.round(data.scores.reduce((sum, value) => sum + value, 0) / data.scores.length)
          : null,
      analyzed: data.scores.length,
      coaching: data.coaching,
    }))
    .filter((agent) => agent.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

  const tagCount = new Map<string, number>();
  for (const analysis of analyses ?? []) {
    for (const tag of analysis.training_tags ?? []) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const selectedAgentName = useMemo(() => {
    if (!agents || !effectiveAgentId) return null;
    return agents.find((agent) => agent.id === effectiveAgentId)?.name ?? null;
  }, [agents, effectiveAgentId]);

  const activeTotalCandidates = activeJob?.total_candidates ?? submittedTotalCandidates;
  const activeProcessed = activeJob?.processed_count ?? 0;
  const progressPercent =
    activeTotalCandidates > 0 ? Math.min(100, Math.round((activeProcessed / activeTotalCandidates) * 100)) : 0;

  const closeModal = () => {
    setShowModal(false);
    setModalStep('form');
    setForm(DEFAULT_FORM);
    setFormError(null);
    setConversationSearch('');
    setJobId(null);
    setSubmittedTotalCandidates(0);
    finishedJobRef.current = null;
  };

  const openModal = () => {
    if (!canRunManualAnalysis) return;
    setShowModal(true);
    setModalStep('form');
    setFormError(null);
    setConversationSearch('');
    setJobId(null);
    setSubmittedTotalCandidates(0);
    finishedJobRef.current = null;
  };

  const submitManualAnalysis = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!effectiveAgentId) {
      setFormError('Selecione um atendente.');
      return;
    }

    const validationError = validatePeriod(form.periodStart, form.periodEnd);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (form.scope === 'single') {
      if (previewQuery.isFetching) {
        setFormError('Aguarde o carregamento das conversas.');
        return;
      }

      if (previewCandidates.length === 0) {
        setFormError('Nao ha conversas no periodo selecionado para este atendente.');
        return;
      }

      if (!effectiveConversationId) {
        setFormError('Selecione a conversa que sera analisada.');
        return;
      }
    }

    startManualAnalysisMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Analise IA</h2>
          <p className="mt-1 text-muted-foreground">
            Qualidade de atendimento avaliada com analise manual por filtros.
          </p>
        </div>

        {canRunManualAnalysis && (
          <Button
            variant="outline"
            className="shrink-0"
            onClick={openModal}
            disabled={!companyId}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Analisar manualmente
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Score Medio IA"
          value={avgScore != null ? String(avgScore) : '--'}
          subtitle="Ultimas analises"
          icon={<Brain className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Conversas Analisadas"
          value={String(analyses?.length ?? 0)}
          icon={<MessageSquare className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Precisam Coaching"
          value={String(needsCoaching.length)}
          icon={<BookOpen className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Score Mais Baixo"
          value={lowestScore != null ? String(lowestScore) : '--'}
          icon={<TrendingUp className="h-5 w-5 text-red-500" />}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !analyses || analyses.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">Nenhuma analise IA disponivel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique em <strong>Analisar manualmente</strong> para processar conversas.
          </p>
        </div>
      ) : (
        <>
          {agentRanking.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Ranking por Qualidade IA</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3">#</th>
                      <th className="px-6 py-3">Atendente</th>
                      <th className="px-6 py-3 text-right">Score Medio</th>
                      <th className="px-6 py-3 text-right">Analisadas</th>
                      <th className="px-6 py-3 text-right">Coaching</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {agentRanking.map((agent, index) => (
                      <tr key={agent.agentId} className="hover:bg-muted">
                        <td className="px-6 py-3 text-sm text-muted-foreground">{index + 1}</td>
                        <td className="px-6 py-3">
                          <Link
                            to={`/agents/${agent.agentId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {agent.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span
                            className={cn(
                              'font-semibold',
                              (agent.avgScore ?? 0) >= 80
                                ? 'text-primary'
                                : (agent.avgScore ?? 0) >= 60
                                  ? 'text-primary'
                                  : 'text-red-600',
                            )}
                          >
                            {agent.avgScore ?? '--'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-muted-foreground">{agent.analyzed}</td>
                        <td className="px-6 py-3 text-right">
                          {agent.coaching > 0 ? (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
                              {agent.coaching}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {needsCoaching.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Conversas para Revisar</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {needsCoaching.length} conversa{needsCoaching.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border">
                {needsCoaching.slice(0, 15).map((analysis) => {
                  const conversation = analysis.conversation as {
                    channel?: string;
                    customer?: { name?: string; phone?: string };
                  };

                  const customerName =
                    conversation?.customer?.name ??
                    conversation?.customer?.phone ??
                    'Cliente';

                  return (
                    <Link
                      key={analysis.id}
                      to={`/conversations/${analysis.conversation_id}`}
                      className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{customerName}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          {conversation?.channel && (
                            <span className="text-xs text-muted-foreground">{channelLabel(conversation.channel)}</span>
                          )}
                          {analysis.training_tags?.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <span
                          className={cn(
                            'text-lg font-bold',
                            (analysis.quality_score ?? 100) >= 70
                              ? 'text-primary'
                              : 'text-red-600',
                          )}
                        >
                          {analysis.quality_score ?? '--'}
                        </span>
                        <p className="text-xs text-muted-foreground">{formatDateTime(analysis.analyzed_at)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {topTags.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold text-foreground">
                Tags de Treinamento Mais Frequentes
              </h3>
              <div className="space-y-2">
                {topTags.map(([tag, count]) => {
                  const maxCount = topTags[0][1];
                  const width = Math.round((count / maxCount) * 100);

                  return (
                    <div key={tag} className="flex items-center gap-3">
                      <span className="w-48 shrink-0 text-sm text-foreground">{tag}</span>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
                      </div>
                      <span className="w-6 text-right text-xs text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Analise IA Manual</h3>
                <p className="text-xs text-muted-foreground">
                  Selecione filtros para analisar conversas por atendente.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Fechar"
                className="rounded-lg p-1 transition-colors hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {modalStep === 'form' && (
              <form onSubmit={submitManualAnalysis} className="space-y-4 p-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Atendente <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={effectiveAgentId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        agentId: event.target.value,
                        conversationId: '',
                      }))
                    }
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                  >
                    <option value="">Selecione um atendente</option>
                    {(agents ?? []).map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Escopo <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          scope: 'all',
                          conversationId: '',
                        }))
                      }
                      className={cn(
                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        form.scope === 'all'
                          ? 'border-primary/35 bg-accent text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      Todas as conversas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          scope: 'single',
                          conversationId: '',
                        }))
                      }
                      className={cn(
                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        form.scope === 'single'
                          ? 'border-primary/35 bg-accent text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      Uma conversa
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Data inicial <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.periodStart}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          periodStart: event.target.value,
                          conversationId: '',
                        }))
                      }
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Data final <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.periodEnd}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          periodEnd: event.target.value,
                          conversationId: '',
                        }))
                      }
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                    />
                  </div>
                </div>

                {periodError && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{periodError}</p>
                )}

                {form.scope === 'single' && (
                  <div className="space-y-2 rounded-xl border border-border bg-muted p-4">
                    <label className="block text-sm font-medium text-foreground">
                      Conversa <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={conversationSearch}
                        onChange={(event) => setConversationSearch(event.target.value)}
                        placeholder="Buscar por nome, telefone ou ID"
                        className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                      />
                    </div>

                    <select
                      value={effectiveConversationId}
                      onChange={(event) => setForm((prev) => ({ ...prev, conversationId: event.target.value }))}
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                    >
                      <option value="">Selecione uma conversa</option>
                      {filteredCandidates.map((candidate) => (
                        <option key={candidate.conversation_id} value={candidate.conversation_id}>
                          {candidateLabel(candidate)}
                        </option>
                      ))}
                    </select>

                    {previewQuery.isFetching && (
                      <p className="text-xs text-muted-foreground">Carregando conversas elegiveis...</p>
                    )}

                    {previewQuery.isError && (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                        {previewQuery.error.message}
                      </p>
                    )}

                    {!previewQuery.isFetching &&
                      !previewQuery.isError &&
                      effectiveAgentId &&
                      form.periodStart &&
                      form.periodEnd &&
                      !periodError &&
                      previewCandidates.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma conversa encontrada para esse atendente no periodo informado.
                        </p>
                      )}
                  </div>
                )}

                {formError && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startManualAnalysisMutation.isPending}
                    className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {startManualAnalysisMutation.isPending ? 'Iniciando...' : 'Iniciar analise'}
                  </button>
                </div>
              </form>
            )}

            {resolvedModalStep === 'processing' && (
              <div className="space-y-4 p-6">
                <div className="flex items-center gap-3 rounded-xl bg-accent px-4 py-3 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">Job em andamento...</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-semibold text-foreground">{activeJob?.status ?? 'queued'}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Processadas</p>
                    <p className="font-semibold text-foreground">{activeProcessed}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Analisadas</p>
                    <p className="font-semibold text-foreground">{activeJob?.analyzed_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total alvo</p>
                    <p className="font-semibold text-foreground">{activeTotalCandidates}</p>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progresso</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary/90 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <p>
                    <strong>Atendente:</strong> {selectedAgentName ?? 'Nao identificado'}
                  </p>
                  <p>
                    <strong>Periodo:</strong> {form.periodStart || '--'} ate {form.periodEnd || '--'}
                  </p>
                  <p>
                    <strong>Escopo:</strong> {form.scope === 'single' ? 'Uma conversa' : 'Todas as conversas'}
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {resolvedModalStep === 'result' && (
              <div className="space-y-4 p-6">
                <div
                  className={cn(
                    'rounded-xl px-4 py-3 text-sm font-medium',
                    activeJob?.status === 'failed'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-accent text-primary',
                  )}
                >
                  {activeJob?.status === 'failed'
                    ? 'O job terminou com falha.'
                    : 'O job foi concluido com sucesso.'}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Processadas</p>
                    <p className="font-semibold text-foreground">{activeJob?.processed_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Analisadas</p>
                    <p className="font-semibold text-foreground">{activeJob?.analyzed_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Puladas</p>
                    <p className="font-semibold text-foreground">{activeJob?.skipped_count ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Falhas</p>
                    <p className="font-semibold text-foreground">{activeJob?.failed_count ?? 0}</p>
                  </div>
                </div>

                {activeJob?.error_message && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                    {activeJob.error_message}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setModalStep('form');
                      setJobId(null);
                      setSubmittedTotalCandidates(0);
                      finishedJobRef.current = null;
                      setFormError(null);
                    }}
                    className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Nova analise
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
