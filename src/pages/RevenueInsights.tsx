import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, HandCoins, Loader2, PlayCircle, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Agent, CoachingAction, DealSignal, RevenueCopilotJob, RevenueOutcome, ROIReportSummary } from '../types';
import { CACHE } from '../config/constants';
import { env } from '../config/env';
import { MetricCard } from '../components/dashboard/MetricCard';
import { Button } from '../components/ui/button';
import { cn, formatCurrency, formatDateTime, formatPercent } from '../lib/utils';

type Scope = 'single' | 'all';

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
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const canRun = role === 'owner_admin' || role === 'manager' || role === 'qa_reviewer';

  const nowDate = dateInputFromDate(new Date());
  const startDate = dateInputFromDate(new Date(Date.now() - 30 * 86400000));

  const [showModal, setShowModal] = useState(false);
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
  const finishedJobRef = useRef<string | null>(null);
  const [roiGenerating, setRoiGenerating] = useState(false);

  const { data: agents } = useQuery<Agent[]>({
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

  useEffect(() => {
    if (!agentId && agents && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const { data: signals, isLoading } = useQuery<DealSignal[]>({
    queryKey: ['deal-signals-page', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('deal_signals')
        .select('*')
        .eq('company_id', companyId)
        .order('generated_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as DealSignal[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: outcomes } = useQuery<RevenueOutcome[]>({
    queryKey: ['revenue-outcomes-page', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('revenue_outcomes')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as RevenueOutcome[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: actions } = useQuery<CoachingAction[]>({
    queryKey: ['coaching-actions-page', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('coaching_actions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as CoachingAction[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: reports } = useQuery<Array<{ id: string; created_at: string; summary: ROIReportSummary }>>({
    queryKey: ['roi-reports-page', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('roi_reports')
        .select('id, created_at, summary')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; created_at: string; summary: ROIReportSummary }>;
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === 'completed' || status === 'failed') return false;
      return 2000;
    },
  });

  useEffect(() => {
    const job = jobQuery.data;
    if (!job) return;
    if (job.status !== 'completed' && job.status !== 'failed') return;
    if (finishedJobRef.current === job.id) return;
    finishedJobRef.current = job.id;
    queryClient.invalidateQueries({ queryKey: ['deal-signals-page', companyId] });
    if (job.status === 'completed') toast.success('Revenue Copilot concluido.');
    else toast.error(job.error_message || 'Revenue Copilot falhou.');
  }, [jobQuery.data, queryClient, companyId]);

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

      const result = await invokeEdge<{ success: true; candidates: PreviewCandidate[] }>(
        'run-revenue-copilot',
        token,
        {
          action: 'preview',
          company_id: companyId,
          agent_id: agentId,
          period_start: periodStart,
          period_end: periodEnd,
          limit: 200,
        },
      );
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
        agent_id: agentId || null,
        period_start: periodStart,
        period_end: periodEnd,
      });
      queryClient.invalidateQueries({ queryKey: ['roi-reports-page', companyId] });
      toast.success('Relatorio ROI gerado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar ROI.');
    } finally {
      setRoiGenerating(false);
    }
  };

  const signalsTotal = signals?.length ?? 0;
  const hotSignals = signals?.filter((row) => row.intent_level === 'quente').length ?? 0;
  const highRisk = signals?.filter((row) => row.loss_risk_level === 'alto').length ?? 0;
  const avgClose = signalsTotal > 0
    ? (signals?.reduce((sum, row) => sum + Number(row.close_probability ?? 0), 0) ?? 0) / signalsTotal
    : 0;
  const wonOutcomes = outcomes?.filter((row) => row.outcome === 'won') ?? [];
  const wonValue = wonOutcomes.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const conversion = (outcomes?.length ?? 0) > 0 ? (wonOutcomes.length / (outcomes?.length ?? 1)) * 100 : 0;
  const adoption = (actions?.length ?? 0) > 0
    ? ((actions?.filter((row) => row.accepted).length ?? 0) / (actions?.length ?? 1)) * 100
    : 0;

  const topSignals = useMemo(
    () => [...(signals ?? [])].sort((a, b) => (b.close_probability ?? 0) - (a.close_probability ?? 0)).slice(0, 10),
    [signals],
  );

  const activeJob = jobQuery.data;
  const progressPct = totalCandidates > 0 ? Math.round(((activeJob?.processed_count ?? 0) / totalCandidates) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Revenue Insights</h2>
          <p className="text-muted-foreground">Copilot de conversao, coaching e ROI.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateRoi} disabled={!canRun || roiGenerating}>
            {roiGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Gerar ROI
          </Button>
          <Button variant="outline" onClick={() => setShowModal(true)} disabled={!canRun}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Analisar Copilot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Sinais Copilot" value={String(signalsTotal)} icon={<HandCoins className="h-5 w-5 text-primary" />} />
        <MetricCard title="Intencao Quente" value={String(hotSignals)} icon={<TrendingUp className="h-5 w-5 text-primary" />} />
        <MetricCard title="Risco Alto" value={String(highRisk)} icon={<AlertTriangle className="h-5 w-5 text-red-600" />} />
        <MetricCard title="Prob. Fechamento" value={`${avgClose.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard title="Receita Ganha" value={formatCurrency(wonValue)} subtitle={`${wonOutcomes.length} ganhos`} />
        <MetricCard title="Taxa Conversao" value={formatPercent(conversion)} subtitle={`${outcomes?.length ?? 0} outcomes`} />
        <MetricCard title="Adocao Coaching" value={formatPercent(adoption)} subtitle={`${actions?.length ?? 0} acoes`} />
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold text-foreground">Top Conversas para Acao</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : topSignals.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sem sinais ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Conversa</th>
                  <th className="px-4 py-3">Estagio</th>
                  <th className="px-4 py-3">Intencao</th>
                  <th className="px-4 py-3">Risco</th>
                  <th className="px-4 py-3">Prob.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topSignals.map((signal) => (
                  <tr key={signal.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/conversations/${signal.conversation_id}`} className="text-primary hover:underline">
                        {signal.conversation_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{signal.stage}</td>
                    <td className="px-4 py-3">{signal.intent_level}</td>
                    <td className="px-4 py-3">{signal.loss_risk_level}</td>
                    <td className="px-4 py-3">{signal.close_probability ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(reports ?? []).length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-3 text-lg font-semibold text-foreground">Ultimos Relatorios ROI</h3>
          <div className="space-y-2">
            {reports?.map((report) => (
              <div key={report.id} className="rounded-xl border border-border bg-muted px-3 py-2 text-sm">
                <p className="font-medium text-foreground">
                  {formatDateTime(report.created_at)} - Conversao {formatPercent(report.summary?.totals?.conversion_rate ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Receita ganha: {formatCurrency(report.summary?.totals?.won_value ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">Revenue Copilot Manual</h3>
                <p className="text-sm text-muted-foreground">Selecione atendente, periodo e escopo.</p>
              </div>
              <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select className="rounded-xl border border-border px-3 py-2 text-sm" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  <option value="">Selecione um atendente</option>
                  {(agents ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
                <select className="rounded-xl border border-border px-3 py-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                  <option value="all">Todas as conversas</option>
                  <option value="single">Uma conversa</option>
                </select>
                <input type="date" className="rounded-xl border border-border px-3 py-2 text-sm" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                <input type="date" className="rounded-xl border border-border px-3 py-2 text-sm" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>

              {scope === 'single' && (
                <div className="space-y-2 rounded-xl border border-border bg-muted p-4">
                  <div className="flex gap-2">
                    <Button variant="outline" type="button" onClick={runPreview}>Carregar conversas</Button>
                    {previewError && <span className="text-sm text-red-600">{previewError}</span>}
                  </div>
                  <select className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
                    <option value="">Selecione uma conversa</option>
                    {previewCandidates.map((candidate) => (
                      <option key={candidate.conversation_id} value={candidate.conversation_id}>
                        {(candidate.customer_name ?? 'Sem nome')} - {formatDateTime(candidate.started_at)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

              {jobId && (
                <div className="rounded-xl border border-primary/20 bg-accent px-3 py-2 text-sm">
                  <p className="font-medium text-primary">Status: {activeJob?.status ?? 'queued'}</p>
                  <p className="text-primary">
                    Processadas: {activeJob?.processed_count ?? 0}/{totalCandidates} ({progressPct}%)
                  </p>
                  {activeJob?.error_message && <p className="text-red-600">{activeJob.error_message}</p>}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Fechar</Button>
                <Button
                  type="button"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className={cn(startMutation.isPending && 'opacity-70')}
                >
                  {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar analise
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
