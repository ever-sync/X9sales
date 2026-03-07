import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Brain,
  FilterX,
  Loader2,
  MessageSquare,
  PlayCircle,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type {
  Agent,
  AIAnalysisJob,
  AIInsightsAgentSummary,
  AIInsightsFailureHeatmapCell,
  AIInsightsReviewItem,
  AIInsightsSummary,
  AIInsightsTagSummary,
} from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { MetricCard } from '../components/dashboard/MetricCard';
import { Button } from '../components/ui/button';
import { channelLabel, cn, formatDateTime, formatPercent } from '../lib/utils';
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

interface BulkStartResult {
  bulk: true;
  started: number;
  errors: number;
}

type AnyStartResult = StartResponse | BulkStartResult;
type AnalysisScope = 'single' | 'all';
type ModalStep = 'form' | 'processing' | 'result';
type CoachingFilter = 'all' | 'yes' | 'no';

interface FunctionPayload {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface ManualAnalysisForm {
  agentId: string;
  scope: AnalysisScope;
  periodStart: string;
  periodEnd: string;
  conversationId: string;
}

const ALL_AGENTS = '__all__';
const REVIEW_LIMIT = 80;

function toDateInput(value: Date): string {
  const tzOffset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - tzOffset).toISOString().slice(0, 10);
}

function getDefaultPeriod() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return {
    periodStart: toDateInput(start),
    periodEnd: toDateInput(end),
  };
}

function getDefaultForm(): ManualAnalysisForm {
  const period = getDefaultPeriod();
  return {
    agentId: ALL_AGENTS,
    scope: 'all',
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    conversationId: '',
  };
}

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

function formatTagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}

function tagChipClass(source: AIInsightsTagSummary['source']) {
  return source === 'failure'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-primary/20 bg-accent text-primary';
}

function buildRpcParams(filters: {
  companyId: string;
  agentId: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  tag: string;
  coaching: CoachingFilter;
}) {
  return {
    p_company_id: filters.companyId,
    p_agent_id: filters.agentId === ALL_AGENTS ? null : filters.agentId,
    p_period_start: filters.periodStart || null,
    p_period_end: filters.periodEnd || null,
    p_timezone: filters.timezone,
    p_tag: filters.tag || null,
    p_needs_coaching: filters.coaching === 'all' ? null : filters.coaching === 'yes',
  };
}

export default function AIInsights() {
  const { companyId, company, role } = useCompany();
  const queryClient = useQueryClient();
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const canRunManualAnalysis = role === 'owner_admin' || role === 'manager' || role === 'qa_reviewer';
  const timezone = company?.settings?.timezone || 'UTC';
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);

  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [selectedAgentId, setSelectedAgentId] = useState(ALL_AGENTS);
  const [selectedTag, setSelectedTag] = useState('');
  const [coachingFilter, setCoachingFilter] = useState<CoachingFilter>('all');

  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('form');
  const [form, setForm] = useState<ManualAnalysisForm>(getDefaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [submittedTotalCandidates, setSubmittedTotalCandidates] = useState<number>(0);
  const finishedJobRef = useRef<string | null>(null);

  const filterError = validatePeriod(periodStart, periodEnd);
  const filtersReady = !!companyId && !filterError;
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['ai-insights', 'agents', companyId],
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
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const rpcBaseParams = useMemo(() => {
    if (!companyId) return null;
    return buildRpcParams({
      companyId,
      agentId: selectedAgentId,
      periodStart,
      periodEnd,
      timezone,
      tag: selectedTag,
      coaching: coachingFilter,
    });
  }, [companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter]);

  const summaryQuery = useQuery<AIInsightsSummary>({
    queryKey: ['ai-insights', 'summary', companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter],
    queryFn: async () => {
      if (!rpcBaseParams) throw new Error('Empresa nao selecionada.');
      const { data, error } = await supabase.rpc('get_ai_insights_summary', rpcBaseParams);
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? {
        analyses_total: 0,
        avg_score: null,
        lowest_score: null,
        coaching_count: 0,
        coaching_rate: 0,
      }) as AIInsightsSummary;
    },
    enabled: filtersReady && !!rpcBaseParams,
    staleTime: CACHE.STALE_TIME,
  });

  const agentSummaryQuery = useQuery<AIInsightsAgentSummary[]>({
    queryKey: ['ai-insights', 'agent-summary', companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter],
    queryFn: async () => {
      if (!rpcBaseParams) return [];
      const { data, error } = await supabase.rpc('get_ai_insights_agent_summary', rpcBaseParams);
      if (error) throw error;
      return (data ?? []) as AIInsightsAgentSummary[];
    },
    enabled: filtersReady && !!rpcBaseParams,
    staleTime: CACHE.STALE_TIME,
  });

  const tagSummaryQuery = useQuery<AIInsightsTagSummary[]>({
    queryKey: ['ai-insights', 'tag-summary', companyId, selectedAgentId, periodStart, periodEnd, timezone, coachingFilter],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc('get_ai_insights_tag_summary', {
        p_company_id: companyId,
        p_agent_id: selectedAgentId === ALL_AGENTS ? null : selectedAgentId,
        p_period_start: periodStart || null,
        p_period_end: periodEnd || null,
        p_timezone: timezone,
        p_needs_coaching: coachingFilter === 'all' ? null : coachingFilter === 'yes',
      });
      if (error) throw error;
      return (data ?? []) as AIInsightsTagSummary[];
    },
    enabled: filtersReady && !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const reviewFeedQuery = useQuery<AIInsightsReviewItem[]>({
    queryKey: ['ai-insights', 'review-feed', companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter],
    queryFn: async () => {
      if (!rpcBaseParams) return [];
      const { data, error } = await supabase.rpc('get_ai_insights_review_feed', {
        ...rpcBaseParams,
        p_limit: REVIEW_LIMIT,
      });
      if (error) throw error;
      return (data ?? []) as AIInsightsReviewItem[];
    },
    enabled: filtersReady && !!rpcBaseParams,
    staleTime: CACHE.STALE_TIME,
  });

  const heatmapQuery = useQuery<AIInsightsFailureHeatmapCell[]>({
    queryKey: ['ai-insights', 'heatmap', companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter],
    queryFn: async () => {
      if (!rpcBaseParams) return [];
      const { data, error } = await supabase.rpc('get_ai_insights_failure_heatmap', rpcBaseParams);
      if (error) throw error;
      return (data ?? []) as AIInsightsFailureHeatmapCell[];
    },
    enabled: filtersReady && !!rpcBaseParams,
    staleTime: CACHE.STALE_TIME,
  });

  const effectiveAgentId = form.agentId || ALL_AGENTS;
  const modalPeriodError = useMemo(
    () => validatePeriod(form.periodStart, form.periodEnd),
    [form.periodStart, form.periodEnd],
  );

  const previewQuery = useQuery<PreviewResponse, Error>({
    queryKey: ['ai-insights', 'preview', companyId, effectiveAgentId, form.scope, form.periodStart, form.periodEnd],
    enabled:
      showModal &&
      modalStep === 'form' &&
      form.scope === 'single' &&
      effectiveAgentId !== ALL_AGENTS &&
      !!companyId &&
      !!effectiveAgentId &&
      !!form.periodStart &&
      !!form.periodEnd &&
      !modalPeriodError,
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

  const previewCandidates = useMemo(() => previewQuery.data?.candidates ?? [], [previewQuery.data]);

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

  const closeModal = () => {
    setShowModal(false);
    setModalStep('form');
    setForm(getDefaultForm());
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
    setForm({
      agentId: selectedAgentId,
      scope: 'all',
      periodStart,
      periodEnd,
      conversationId: '',
    });
  };
  const startManualAnalysisMutation = useMutation<AnyStartResult, Error>({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');

      const validationError = validatePeriod(form.periodStart, form.periodEnd);
      if (validationError) throw new Error(validationError);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Nao foi possivel validar a sessao. Faca login novamente.');

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessao expirada. Faca login novamente.');

      if (effectiveAgentId === ALL_AGENTS) {
        if (agents.length === 0) throw new Error('Nenhum atendente encontrado.');

        let started = 0;
        let errors = 0;
        for (const agent of agents) {
          try {
            await invokeRunAiAnalysis<StartResponse>(accessToken, {
              action: 'start',
              company_id: companyId,
              agent_id: agent.id,
              scope: 'all',
              conversation_id: null,
              period_start: form.periodStart,
              period_end: form.periodEnd,
            });
            started += 1;
          } catch {
            errors += 1;
          }
        }
        return { bulk: true, started, errors } satisfies BulkStartResult;
      }

      if (!effectiveAgentId) throw new Error('Selecione um atendente.');
      if (form.scope === 'single') {
        if (!effectiveConversationId) throw new Error('Selecione uma conversa para analisar.');
        if (previewCandidates.length === 0) throw new Error('Nao ha conversas elegiveis para os filtros informados.');
      }

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
      if ('bulk' in result) {
        if (result.errors > 0) toast.error(`${result.errors} atendente(s) com erro ao iniciar o job.`);
        toast.success(`${result.started} job(s) de analise iniciado(s).`);
        queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
        closeModal();
        return;
      }
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
    queryKey: ['ai-insights', 'job', companyId, jobId],
    enabled: !!companyId && !!jobId && showModal && (modalStep === 'processing' || modalStep === 'result'),
    queryFn: async () => {
      if (!companyId || !jobId) throw new Error('Job invalido.');
      const { data, error } = await supabase
        .from('ai_analysis_jobs')
        .select('id, company_id, requested_by_user_id, agent_id, scope, conversation_id, period_start, period_end, company_timezone, status, total_candidates, processed_count, analyzed_count, skipped_count, failed_count, error_message, created_at, started_at, finished_at, updated_at')
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
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      toast.success(
        `Analise concluida: ${job.analyzed_count} analisada(s), ${job.skipped_count} pulada(s), ${job.failed_count} com erro.`,
      );
      return;
    }

    toast.error(job.error_message || 'Erro no processamento do job de analise.');
  }, [jobQuery.data, jobId, queryClient]);

  const selectedAgentName = useMemo(() => {
    if (selectedAgentId === ALL_AGENTS) return 'Todos os atendentes';
    return agents.find((agent) => agent.id === selectedAgentId)?.name ?? 'Atendente';
  }, [agents, selectedAgentId]);

  const selectedTagMeta = useMemo(() => {
    if (!selectedTag) return null;
    return tagSummaryQuery.data?.find((item) => item.tag === selectedTag) ?? null;
  }, [selectedTag, tagSummaryQuery.data]);

  const topTags = useMemo(() => (tagSummaryQuery.data ?? []).slice(0, 10), [tagSummaryQuery.data]);

  const heatmapRows = useMemo(() => {
    const rows = new Map<string, { agentId: string | null; agentName: string; total: number; tags: Map<string, number> }>();
    for (const cell of heatmapQuery.data ?? []) {
      const key = cell.agent_id ?? 'none';
      if (!rows.has(key)) {
        rows.set(key, {
          agentId: cell.agent_id,
          agentName: cell.agent_name,
          total: 0,
          tags: new Map(),
        });
      }
      const row = rows.get(key);
      if (!row) continue;
      row.tags.set(cell.failure_tag, cell.failure_count);
      row.total += cell.failure_count;
    }
    return Array.from(rows.values()).sort((a, b) => b.total - a.total);
  }, [heatmapQuery.data]);

  const topFailureTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of heatmapQuery.data ?? []) {
      counts.set(cell.failure_tag, (counts.get(cell.failure_tag) ?? 0) + cell.failure_count);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [heatmapQuery.data]);

  const failureTagMaxes = useMemo(() => {
    const maxes = new Map<string, number>();
    for (const tag of topFailureTags) {
      let max = 0;
      for (const row of heatmapRows) {
        max = Math.max(max, row.tags.get(tag) ?? 0);
      }
      maxes.set(tag, max);
    }
    return maxes;
  }, [topFailureTags, heatmapRows]);

  const combinedError = summaryQuery.error || agentSummaryQuery.error || tagSummaryQuery.error || reviewFeedQuery.error || heatmapQuery.error;
  const isLoading = summaryQuery.isLoading || agentSummaryQuery.isLoading || tagSummaryQuery.isLoading || reviewFeedQuery.isLoading || heatmapQuery.isLoading;
  const summary = summaryQuery.data;
  const reviewItems = reviewFeedQuery.data ?? [];
  const activeTotalCandidates = activeJob?.total_candidates ?? submittedTotalCandidates;
  const activeProcessed = activeJob?.processed_count ?? 0;
  const progressPercent = activeTotalCandidates > 0 ? Math.min(100, Math.round((activeProcessed / activeTotalCandidates) * 100)) : 0;

  const resetFilters = () => {
    const defaults = getDefaultPeriod();
    setPeriodStart(defaults.periodStart);
    setPeriodEnd(defaults.periodEnd);
    setSelectedAgentId(ALL_AGENTS);
    setSelectedTag('');
    setCoachingFilter('all');
  };

  const drillToReviews = (agentId?: string | null, tag?: string, coaching: CoachingFilter = 'yes') => {
    if (agentId) setSelectedAgentId(agentId);
    if (typeof tag === 'string') setSelectedTag(tag);
    setCoachingFilter(coaching);
    setTimeout(() => reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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

    if (effectiveAgentId !== ALL_AGENTS && form.scope === 'single') {
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

  if (!companyId) {
    return <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">Empresa nao selecionada.</div>;
  }
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Brain className="h-3.5 w-3.5" />
              AI Insights
            </div>
            <h2 className="mt-4 text-2xl font-bold text-foreground md:text-3xl">Qualidade de atendimento com filtros reais</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Leia a operacao por periodo, atendente, tag e necessidade de coaching. Os agregados abaixo nao dependem mais da lista limitada da tela.
            </p>
          </div>

          {canRunManualAnalysis && (
            <Button variant="outline" className="shrink-0" onClick={openModal}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Atualizar analise manual
            </Button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendente</label>
            <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
              <option value={ALL_AGENTS}>Todos os atendentes</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data final</label>
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag</label>
            <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
              <option value="">Todas as tags</option>
              {(tagSummaryQuery.data ?? []).map((tag) => (
                <option key={`${tag.source}:${tag.tag}`} value={tag.tag}>
                  {tag.source === 'failure' ? '[Falha] ' : '[Treino] '}{formatTagLabel(tag.tag)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Precisa coaching</label>
            <div className="flex gap-2">
              <select value={coachingFilter} onChange={(event) => setCoachingFilter(event.target.value as CoachingFilter)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                <option value="all">Todos</option>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
              <button type="button" onClick={resetFilters} className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted" title="Limpar filtros">
                <FilterX className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filterError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{filterError}</div>}

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">{selectedAgentName}</span>
          <span className="rounded-full bg-muted px-3 py-1">{periodStart} ate {periodEnd}</span>
          <span className="rounded-full bg-muted px-3 py-1">Coaching: {coachingFilter === 'all' ? 'todos' : coachingFilter === 'yes' ? 'sim' : 'nao'}</span>
          {selectedTagMeta && (
            <button type="button" onClick={() => setSelectedTag('')} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1', tagChipClass(selectedTagMeta.source))}>
              {formatTagLabel(selectedTagMeta.tag)}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {combinedError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Falha ao carregar AI Insights: {combinedError.message}</div>}

      {isLoading ? (
        <div className="space-y-4">{[...Array(4)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : (summary?.analyses_total ?? 0) === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">Nenhuma analise encontrada para os filtros atuais.</p>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste o periodo ou execute uma nova analise manual.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Score medio IA" value={summary?.avg_score != null ? String(Math.round(summary.avg_score)) : '--'} subtitle="Media do recorte filtrado" icon={<Brain className="h-5 w-5 text-primary" />} />
            <MetricCard title="Conversas analisadas" value={String(summary?.analyses_total ?? 0)} subtitle="Base total do filtro" icon={<MessageSquare className="h-5 w-5 text-primary" />} />
            <MetricCard title="Precisam coaching" value={String(summary?.coaching_count ?? 0)} subtitle={formatPercent(summary?.coaching_rate ?? 0)} icon={<BookOpen className="h-5 w-5 text-primary" />} />
            <MetricCard title="Score mais baixo" value={summary?.lowest_score != null ? String(summary.lowest_score) : '--'} subtitle="Pior conversa do recorte" icon={<TrendingDown className="h-5 w-5 text-red-500" />} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div ref={reviewSectionRef} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Conversas para revisar</h3>
                  <p className="text-sm text-muted-foreground">Lista priorizada por necessidade de coaching, score mais baixo e recencia.</p>
                </div>
                <span className="text-xs text-muted-foreground">{reviewItems.length} item(ns) carregados</span>
              </div>

              <div className="divide-y divide-border">
                {reviewItems.map((item) => {
                  const customerLabel = item.customer_name || item.customer_phone || 'Cliente';
                  const mergedTags = [
                    ...item.training_tags.map((tag) => ({ tag, source: 'training' as const })),
                    ...item.failure_tags.map((tag) => ({ tag, source: 'failure' as const })),
                  ].slice(0, 4);

                  return (
                    <div key={item.id} className="px-6 py-4 transition-colors hover:bg-muted/40">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/conversations/${item.conversation_id}`} className="text-sm font-semibold text-primary hover:underline">{customerLabel}</Link>
                            {item.channel && <span className="text-xs text-muted-foreground">{channelLabel(item.channel)}</span>}
                            {item.needs_coaching && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Coaching</span>}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <button type="button" onClick={() => drillToReviews(item.agent_id, selectedTag || undefined, coachingFilter)} className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-primary">{item.agent_name}</button>
                            <span>Analisada em {formatDateTime(item.analyzed_at)}</span>
                            {item.conversation_started_at && <span>Conversa em {formatDateTime(item.conversation_started_at)}</span>}
                          </div>

                          {mergedTags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {mergedTags.map(({ tag, source }) => (
                                <button key={`${source}:${tag}:${item.id}`} type="button" onClick={() => drillToReviews(item.agent_id, tag, 'yes')} className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-85', tagChipClass(source))}>
                                  {formatTagLabel(tag)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p className={cn('text-2xl font-bold', (item.quality_score ?? 100) >= 70 ? 'text-primary' : 'text-red-600')}>{item.quality_score ?? '--'}</p>
                          <p className="text-xs text-muted-foreground">score</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Ranking por qualidade</h3>
                </div>
                <div className="divide-y divide-border">
                  {(agentSummaryQuery.data ?? []).map((agent) => (
                    <div key={agent.agent_id ?? agent.agent_name} className="flex items-center justify-between gap-4 px-6 py-4">
                      <div>
                        <button type="button" onClick={() => setSelectedAgentId(agent.agent_id ?? ALL_AGENTS)} className="text-left text-sm font-semibold text-primary hover:underline">{agent.agent_name}</button>
                        <p className="text-xs text-muted-foreground">{agent.analyzed_count} analisadas • {agent.coaching_count} com coaching</p>
                      </div>
                      <div className="text-right">
                        <p className={cn('text-lg font-bold', (agent.avg_score ?? 0) >= 70 ? 'text-primary' : 'text-red-600')}>{agent.avg_score != null ? Math.round(agent.avg_score) : '--'}</p>
                        <button type="button" onClick={() => drillToReviews(agent.agent_id, selectedTag || undefined, 'yes')} className="text-xs text-muted-foreground hover:text-primary">Ver conversas</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Tags em destaque</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topTags.map((tag) => (
                    <button key={`${tag.source}:${tag.tag}`} type="button" onClick={() => setSelectedTag(tag.tag)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-85', tagChipClass(tag.source), selectedTag === tag.tag && 'ring-2 ring-ring/30')}>
                      {formatTagLabel(tag.tag)} • {tag.count}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Falhas recorrentes por atendente</h3>
                <p className="text-sm text-muted-foreground">Clique em uma celula para aplicar drill-down por atendente + tag e cair direto nas conversas afetadas.</p>
              </div>
              {selectedTag && <button type="button" onClick={() => setSelectedTag('')} className="text-xs font-medium text-primary hover:underline">Limpar tag ativa</button>}
            </div>

            {topFailureTags.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nenhuma falha recorrente encontrada para os filtros atuais.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">Atendente</th>
                      {topFailureTags.map((tag) => (
                        <th key={tag} className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">
                          <button type="button" onClick={() => setSelectedTag(tag)} className="hover:text-primary">{formatTagLabel(tag)}</button>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {heatmapRows.map((row) => (
                      <tr key={`${row.agentId ?? 'none'}-${row.agentName}`} className="hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => setSelectedAgentId(row.agentId ?? ALL_AGENTS)} className="font-medium text-primary hover:underline">{row.agentName}</button>
                        </td>
                        {topFailureTags.map((tag) => {
                          const count = row.tags.get(tag) ?? 0;
                          const maxForTag = failureTagMaxes.get(tag) ?? 1;
                          const opacity = count > 0 ? Math.max(0.18, count / maxForTag) : 0;
                          return (
                            <td key={tag} className="px-2 py-2 text-center">
                              {count > 0 ? (
                                <button type="button" onClick={() => drillToReviews(row.agentId, tag, 'yes')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-105" style={{ backgroundColor: `rgba(239, 68, 68, ${opacity})`, color: opacity > 0.5 ? 'white' : 'rgb(185, 28, 28)' }}>
                                  {count}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-semibold text-foreground">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Atualizar analise IA</h3>
                <p className="text-xs text-muted-foreground">Execute uma nova rodada para o periodo e o atendente selecionados.</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Fechar" className="rounded-lg p-1 transition-colors hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {modalStep === 'form' && (
              <form onSubmit={submitManualAnalysis} className="space-y-4 p-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Atendente <span className="text-red-500">*</span></label>
                  <select value={effectiveAgentId} onChange={(event) => {
                    const value = event.target.value;
                    setForm((prev) => ({ ...prev, agentId: value, conversationId: '', scope: value === ALL_AGENTS ? 'all' : prev.scope }));
                  }} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35">
                    <option value={ALL_AGENTS}>Todos os atendentes</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </div>

                {effectiveAgentId !== ALL_AGENTS && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Escopo <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setForm((prev) => ({ ...prev, scope: 'all', conversationId: '' }))} className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition-colors', form.scope === 'all' ? 'border-primary/35 bg-accent text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>Todas as conversas</button>
                      <button type="button" onClick={() => setForm((prev) => ({ ...prev, scope: 'single', conversationId: '' }))} className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition-colors', form.scope === 'single' ? 'border-primary/35 bg-accent text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>Uma conversa</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Data inicial <span className="text-red-500">*</span></label>
                    <input type="date" value={form.periodStart} onChange={(event) => setForm((prev) => ({ ...prev, periodStart: event.target.value, conversationId: '' }))} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Data final <span className="text-red-500">*</span></label>
                    <input type="date" value={form.periodEnd} onChange={(event) => setForm((prev) => ({ ...prev, periodEnd: event.target.value, conversationId: '' }))} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" />
                  </div>
                </div>

                {modalPeriodError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{modalPeriodError}</p>}

                {form.scope === 'single' && (
                  <div className="space-y-2 rounded-xl border border-border bg-muted p-4">
                    <label className="block text-sm font-medium text-foreground">Conversa <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input type="text" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar por nome, telefone ou ID" className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" />
                    </div>

                    <select value={effectiveConversationId} onChange={(event) => setForm((prev) => ({ ...prev, conversationId: event.target.value }))} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35">
                      <option value="">Selecione uma conversa</option>
                      {filteredCandidates.map((candidate) => <option key={candidate.conversation_id} value={candidate.conversation_id}>{candidateLabel(candidate)}</option>)}
                    </select>

                    {previewQuery.isFetching && <p className="text-xs text-muted-foreground">Carregando conversas elegiveis...</p>}
                    {previewQuery.isError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{previewQuery.error.message}</p>}
                    {!previewQuery.isFetching && !previewQuery.isError && effectiveAgentId && form.periodStart && form.periodEnd && !modalPeriodError && previewCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada para esse atendente no periodo informado.</p>
                    )}
                  </div>
                )}

                {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button>
                  <button type="submit" disabled={startManualAnalysisMutation.isPending} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">{startManualAnalysisMutation.isPending ? 'Iniciando...' : 'Iniciar analise'}</button>
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
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold text-foreground">{activeJob?.status ?? 'queued'}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Processadas</p><p className="font-semibold text-foreground">{activeProcessed}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Analisadas</p><p className="font-semibold text-foreground">{activeJob?.analyzed_count ?? 0}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Total alvo</p><p className="font-semibold text-foreground">{activeTotalCandidates}</p></div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Progresso</span><span>{progressPercent}%</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary/90 transition-all" style={{ width: `${progressPercent}%` }} /></div>
                </div>

                <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <p><strong>Atendente:</strong> {effectiveAgentId === ALL_AGENTS ? 'Todos os atendentes' : agents.find((agent) => agent.id === effectiveAgentId)?.name ?? 'Nao identificado'}</p>
                  <p><strong>Periodo:</strong> {form.periodStart || '--'} ate {form.periodEnd || '--'}</p>
                  <p><strong>Escopo:</strong> {form.scope === 'single' ? 'Uma conversa' : 'Todas as conversas'}</p>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={closeModal} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Fechar</button>
                </div>
              </div>
            )}

            {resolvedModalStep === 'result' && (
              <div className="space-y-4 p-6">
                <div className={cn('rounded-xl px-4 py-3 text-sm font-medium', activeJob?.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-accent text-primary')}>
                  {activeJob?.status === 'failed' ? 'O job terminou com falha.' : 'O job foi concluido com sucesso.'}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Processadas</p><p className="font-semibold text-foreground">{activeJob?.processed_count ?? 0}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Analisadas</p><p className="font-semibold text-foreground">{activeJob?.analyzed_count ?? 0}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Puladas</p><p className="font-semibold text-foreground">{activeJob?.skipped_count ?? 0}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Falhas</p><p className="font-semibold text-foreground">{activeJob?.failed_count ?? 0}</p></div>
                </div>

                {activeJob?.error_message && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{activeJob.error_message}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setModalStep('form'); setJobId(null); setSubmittedTotalCandidates(0); finishedJobRef.current = null; setFormError(null); }} className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Nova analise</button>
                  <button type="button" onClick={closeModal} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Fechar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
