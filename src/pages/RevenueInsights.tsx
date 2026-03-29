import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  FileText,
  Filter,
  HandCoins,
  HelpCircle,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  X,
  Zap,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Agent, RevenueCopilotJob, ROIReportSummary } from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { MetricCard } from '../components/dashboard/MetricCard';
import { Button } from '../components/ui/button';
import { cn, formatCurrency, formatDateTime, formatPercent } from '../lib/utils';
import { DemoBanner } from '../components/ui/EmptyState';

type Scope = 'single' | 'all';
type PipelineColumnId = 'hot' | 'risk' | 'best';

interface PreviewCandidate {
  conversation_id: string;
  started_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
}

interface StartResponse {
  success: boolean;
  job_id: string;
  status: RevenueCopilotJob['status'];
  total_candidates: number;
}

interface FunctionPayload {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

interface RevenueInsightsSummaryRow {
  signals_total: number;
  potential_value: number;
  risk_value: number;
  won_value: number;
  conversion_rate: number;
  won_count: number;
  outcomes_count: number;
  actions_total: number;
  accepted_actions: number;
  adoption_rate: number;
  avg_ticket_won: number;
  high_intent_count: number;
  high_risk_count: number;
}

interface RevenueSignalFeedRow {
  id: string;
  conversation_id: string;
  agent_id: string | null;
  stage: string;
  intent_level: string;
  loss_risk_level: string | null;
  estimated_value: number | null;
  close_probability: number | null;
  next_best_action: string | null;
  suggested_reply: string | null;
  generated_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  conversation_started_at: string | null;
}

interface RevenueAgentSummaryRow {
  agent_id: string | null;
  hot_count: number;
  won_value: number;
  risk_value: number;
  conversion_rate: number;
  adoption_rate: number;
  outcomes_count: number;
  actions_count: number;
}

interface PipelineCardItem {
  id: string;
  conversationId: string;
  customerName: string | null;
  stage: string;
  probability: number;
  risk: string | null;
  intent: string;
  estimatedValue: number | null;
  nextBestAction: string | null;
  suggestedReply: string | null;
  generatedAt: string;
}

interface AgentPerformanceRow {
  agentId: string | null;
  name: string;
  avatarUrl: string | null;
  hotCount: number;
  wonValue: number;
  riskValue: number;
  conversion: number;
  adoption: number;
  outcomesCount: number;
  actionsCount: number;
}

interface RecommendationItem {
  title: string;
  body: string;
  tone: 'lime' | 'amber' | 'violet';
}

function dateInputFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function validatePeriod(start: string, end: string): string | null {
  if (!start || !end) return 'Periodo inicial e final sao obrigatorios.';
  if (end < start) return 'Data final nao pode ser menor que data inicial.';
  return null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortConversationId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function recommendationToneCls(tone: RecommendationItem['tone']): string {
  if (tone === 'lime') return 'border-[#d3fe18]/60 bg-[#f6ffd0] text-[#1b1b1b]';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-950';
  return 'border-violet-200 bg-violet-50 text-violet-950';
}

async function invokeEdge<T>(
  name: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let parsed: FunctionPayload | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as FunctionPayload) : null;
  } catch {
    parsed = null;
  }
  const err = (parsed?.error ?? raw ?? '').toString();
  if (!response.ok) throw new Error(err || `Falha HTTP ${response.status}`);
  if (!parsed || parsed.success !== true) throw new Error(err || 'Resposta invalida da funcao');
  return parsed as T;
}

export default function RevenueInsights() {
  const { companyId, company, role } = useCompany();
  const queryClient = useQueryClient();
  const canRun = role === 'owner_admin';
  const businessTimezone = company?.settings?.timezone || 'UTC';

  const nowDate = dateInputFromDate(new Date());
  const startDate = dateInputFromDate(new Date(Date.now() - 30 * 86400000));

  const [showModal, setShowModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [periodStart, setPeriodStart] = useState(startDate);
  const [periodEnd, setPeriodEnd] = useState(nowDate);
  const [conversationId, setConversationId] = useState('');
  const [previewCandidates, setPreviewCandidates] = useState<PreviewCandidate[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [roiGenerating, setRoiGenerating] = useState(false);
  const finishedJobRef = useRef<string | null>(null);

  const agentsQuery = useQuery<Agent[]>({
    queryKey: ['agents-for-revenue', companyId],
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

  const agents = agentsQuery.data ?? [];

  useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const filterAgentId = agentId || null;

  const summaryQuery = useQuery<RevenueInsightsSummaryRow | null>({
    queryKey: ['revenue-insights-summary', companyId, filterAgentId, periodStart, periodEnd, businessTimezone],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc('get_revenue_insights_summary', {
        p_company_id: companyId,
        p_agent_id: filterAgentId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_timezone: businessTimezone,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as RevenueInsightsSummaryRow | null;
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const signalFeedQuery = useQuery<RevenueSignalFeedRow[]>({
    queryKey: ['revenue-signal-feed', companyId, filterAgentId, periodStart, periodEnd, businessTimezone],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc('get_revenue_signal_feed', {
        p_company_id: companyId,
        p_agent_id: filterAgentId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_timezone: businessTimezone,
        p_limit: 300,
      });
      if (error) throw error;
      return (data ?? []) as RevenueSignalFeedRow[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const agentSummaryQuery = useQuery<RevenueAgentSummaryRow[]>({
    queryKey: ['revenue-agent-summary', companyId, filterAgentId, periodStart, periodEnd, businessTimezone],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc('get_revenue_insights_agent_summary', {
        p_company_id: companyId,
        p_agent_id: filterAgentId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_timezone: businessTimezone,
      });
      if (error) throw error;
      return (data ?? []) as RevenueAgentSummaryRow[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const reportsQuery = useQuery<Array<{ id: string; created_at: string; summary: ROIReportSummary }>>({
    queryKey: ['roi-reports-page', companyId, filterAgentId, periodStart, periodEnd],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from('roi_reports')
        .select('id, created_at, summary')
        .eq('company_id', companyId)
        .gte('period_start', periodStart)
        .lte('period_end', periodEnd)
        .order('created_at', { ascending: false })
        .limit(5);

      if (filterAgentId) query = query.eq('agent_id', filterAgentId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; created_at: string; summary: ROIReportSummary }>;
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const summary = summaryQuery.data;
  const signalFeed = signalFeedQuery.data ?? [];
  const reports = reportsQuery.data ?? [];

  const startMutation = useMutation<StartResponse, Error>({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      if (!agentId) throw new Error('Selecione um atendente.');
      const periodError = validatePeriod(periodStart, periodEnd);
      if (periodError) throw new Error(periodError);
      if (scope === 'single' && !conversationId) throw new Error('Selecione uma conversa.');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessao expirada.');

      return invokeEdge<StartResponse>('run-revenue-copilot', token, {
        action: 'start',
        company_id: companyId,
        agent_id: agentId,
        scope,
        conversation_id: scope === 'single' ? conversationId : null,
        period_start: periodStart,
        period_end: periodEnd,
      });
    },
    onSuccess: (result) => {
      setJobId(result.job_id);
      setTotalCandidates(result.total_candidates);
      setFormError(null);
    },
    onError: (error) => setFormError(error.message),
  });

  const jobQuery = useQuery<RevenueCopilotJob, Error>({
    queryKey: ['revenue-copilot-job-page', companyId, jobId],
    enabled: !!companyId && !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_copilot_jobs')
        .select('*')
        .eq('id', jobId as string)
        .eq('company_id', companyId as string)
        .single();
      if (error) throw error;
      return data as RevenueCopilotJob;
    },
  });

  useEffect(() => {
    if (!companyId || !jobId) return;

    const channel = supabase
      .channel(`revenue-copilot-job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'revenue_copilot_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          queryClient.setQueryData(['revenue-copilot-job-page', companyId, jobId], payload.new as RevenueCopilotJob);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, jobId, queryClient]);

  useEffect(() => {
    const job = jobQuery.data;
    if (!job) return;
    if (job.status !== 'completed' && job.status !== 'failed') return;
    if (finishedJobRef.current === job.id) return;
    finishedJobRef.current = job.id;
    queryClient.invalidateQueries({ queryKey: ['revenue-insights-summary'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-signal-feed'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-agent-summary'] });
    queryClient.invalidateQueries({ queryKey: ['roi-reports-page'] });
    if (job.status === 'completed') toast.success('Analise de receita atualizada.');
    else toast.error(job.error_message || 'Revenue Copilot falhou.');
  }, [jobQuery.data, queryClient]);

  const runPreview = async () => {
    setPreviewError(null);
    setPreviewCandidates([]);
    try {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      if (!agentId) throw new Error('Selecione um atendente.');
      const periodError = validatePeriod(periodStart, periodEnd);
      if (periodError) throw new Error(periodError);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessao expirada.');

      const result = await invokeEdge<{ success: true; candidates: PreviewCandidate[] }>('run-revenue-copilot', token, {
        action: 'preview',
        company_id: companyId,
        agent_id: agentId,
        period_start: periodStart,
        period_end: periodEnd,
        limit: 200,
      });
      setPreviewCandidates(result.candidates ?? []);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Erro ao carregar conversas.');
    }
  };

  const generateRoi = async () => {
    try {
      setRoiGenerating(true);
      if (!companyId) throw new Error('Empresa nao selecionada.');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessao expirada.');
      await invokeEdge<{ success: true }>('generate-roi-report', token, {
        company_id: companyId,
        agent_id: filterAgentId,
        period_start: periodStart,
        period_end: periodEnd,
      });
      queryClient.invalidateQueries({ queryKey: ['roi-reports-page'] });
      toast.success('Relatorio ROI gerado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar ROI.');
    } finally {
      setRoiGenerating(false);
    }
  };

  const isPageLoading = summaryQuery.isLoading || signalFeedQuery.isLoading || agentSummaryQuery.isLoading || reportsQuery.isLoading;
  const pageError = summaryQuery.error ?? signalFeedQuery.error ?? agentSummaryQuery.error ?? reportsQuery.error;
  const hasAnyData = (summary?.signals_total ?? 0) > 0 || reports.length > 0 || agentSummaryQuery.data?.length;

  const pipelineColumns = useMemo(() => {
    const sortedByProbability = [...signalFeed].sort((a, b) => toNumber(b.close_probability) - toNumber(a.close_probability));

    const toItem = (signal: RevenueSignalFeedRow): PipelineCardItem => ({
      id: signal.id,
      conversationId: signal.conversation_id,
      customerName: signal.customer_name,
      stage: signal.stage,
      probability: toNumber(signal.close_probability),
      risk: signal.loss_risk_level,
      intent: signal.intent_level,
      estimatedValue: signal.estimated_value,
      nextBestAction: signal.next_best_action,
      suggestedReply: signal.suggested_reply,
      generatedAt: signal.generated_at,
    });

    const hot = sortedByProbability.filter((row) => row.intent_level === 'quente').slice(0, 4).map(toItem);
    const risk = [...signalFeed]
      .filter((row) => row.loss_risk_level === 'alto')
      .sort((a, b) => {
        const valueDiff = toNumber(b.estimated_value) - toNumber(a.estimated_value);
        if (valueDiff !== 0) return valueDiff;
        return toNumber(b.close_probability) - toNumber(a.close_probability);
      })
      .slice(0, 4)
      .map(toItem);
    const blocked = new Set(risk.map((item) => item.id));
    const best = sortedByProbability.filter((row) => !blocked.has(row.id)).slice(0, 4).map(toItem);

    return [
      {
        id: 'hot' as PipelineColumnId,
        title: 'Quentes para fechar',
        subtitle: 'Conversas com maior intencao para acao imediata.',
        icon: <Target className="h-4 w-4 text-[#171717]" />,
        iconBg: 'bg-[#d3fe18]',
        items: hot,
      },
      {
        id: 'risk' as PipelineColumnId,
        title: 'Em risco',
        subtitle: 'Oportunidades que pedem intervencao da lideranca.',
        icon: <ShieldAlert className="h-4 w-4 text-white" />,
        iconBg: 'bg-[#5945fd]',
        items: risk,
      },
      {
        id: 'best' as PipelineColumnId,
        title: 'Melhor oportunidade',
        subtitle: 'Maior chance de fechamento dentro da base atual.',
        icon: <Sparkles className="h-4 w-4 text-[#171717]" />,
        iconBg: 'bg-[#efe9ff]',
        items: best,
      },
    ];
  }, [signalFeed]);

  const agentPerformance = useMemo<AgentPerformanceRow[]>(() => {
    const agentMap = new Map<string, Agent>(agents.map((agent) => [agent.id, agent]));
    const rows = (agentSummaryQuery.data ?? []).map((row) => {
      const agent = row.agent_id ? agentMap.get(row.agent_id) : null;
      return {
        agentId: row.agent_id,
        name: row.agent_id ? (agent?.name ?? 'Atendente nao identificado') : 'Sem atendente',
        avatarUrl: agent?.avatar_url ?? null,
        hotCount: row.hot_count,
        wonValue: toNumber(row.won_value),
        riskValue: toNumber(row.risk_value),
        conversion: toNumber(row.conversion_rate),
        adoption: toNumber(row.adoption_rate),
        outcomesCount: row.outcomes_count,
        actionsCount: row.actions_count,
      } satisfies AgentPerformanceRow;
    });
    return rows.sort((a, b) => b.wonValue - a.wonValue || b.riskValue - a.riskValue || b.hotCount - a.hotCount);
  }, [agentSummaryQuery.data, agents]);

  const recommendations = useMemo<RecommendationItem[]>(() => {
    const items: RecommendationItem[] = [];
    const hotSignals = summary?.high_intent_count ?? 0;
    const highRiskSignals = summary?.high_risk_count ?? 0;
    const riskiestAgent = agentPerformance.find((row) => row.riskValue > 0);
    const adoption = summary?.adoption_rate ?? 0;

    if (hotSignals > 0) {
      items.push({ title: 'Follow-up imediato', body: `Existem ${hotSignals} conversas com intencao quente aguardando acao. Priorize retorno rapido nas de maior probabilidade.`, tone: 'lime' });
    }
    if (highRiskSignals > 0) {
      items.push({ title: 'Receita sob pressao', body: `Ha ${highRiskSignals} oportunidades com risco alto no periodo filtrado. Revise primeiro as de maior valor estimado.`, tone: 'amber' });
    }
    if (riskiestAgent) {
      items.push({ title: 'Foco de lideranca', body: `${riskiestAgent.name} concentra ${formatCurrency(riskiestAgent.riskValue)} de receita em risco neste recorte.`, tone: 'violet' });
    }
    if ((summary?.actions_total ?? 0) > 0 && adoption < 50) {
      items.push({ title: 'Baixa adocao de coaching', body: `A adocao das acoes recomendadas esta em ${formatPercent(adoption)}. Vale revisar execucao e acompanhamento da equipe.`, tone: 'amber' });
    }
    return items.slice(0, 3);
  }, [summary, agentPerformance]);

  const activeJob = jobQuery.data;
  const progressPct = totalCandidates > 0 ? Math.round(((activeJob?.processed_count ?? 0) / totalCandidates) * 100) : 0;

  if (!companyId) {
    return <div className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">Empresa nao selecionada.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d3fe18]/50 bg-[#f8ffd8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1b1b1b] dark:border-[#d3fe18]/20 dark:bg-[#d3fe18]/10 dark:text-[#ecff9d]">
              <HandCoins className="h-3.5 w-3.5" /> Revenue Ops
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Oportunidades de Receita</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                Veja onde existe potencial de fechamento, risco de perda e quais conversas exigem acao agora.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row xl:flex-shrink-0">
            <Button variant="outline" onClick={() => setShowHelp((v) => !v)} className="w-full sm:w-auto"><HelpCircle className="mr-2 h-4 w-4" />Como funciona</Button>
            <Button onClick={() => setShowModal(true)} disabled={!canRun} className="w-full bg-[#5945fd] text-white hover:bg-[#4a39d4] sm:w-auto"><PlayCircle className="mr-2 h-4 w-4" />Atualizar analise</Button>
            <Button variant="outline" onClick={generateRoi} disabled={!canRun || roiGenerating} className="w-full sm:w-auto">{roiGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Gerar relatorio ROI</Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-border bg-background px-3 py-2 text-sm">
            <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"><UserRound className="h-3.5 w-3.5" />Atendente</span>
            <select className="w-full bg-transparent outline-none" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Equipe inteira</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
          <label className="rounded-2xl border border-border bg-background px-3 py-2 text-sm">
            <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />Data inicial</span>
            <input type="date" className="w-full bg-transparent outline-none" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label className="rounded-2xl border border-border bg-background px-3 py-2 text-sm">
            <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />Data final</span>
            <input type="date" className="w-full bg-transparent outline-none" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <button type="button" onClick={() => { setAgentId(''); setPeriodStart(startDate); setPeriodEnd(nowDate); }} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted sm:col-span-2">
            <Filter className="h-4 w-4" /> Limpar
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Filtros aplicados fora do modal. O topo e o ranking usam agregados do backend com timezone da empresa.</p>
          {!canRun && <p>Seu perfil pode visualizar a tela, mas nao pode disparar atualizacoes manuais.</p>}
        </div>
      </section>

      {showHelp && (
        <div className="rounded-2xl border border-primary/20 bg-accent/40 p-5 relative">
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <HandCoins className="h-5 w-5 text-primary" />
            Como funciona o Revenue Insights
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            O Revenue Insights usa IA para analisar conversas e identificar <strong>oportunidades de receita, riscos de perda e proximas melhores acoes</strong> para cada negociacao. Tudo calculado automaticamente a partir das mensagens trocadas.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Analise as conversas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em <strong>Atualizar analise</strong>, selecione um atendente e o periodo. A IA le as conversas e gera sinais de receita para cada uma.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Leia o pipeline</span>
              </div>
              <p className="text-xs text-muted-foreground">
                As conversas sao classificadas em <strong>Quentes</strong> (alta intencao de fechar), <strong>Em risco</strong> (risco alto de perda) e <strong>Melhor oportunidade</strong> (maior chance de conversao).
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Tome acao</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada conversa tem uma <strong>proxima melhor acao</strong> e uma <strong>sugestao de resposta</strong> gerada pela IA. Abra a conversa diretamente do card para agir imediatamente.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Receita potencial</strong>: valor total das oportunidades identificadas no periodo.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#5945fd]" />
              <p className="text-xs text-muted-foreground"><strong>Receita em risco</strong>: valor de negociacoes que podem ser perdidas sem intervencao.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Adocao coaching</strong>: percentual de acoes recomendadas que os atendentes executaram.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground"><strong>Relatorio ROI</strong>: gera um resumo consolidado do periodo com conversao e receita ganha.</p>
            </div>
          </div>
        </div>
      )}

      {pageError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Falha ao carregar dados de revenue: {pageError.message}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Receita potencial" value={formatCurrency(summary?.potential_value ?? 0)} subtitle={`${summary?.signals_total ?? 0} sinais no periodo`} icon={<Target className="h-5 w-5 text-[#171717]" />} iconBg="bg-[#d3fe18]" />
        <MetricCard title="Receita em risco" value={formatCurrency(summary?.risk_value ?? 0)} subtitle={`${summary?.high_risk_count ?? 0} sinais de risco alto`} icon={<AlertTriangle className="h-5 w-5 text-white" />} iconBg="bg-[#5945fd]" />
        <MetricCard title="Receita ganha" value={formatCurrency(summary?.won_value ?? 0)} subtitle={`${summary?.won_count ?? 0} ganhos registrados`} icon={<HandCoins className="h-5 w-5 text-[#171717]" />} iconBg="bg-[#efe9ff]" />
        <MetricCard title="Taxa de conversao" value={formatPercent(summary?.conversion_rate ?? 0)} subtitle={`${summary?.outcomes_count ?? 0} outcomes no periodo`} icon={<TrendingUp className="h-5 w-5 text-[#171717]" />} iconBg="bg-[#e9f7ff]" />
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Pipeline de acao</h3>
              <p className="text-sm text-muted-foreground">Feed filtrado por periodo, com nome do cliente vindo do backend.</p>
            </div>
            <span className="text-xs text-muted-foreground">{signalFeed.length} sinais carregados</span>
          </div>

          {isPageLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Carregando oportunidades...</div> : signalFeed.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum sinal de receita encontrado para esse periodo.</div> : (
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {pipelineColumns.map((column) => (
                <div key={column.id} className="rounded-[24px] border border-border bg-muted/40 p-4">
                  <div className="mb-4 flex items-start gap-3">
                    <div className={cn('grid h-10 w-10 place-items-center rounded-2xl', column.iconBg)}>{column.icon}</div>
                    <div>
                      <h4 className="font-semibold text-foreground">{column.title}</h4>
                      <p className="text-xs leading-5 text-muted-foreground">{column.subtitle}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {column.items.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground">Sem conversas classificadas nesta faixa.</div> : column.items.map((item) => (
                      <article key={item.id} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.customerName?.trim() || `Conv. ${shortConversationId(item.conversationId)}`}</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{item.stage}</p>
                          </div>
                          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">{item.probability.toFixed(0)}%</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">{item.intent}</span>
                          {column.id !== 'best' && item.risk && <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">Risco {item.risk}</span>}
                          {item.estimatedValue != null && toNumber(item.estimatedValue) > 0 && <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">{formatCurrency(item.estimatedValue)}</span>}
                        </div>
                        <div className="mt-4 rounded-2xl bg-muted/60 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Proxima melhor acao</p>
                          <p className="mt-1 text-sm text-foreground">{item.nextBestAction?.trim() || 'Sem acao sugerida.'}</p>
                          {item.suggestedReply?.trim() && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">Sugestao: {item.suggestedReply}</p>}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{formatDateTime(item.generatedAt)}</span>
                          <Link to={`/conversations/${item.conversationId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir conversa<ArrowRight className="h-3.5 w-3.5" /></Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#efe9ff]"><Sparkles className="h-5 w-5 text-[#5945fd]" /></div><div><h3 className="font-semibold text-foreground">Acoes recomendadas</h3><p className="text-sm text-muted-foreground">Sintese operacional gerada a partir dos agregados e do feed filtrado.</p></div></div>
            <div className="space-y-3">
              {recommendations.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">Ainda nao ha sinais suficientes para recomendar prioridades.</div> : recommendations.map((item, index) => (
                <article key={`${item.title}-${index}`} className={cn('rounded-2xl border px-4 py-4', recommendationToneCls(item.tone))}><p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">Prioridade {index + 1}</p><h4 className="mt-1 font-semibold">{item.title}</h4><p className="mt-2 text-sm leading-6 opacity-90">{item.body}</p></article>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f6ffd0]"><TrendingUp className="h-5 w-5 text-[#171717]" /></div><div><h3 className="font-semibold text-foreground">Contexto rapido</h3><p className="text-sm text-muted-foreground">Leitura agregada para decidir acao do dia.</p></div></div>
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-muted/60 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Conversas com sinal</p><p className="mt-1 text-xl font-semibold text-foreground">{summary?.signals_total ?? 0}</p></div>
              <div className="rounded-2xl bg-muted/60 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Receita media por ganho</p><p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(summary?.avg_ticket_won ?? 0)}</p></div>
              <div className="rounded-2xl bg-muted/60 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Adocao coaching</p><p className="mt-1 text-xl font-semibold text-foreground">{formatPercent(summary?.adoption_rate ?? 0)}</p></div>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-semibold text-foreground">Performance por atendente</h3><p className="text-sm text-muted-foreground">Agregado no backend com o mesmo periodo e timezone dos filtros acima.</p></div><span className="text-xs text-muted-foreground">Ordenado por receita ganha</span></div>
        {agentPerformance.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Sem dados de atendente para esse periodo.</div> : <div className="mt-5 space-y-3">{agentPerformance.map((row) => (
          <article key={row.agentId ?? 'unassigned'} className="rounded-[24px] border border-border bg-muted/30 p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3">{row.avatarUrl ? <img src={row.avatarUrl} alt={row.name} className="h-12 w-12 rounded-2xl object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#efe9ff] text-sm font-semibold text-[#5945fd]">{getInitials(row.name)}</div>}<div><p className="font-semibold text-foreground">{row.name}</p><p className="text-sm text-muted-foreground">{row.hotCount} oportunidades quentes no periodo</p></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:min-w-[720px]"><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Quentes</p><p className="mt-1 text-lg font-semibold text-foreground">{row.hotCount}</p></div><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Receita ganha</p><p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(row.wonValue)}</p></div><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Receita em risco</p><p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(row.riskValue)}</p></div><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Conversao</p><p className="mt-1 text-lg font-semibold text-foreground">{formatPercent(row.conversion)}</p></div><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Adocao coaching</p><p className="mt-1 text-lg font-semibold text-foreground">{formatPercent(row.adoption)}</p></div></div></div></article>
        ))}</div>}
      </section>

      {(reports.length > 0 || !isPageLoading) && <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-semibold text-foreground">Historico de ROI</h3><p className="text-sm text-muted-foreground">Relatorios gerados para o periodo filtrado.</p></div><span className="text-xs text-muted-foreground">Ultimos 5 relatorios</span></div>{reports.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum relatorio ROI gerado neste recorte.</div> : <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">{reports.map((report) => (<article key={report.id} className="rounded-[24px] border border-border bg-muted/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Relatorio ROI</p><p className="mt-1 font-semibold text-foreground">{formatDateTime(report.created_at)}</p></div><div className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">{formatPercent(report.summary?.totals?.conversion_rate ?? 0)} conv.</div></div><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Receita ganha</p><p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(report.summary?.totals?.won_value ?? 0)}</p></div><div className="rounded-2xl bg-background px-3 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Periodo</p><p className="mt-1 text-sm font-medium text-foreground">{report.summary?.period_start ?? '--'} ate {report.summary?.period_end ?? '--'}</p></div></div></article>))}</div>}</section>}

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"><div className="w-full max-w-2xl rounded-[28px] bg-card shadow-2xl"><div className="flex items-start justify-between border-b border-border px-6 py-5"><div><h3 className="text-xl font-semibold text-foreground">Atualizar analise de receita</h3><p className="text-sm text-muted-foreground">Selecione atendente, periodo e escopo para atualizar os sinais usados nesta tela.</p></div><button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={() => setShowModal(false)}><X className="h-5 w-5" /></button></div><div className="space-y-4 p-6"><div className="grid grid-cols-1 gap-3 md:grid-cols-2"><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">Selecione um atendente</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value as Scope)}><option value="all">Todas as conversas</option><option value="single">Uma conversa</option></select><input type="date" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /><input type="date" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>{scope === 'single' && <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4"><div className="flex flex-wrap items-center gap-2"><Button variant="outline" type="button" onClick={runPreview}>Carregar conversas</Button>{previewError && <span className="text-sm text-red-600">{previewError}</span>}</div><select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={conversationId} onChange={(e) => setConversationId(e.target.value)}><option value="">Selecione uma conversa</option>{previewCandidates.map((candidate) => (<option key={candidate.conversation_id} value={candidate.conversation_id}>{(candidate.customer_name ?? 'Sem nome')} - {formatDateTime(candidate.started_at)}</option>))}</select></div>}{formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}{jobId && <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm"><div className="flex items-center justify-between gap-3"><p className="font-medium text-foreground">Status: {activeJob?.status ?? 'queued'}</p><span className="text-muted-foreground">{progressPct}%</span></div><p className="mt-1 text-muted-foreground">Processadas: {activeJob?.processed_count ?? 0}/{totalCandidates}</p><div className="mt-3"><div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Realtime ativo</span><span>{progressPct}%</span></div><div className="h-2 rounded-full bg-background"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} /></div></div>{activeJob?.error_message && <p className="mt-2 text-red-600">{activeJob.error_message}</p>}</div>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" type="button" onClick={() => setShowModal(false)}>Fechar</Button><Button type="button" onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className={cn('bg-[#5945fd] text-white hover:bg-[#4a39d4]', startMutation.isPending && 'opacity-70')}>{startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar analise</Button></div></div></div></div>}

      {!isPageLoading && !hasAnyData && !pageError && (
        <>
          <DemoBanner />
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            A base ainda nao possui sinais de receita. Execute a analise de IA nas conversas para que os insights de oportunidade apareçam aqui.
          </div>
        </>
      )}
    </div>
  );
}
