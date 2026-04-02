import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Gauge,
  FilterX,
  Loader2,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { clearStoredSupabaseSession, isInvalidRefreshTokenError } from '../integrations/supabase/client';
import type {
  Agent,
  AIAnalysisJob,
  AIInsightsAgentSummary,
  AIInsightsFailureHeatmapCell,
  AIInsightsReviewItem,
  AIInsightsSummary,
  AIInsightsTagSummary,
  AISellerAuditRun,
} from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { MetricCard } from '../components/dashboard/MetricCard';
import { Button } from '../components/ui/button';
import { channelLabel, cn, formatDateTime, formatPercent } from '../lib/utils';
import { downloadCsv } from '../lib/export';
import { toast } from 'sonner';
import { DemoBanner } from '../components/ui/EmptyState';

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

interface SellerAuditStartResponse {
  success: boolean;
  reused: boolean;
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_conversations: number;
  prompt_version?: string;
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
const REVIEW_PAGE_SIZE = 20;
type AuditAlertLevel = 'verde' | 'amarelo' | 'laranja' | 'vermelho';

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

async function getValidAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    const refreshedToken = data.session?.access_token;
    if (error || !refreshedToken) {
      if (isInvalidRefreshTokenError(error)) {
        await clearStoredSupabaseSession();
      }
      throw new Error('Sessao expirada. Faca login novamente.');
    }
    return refreshedToken;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    if (isInvalidRefreshTokenError(sessionError)) {
      await clearStoredSupabaseSession();
    }
    throw new Error('Nao foi possivel validar a sessao. Faca login novamente.');
  }

  const accessToken = sessionData.session?.access_token;
  if (accessToken) return accessToken;

  return getValidAccessToken(true);
}

async function invokeProtectedFunction<T>(
  path: string,
  payload: Record<string, unknown>,
  invalidMessage: string,
  retryOnAuthError = true,
  accessToken?: string,
): Promise<T> {
  const resolvedToken = accessToken ?? await getValidAccessToken();
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${resolvedToken}`,
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

  if (response.status === 401 && retryOnAuthError) {
    const refreshedToken = await getValidAccessToken(true);
    return invokeProtectedFunction<T>(path, payload, invalidMessage, false, refreshedToken);
  }

  if (!response.ok) throw new Error(mapHttpError(response.status, backendMessage));
  if (!parsed || parsed.success !== true) {
    throw new Error(backendMessage || invalidMessage);
  }

  return parsed as T;
}

async function invokeRunAiAnalysis<T>(
  payload: Record<string, unknown>,
): Promise<T> {
  return invokeProtectedFunction<T>('run-ai-analysis', payload, 'Resposta invalida da funcao run-ai-analysis.');
}

async function invokeRunSellerAudit<T>(
  payload: Record<string, unknown>,
): Promise<T> {
  return invokeProtectedFunction<T>('run-seller-audit', payload, 'Resposta invalida da funcao run-seller-audit.');
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

function auditAlertLabel(level: AuditAlertLevel | undefined | null): string {
  switch (level) {
    case 'verde':
      return 'Saudavel';
    case 'amarelo':
      return 'Exige correcao';
    case 'laranja':
      return 'Compromete resultado';
    case 'vermelho':
      return 'Gargalo operacional';
    default:
      return 'Sem leitura';
  }
}

function auditAlertTone(level: AuditAlertLevel | undefined | null): string {
  switch (level) {
    case 'verde':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'amarelo':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'laranja':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'vermelho':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function formatAuditRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
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

function isSessionExpiredMessage(message: string | null | undefined): boolean {
  const normalized = (message ?? '').toLowerCase();
  return normalized.includes('sessao expirada') || normalized.includes('faça login novamente') || normalized.includes('faca login novamente');
}

export default function AIInsights() {
  const { companyId, company, role } = useCompany();
  const { isBlockedPhone } = useBlockedPhones();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const canRunManualAnalysis = role === 'owner_admin';
  const timezone = company?.settings?.timezone || 'UTC';
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);

  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [selectedAgentId, setSelectedAgentId] = useState(ALL_AGENTS);
  const [selectedTag, setSelectedTag] = useState('');
  const [coachingFilter, setCoachingFilter] = useState<CoachingFilter>('all');
  const [reviewPage, setReviewPage] = useState(1);

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

  useEffect(() => {
    setReviewPage(1);
  }, [companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter]);

  const reviewFeedQuery = useQuery<AIInsightsReviewItem[]>({
    queryKey: ['ai-insights', 'review-feed', companyId, selectedAgentId, periodStart, periodEnd, timezone, selectedTag, coachingFilter, reviewPage],
    queryFn: async () => {
      if (!rpcBaseParams) return [];
      const { data, error } = await supabase.rpc('get_ai_insights_review_feed', {
        ...rpcBaseParams,
        p_limit: REVIEW_PAGE_SIZE,
        p_offset: (reviewPage - 1) * REVIEW_PAGE_SIZE,
      });
      if (error) throw error;
      const items = (data ?? []) as AIInsightsReviewItem[];
      return items.filter(i => !isBlockedPhone(i.customer_phone));
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

  const sellerAuditEnabled = !!companyId && selectedAgentId !== ALL_AGENTS && !filterError;

  const sellerAuditQuery = useQuery<AISellerAuditRun | null>({
    queryKey: ['ai-seller-audit', companyId, selectedAgentId, periodStart, periodEnd],
    queryFn: async () => {
      if (!companyId || selectedAgentId === ALL_AGENTS) return null;
      const { data, error } = await supabase
        .from('ai_seller_audit_runs')
        .select('id, company_id, requested_by_user_id, agent_id, period_start, period_end, company_timezone, source, status, total_conversations, processed_count, analyzed_count, failed_count, report_json, report_markdown, prompt_version, model_used, error_message, created_at, started_at, finished_at, updated_at')
        .eq('company_id', companyId)
        .eq('agent_id', selectedAgentId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('prompt_version', 'v1-manager-hard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as AISellerAuditRun | null) ?? null;
    },
    enabled: sellerAuditEnabled,
    staleTime: 0,
    refetchInterval: (query) => {
      if (!sellerAuditEnabled) return false;
      const status = query.state.data?.status;
      if (!query.state.data || status === 'queued' || status === 'running') return 8000;
      return false;
    },
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

      return invokeRunAiAnalysis<PreviewResponse>({
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

  const redirectToLogin = (message?: string) => {
    closeModal();
    toast.error(message || 'Sessao expirada. Faca login novamente.');
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
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

      if (effectiveAgentId === ALL_AGENTS) {
        if (agents.length === 0) throw new Error('Nenhum atendente encontrado.');

        let started = 0;
        let errors = 0;
        for (const agent of agents) {
          try {
            await invokeRunAiAnalysis<StartResponse>({
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

      return invokeRunAiAnalysis<StartResponse>({
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
      if (isSessionExpiredMessage(error.message)) {
        redirectToLogin(error.message);
        return;
      }
      setFormError(error.message || 'Erro ao iniciar analise manual.');
    },
  });

  const runSellerAuditMutation = useMutation<SellerAuditStartResponse, Error, boolean | undefined>({
    mutationFn: async (forceRefresh) => {
      if (!companyId || selectedAgentId === ALL_AGENTS) throw new Error('Selecione um atendente para gerar auditoria mensal.');

      return invokeRunSellerAudit<SellerAuditStartResponse>({
        action: 'start',
        company_id: companyId,
        agent_id: selectedAgentId,
        period_start: periodStart,
        period_end: periodEnd,
        force_refresh: !!forceRefresh,
      });
    },
    onSuccess: (result) => {
      toast.success(result.reused ? 'Auditoria mensal reaproveitada.' : 'Auditoria mensal enfileirada.');
      queryClient.invalidateQueries({ queryKey: ['ai-seller-audit'] });
    },
    onError: (error) => {
      if (isSessionExpiredMessage(error.message)) {
        redirectToLogin(error.message);
        return;
      }
      toast.error(error.message || 'Falha ao iniciar auditoria mensal.');
    },
  });

  useEffect(() => {
    if (!showModal || !previewQuery.isError) return;
    const message = previewQuery.error?.message ?? '';
    if (isSessionExpiredMessage(message)) {
      redirectToLogin(message);
    }
  }, [previewQuery.error, previewQuery.isError, showModal]);

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
  });

  useEffect(() => {
    if (!companyId || !jobId || !showModal || (modalStep !== 'processing' && modalStep !== 'result')) return;

    const channel = supabase
      .channel(`ai-analysis-job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_analysis_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          queryClient.setQueryData(['ai-insights', 'job', companyId, jobId], payload.new as AIAnalysisJob);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, jobId, modalStep, queryClient, showModal]);

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
      queryClient.invalidateQueries({ queryKey: ['ai-seller-audit'] });
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

  const sellerAuditRun = sellerAuditQuery.data;
  const sellerAuditReport = sellerAuditRun?.report_json ?? null;

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
  const sellerAuditError = sellerAuditQuery.error;
  const isLoading = summaryQuery.isLoading || agentSummaryQuery.isLoading || tagSummaryQuery.isLoading || reviewFeedQuery.isLoading || heatmapQuery.isLoading;
  const summary = summaryQuery.data;
  const reviewItems = reviewFeedQuery.data ?? [];
  const totalReviewItems = reviewItems[0]?.total_count ?? 0;
  const totalReviewPages = Math.max(1, Math.ceil(totalReviewItems / REVIEW_PAGE_SIZE));
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
    setReviewPage(1);
  };

  const drillToReviews = (agentId?: string | null, tag?: string, coaching: CoachingFilter = 'yes') => {
    setReviewPage(1);
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/playbooks" className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10">
                Ajustar playbooks
              </Link>
              <Link to="/conversations" className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5">
                Revisar conversas
              </Link>
              <Link to="/alerts" className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5">
                Ver alertas abertos
              </Link>
            </div>
          </div>

          {canRunManualAnalysis && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  downloadCsv('ai-insights.csv', reviewItems.map((item) => ({
                    cliente: item.customer_name ?? item.customer_phone ?? 'Sem nome',
                    atendente: item.agent_name,
                    score: item.quality_score,
                    coaching: item.needs_coaching,
                    canal: item.channel ? channelLabel(item.channel) : '--',
                    analisada_em: item.analyzed_at,
                  })));
                }}
              >
                Exportar CSV
              </Button>
              <Button
                className="shrink-0 border border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                onClick={openModal}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Atualizar analise manual
              </Button>
            </div>
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

      <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <ShieldAlert className="h-3.5 w-3.5" />
              Auditoria Mensal do Vendedor
            </div>
            <h3 className="mt-4 text-xl font-bold text-foreground">Leitura executiva dura, separada da analise por conversa</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Esse bloco consolida o periodo inteiro para um unico atendente, com veredito, nivel de alerta, falhas mais graves e oportunidades perdidas.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={selectedAgentId === ALL_AGENTS || runSellerAuditMutation.isPending || sellerAuditRun?.status === 'queued' || sellerAuditRun?.status === 'running'}
            onClick={() => runSellerAuditMutation.mutate(!!sellerAuditRun)}
          >
            {runSellerAuditMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {sellerAuditRun ? 'Atualizar auditoria mensal' : 'Gerar auditoria mensal'}
          </Button>
        </div>

        {sellerAuditError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Falha ao carregar auditoria mensal: {sellerAuditError.message}
          </div>
        )}

        {selectedAgentId === ALL_AGENTS ? (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-6 text-sm text-muted-foreground">
            Selecione um atendente especifico para ativar a auditoria mensal. Esse relatorio nao roda para todos ao mesmo tempo.
          </div>
        ) : !sellerAuditRun ? (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-6">
            <p className="text-sm font-medium text-foreground">Nenhuma auditoria mensal pronta para este recorte.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando voce analisar todas as conversas de um unico atendente, o sistema vai disparar esse relatorio automaticamente. Tambem da para gerar manualmente aqui.
            </p>
          </div>
        ) : sellerAuditRun.status === 'queued' || sellerAuditRun.status === 'running' ? (
          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Auditoria em processamento</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAgentName} • {sellerAuditRun.period_start} ate {sellerAuditRun.period_end}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-semibold text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {sellerAuditRun.status === 'queued' ? 'Na fila' : 'Processando'}
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-primary/10">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{
                  width: `${sellerAuditRun.total_conversations > 0 ? Math.min(100, Math.round((sellerAuditRun.processed_count / sellerAuditRun.total_conversations) * 100)) : 12}%`,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{sellerAuditRun.processed_count} processadas</span>
              <span>{sellerAuditRun.analyzed_count} consolidadas</span>
              <span>{sellerAuditRun.failed_count} falharam</span>
            </div>
          </div>
        ) : sellerAuditRun.status === 'failed' ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-700">A auditoria mensal falhou.</p>
                <p className="mt-1 text-sm text-red-700">{sellerAuditRun.error_message || 'Nao foi possivel concluir o processamento.'}</p>
              </div>
            </div>
          </div>
        ) : sellerAuditReport ? (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-2xl border border-border bg-background p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]', auditAlertTone(sellerAuditReport.alert_level))}>
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {auditAlertLabel(sellerAuditReport.alert_level)}
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-foreground">{selectedAgentName}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{sellerAuditReport.executive_verdict}</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-card px-4 py-3 text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nota final</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">
                      {sellerAuditReport.final_score != null ? sellerAuditReport.final_score.toFixed(1) : '--'}
                    </p>
                    <p className="text-sm text-muted-foreground">{sellerAuditReport.seller_level}</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {[
                    ['Tentativa de fechamento', formatAuditRate(sellerAuditReport.performance_metrics.close_attempt_rate)],
                    ['Follow-up', formatAuditRate(sellerAuditReport.performance_metrics.follow_up_rate)],
                    ['Diagnostico real', formatAuditRate(sellerAuditReport.performance_metrics.real_diagnosis_rate)],
                    ['Abandono', formatAuditRate(sellerAuditReport.performance_metrics.abandonment_rate)],
                    ['Objecao mal tratada', formatAuditRate(sellerAuditReport.performance_metrics.poor_objection_handling_rate)],
                    ['Resposta passiva', formatAuditRate(sellerAuditReport.performance_metrics.passive_response_rate)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Placar por competencia</p>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ['Abertura', sellerAuditReport.scorecard.abertura],
                    ['Agilidade', sellerAuditReport.scorecard.agilidade],
                    ['Diagnostico', sellerAuditReport.scorecard.diagnostico],
                    ['Conducao', sellerAuditReport.scorecard.conducao],
                    ['Valor', sellerAuditReport.scorecard.construcao_valor],
                    ['Objecoes', sellerAuditReport.scorecard.objecoes],
                    ['Fechamento', sellerAuditReport.scorecard.fechamento],
                    ['Follow-up', sellerAuditReport.scorecard.follow_up],
                    ['Comunicacao', sellerAuditReport.scorecard.comunicacao],
                    ['Consistencia', sellerAuditReport.scorecard.consistencia],
                  ].map(([label, rawValue]) => {
                    const numericValue = typeof rawValue === 'number' ? rawValue : null;
                    const width = numericValue != null ? `${Math.max(8, numericValue * 10)}%` : '8%';
                    return (
                      <div key={label}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold text-foreground">{numericValue != null ? numericValue.toFixed(1) : '--'}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary transition-all" style={{ width }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">O que esta fazendo de errado</p>
                <div className="mt-3 space-y-2">
                  {sellerAuditReport.main_errors.map((item) => (
                    <div key={item} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{item}</div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">Como esta prejudicando a operacao</p>
                <div className="mt-3 space-y-2">
                  {sellerAuditReport.operational_impact.map((item) => (
                    <div key={item} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">Falhas mais graves</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...sellerAuditReport.critical_failures, ...sellerAuditReport.high_failures].map((item) => (
                    <span key={item} className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">{item}</span>
                  ))}
                  {[...sellerAuditReport.medium_failures, ...sellerAuditReport.low_failures].map((item) => (
                    <span key={item} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">{item}</span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{sellerAuditReport.unfiltered_manager_note}</p>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">Acoes recomendadas ao gestor</p>
                <div className="mt-3 space-y-2">
                  {sellerAuditReport.manager_actions.map((item) => (
                    <div key={item} className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground">{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">Oportunidades perdidas</p>
                <div className="mt-3 space-y-3">
                  {sellerAuditReport.lost_opportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma oportunidade perdida consolidada neste recorte.</p>
                  ) : sellerAuditReport.lost_opportunities.map((item) => (
                    <div key={`${item.conversation_id}-${item.what_happened}`} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Link to={`/conversations/${item.conversation_id}`} className="text-sm font-semibold text-primary hover:underline">
                          Conversa {item.conversation_id.slice(0, 8)}
                        </Link>
                        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', item.impact === 'high' ? 'bg-red-100 text-red-700' : item.impact === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')}>
                          {item.impact}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-foreground">{item.what_happened}</p>
                      <p className="mt-2 text-sm text-muted-foreground">Deveria ter feito: {item.what_should_have_been_done}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm font-semibold text-foreground">Plano de intervencao - 30 dias</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Parar agora</p>
                    <div className="mt-2 space-y-2">
                      {sellerAuditReport.intervention_plan_30d.stop_now.map((item) => (
                        <div key={item} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{item}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Comecar agora</p>
                    <div className="mt-2 space-y-2">
                      {sellerAuditReport.intervention_plan_30d.start_now.map((item) => (
                        <div key={item} className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground">{item}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Treinar nos proximos 30 dias</p>
                    <div className="mt-2 space-y-2">
                      {sellerAuditReport.intervention_plan_30d.train_next_30_days.map((item) => (
                        <div key={item} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-4">{[...Array(4)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : (summary?.analyses_total ?? 0) === 0 ? (
        <>
          <DemoBanner />
          <div className="rounded-2xl border border-border bg-card p-16 text-center">
            <Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">Nenhuma analise encontrada para os filtros atuais.</p>
            <p className="mt-1 text-sm text-muted-foreground">Execute uma analise manual acima para ver os insights de qualidade do seu time.</p>
          </div>
        </>
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
                <span className="text-xs text-muted-foreground">
                  {totalReviewItems} conversa(s) no recorte • pagina {reviewPage} de {totalReviewPages}
                </span>
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

              {totalReviewItems > REVIEW_PAGE_SIZE && (
                <div className="flex flex-col gap-3 border-t border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {(reviewPage - 1) * REVIEW_PAGE_SIZE + 1}-
                    {Math.min(reviewPage * REVIEW_PAGE_SIZE, totalReviewItems)} de {totalReviewItems}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reviewPage <= 1}
                      onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="min-w-[88px] text-center text-xs font-medium text-muted-foreground">
                      Pagina {reviewPage}/{totalReviewPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reviewPage >= totalReviewPages}
                      onClick={() => setReviewPage((page) => Math.min(totalReviewPages, page + 1))}
                    >
                      Proxima
                    </Button>
                  </div>
                </div>
              )}
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
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Realtime ativo</span>
                    <span>{activeProcessed}/{activeTotalCandidates || 0} itens</span>
                  </div>
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
