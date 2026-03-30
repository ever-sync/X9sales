import { useMemo, useState, type ElementType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart2,
  Brain,
  CalendarRange,
  Flame,
  HelpCircle,
  Loader2,
  Package,
  PlayCircle,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime } from '../lib/utils';
import { useCompany } from '../contexts/CompanyContext';
import { env } from '../config/env';
import { supabase, clearStoredSupabaseSession, isInvalidRefreshTokenError } from '../integrations/supabase/client';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { ProductIntelligenceStrategicPanel } from '../components/reports/ProductIntelligenceStrategicPanel';
import { Button } from '../components/ui/button';
import type { ProductIntelligenceRun } from '../types';

type Tab = 'produto' | 'objecoes';

interface PIReport {
  conversation_id: string;
  produto_citado: string | null;
  produto_interesse: string | null;
  produtos_comparados: string[];
  motivo_interesse: string | null;
  dificuldade_entendimento: string | null;
  barreiras_produto: string[];
  objecao_tratada: boolean | null;
  oportunidade_perdida: boolean | null;
}

interface StartResponse {
  success: boolean;
  reused: boolean;
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_conversations: number;
  prompt_version?: string;
  error?: string;
}

function countOcc(arr: (string | null)[]): Record<string, number> {
  return arr.reduce((acc, value) => {
    const key = value?.trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function pct(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

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
  if (status === 403) return 'Voce nao tem permissao para executar esta analise.';
  if (status === 400) return backendMessage || 'Parametros invalidos para analise.';
  return backendMessage || `Falha HTTP ${status} ao executar analise.`;
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

async function invokeRunProductIntelligence<T>(payload: Record<string, unknown>): Promise<T> {
  const accessToken = await getValidAccessToken();
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/run-product-intelligence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  const backendMessage = (parsed && typeof parsed.error === 'string' ? parsed.error : rawText).trim();
  if (!response.ok) throw new Error(mapHttpError(response.status, backendMessage));
  if (!parsed || parsed.success !== true) {
    throw new Error(backendMessage || 'Resposta invalida da funcao run-product-intelligence.');
  }

  return parsed as T;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
  accent,
}: {
  label: string;
  value: string;
  icon: ElementType;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border p-4', accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-xl font-bold leading-tight', accent ? 'text-primary' : 'text-foreground')}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', accent ? 'bg-primary/15' : 'bg-muted')}>
          <Icon className={cn('h-4.5 w-4.5', accent ? 'text-primary' : 'text-muted-foreground')} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: ElementType; title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4.5 w-4.5 text-primary" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function PatternTag({ text, tone }: { text: string; tone: 'green' | 'amber' | 'violet' | 'blue' | 'rose' }) {
  const cls = {
    green: 'border-[#d3fe18]/50 bg-[#d3fe18]/10 text-[#4a5000]',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone];

  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5', cls)}>
      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="text-sm leading-snug">{text}</span>
    </div>
  );
}

function Trend({ dir }: { dir: 'up' | 'down' | 'stable' }) {
  if (dir === 'up') return <TrendingUp className="h-3.5 w-3.5 text-rose-500" />;
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
  return <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ProductRankRow({ rank, name, percentage, badge }: { rank: number; name: string; percentage: number; badge?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className="w-5 text-center text-xs font-bold text-muted-foreground">{rank}</span>
      <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
      {badge && <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{badge}</span>}
      <div className="flex items-center gap-1.5 shrink-0">
        <Trend dir="stable" />
        <span className="text-sm font-bold text-foreground">{percentage}%</span>
      </div>
    </div>
  );
}

function ProductIssueItem({
  product,
  issue,
  percentage,
  icon: Icon,
  iconClassName,
}: {
  product: string;
  issue: string;
  percentage: number;
  icon: ElementType;
  iconClassName: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{product}</p>
        <p className="text-xs text-muted-foreground">{issue}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-foreground">{percentage}%</span>
    </div>
  );
}

function ObjectionCard({ text, percentage, count }: { text: string; percentage: number; count: number }) {
  const impact = percentage >= 25 ? 'alto' : percentage >= 12 ? 'medio' : 'baixo';
  const impactClassName = {
    alto: 'bg-rose-100 text-rose-700',
    medio: 'bg-amber-100 text-amber-700',
    baixo: 'bg-green-100 text-green-700',
  }[impact];

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{text}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <Trend dir="stable" />
          <span className="text-sm font-bold text-foreground">{percentage}%</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', impactClassName)}>impacto {impact}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Identificada em {count} conversa{count !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-primary">Sugestao: </span>
        Rever a forma como o produto e apresentado quando essa objecao aparece.
      </p>
    </div>
  );
}

export default function ProductIntelligence() {
  const { companyId, role } = useCompany();
  const { isBlockedConversationId } = useBlockedPhones();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);

  const [tab, setTab] = useState<Tab>('produto');
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);

  const canRunAnalysis = role === 'owner_admin';
  const periodError = validatePeriod(periodStart, periodEnd);
  const filtersReady = !!companyId && !periodError;

  const strategicRunQuery = useQuery<ProductIntelligenceRun | null>({
    queryKey: ['product-intelligence-run', companyId, periodStart, periodEnd],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('product_intelligence_runs')
        .select('id, company_id, requested_by_user_id, period_start, period_end, company_timezone, source, status, total_conversations, processed_count, analyzed_count, failed_count, report_json, report_markdown, prompt_version, model_used, error_message, created_at, started_at, finished_at, updated_at')
        .eq('company_id', companyId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('prompt_version', 'v1-product-market-intel')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as ProductIntelligenceRun | null) ?? null;
    },
    enabled: filtersReady,
    staleTime: 0,
    refetchInterval: (query) => {
      if (!filtersReady) return false;
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 8000 : false;
    },
  });

  const rawReportsQuery = useQuery<PIReport[]>({
    queryKey: ['product-intelligence', companyId, periodStart, periodEnd],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('product_intelligence_reports')
        .select('conversation_id, produto_citado, produto_interesse, produtos_comparados, motivo_interesse, dificuldade_entendimento, barreiras_produto, objecao_tratada, oportunidade_perdida')
        .eq('company_id', companyId)
        .gte('analyzed_at', `${periodStart}T00:00:00Z`)
        .lte('analyzed_at', `${periodEnd}T23:59:59Z`);

      if (error) throw error;
      return ((data ?? []) as PIReport[]).filter((report) => !isBlockedConversationId(report.conversation_id));
    },
    enabled: filtersReady,
    staleTime: 1000 * 60 * 5,
  });

  const agg = useMemo(() => {
    const rawReports = rawReportsQuery.data ?? [];
    const total = rawReports.length;
    if (total === 0) return null;

    const interestCounts = countOcc(rawReports.map((report) => report.produto_interesse));
    const topInterest = topN(interestCounts, 5);
    const highDiffReports = rawReports.filter((report) => report.dificuldade_entendimento === 'alto');
    const highDiffCounts = countOcc(highDiffReports.map((report) => report.produto_citado));
    const topHighDiff = topN(highDiffCounts, 4);
    const lostReports = rawReports.filter((report) => report.oportunidade_perdida === true);
    const lostCounts = countOcc(lostReports.map((report) => report.produto_citado));
    const topLost = topN(lostCounts, 4);

    const productStats: Record<string, { total: number; lost: number }> = {};
    rawReports.forEach((report) => {
      const product = report.produto_citado ?? report.produto_interesse;
      if (!product) return;
      if (!productStats[product]) productStats[product] = { total: 0, lost: 0 };
      productStats[product].total += 1;
      if (report.oportunidade_perdida) productStats[product].lost += 1;
    });

    const losingTraction = Object.entries(productStats)
      .filter(([, stats]) => stats.total >= 3 && stats.lost / stats.total > 0.4)
      .sort((a, b) => b[1].lost / b[1].total - a[1].lost / a[1].total)
      .slice(0, 3);

    const allBarriers = rawReports.flatMap((report) => report.barreiras_produto ?? []);
    const topBarriers = topN(countOcc(allBarriers), 5);
    const reasonByProduct: Record<string, string> = {};

    rawReports.forEach((report) => {
      const product = report.produto_citado ?? report.produto_interesse;
      if (product && report.motivo_interesse && !reasonByProduct[product]) {
        reasonByProduct[product] = report.motivo_interesse;
      }
    });

    return {
      total,
      topInterest,
      topHighDiff,
      topLost,
      losingTraction,
      topBarriers,
      reasonByProduct,
      highDiffTotal: highDiffReports.length,
      lostTotal: lostReports.length,
    };
  }, [rawReportsQuery.data]);

  const redirectToLogin = (message?: string) => {
    toast.error(message || 'Sessao expirada. Faca login novamente.');
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
  };

  const startAnalysisMutation = useMutation<StartResponse, Error>({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      return invokeRunProductIntelligence<StartResponse>({
        action: 'start',
        company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        force_refresh: !!strategicRunQuery.data,
      });
    },
    onSuccess: async (result) => {
      toast.success(result.reused ? 'Leitura estrategica reaproveitada.' : 'Analise estrategica iniciada.');
      await queryClient.invalidateQueries({ queryKey: ['product-intelligence-run', companyId, periodStart, periodEnd] });
    },
    onError: (error) => {
      if (error.message.toLowerCase().includes('sessao expirada')) {
        redirectToLogin(error.message);
        return;
      }
      toast.error(error.message);
    },
  });

  const strategicRun = strategicRunQuery.data;
  const strategicReport = strategicRun?.report_json ?? null;
  const analyzeButtonLabel = startAnalysisMutation.isPending
    ? 'Iniciando...'
    : strategicRun?.status === 'queued' || strategicRun?.status === 'running'
      ? 'Analisando...'
      : strategicRun
        ? 'Reanalisar'
        : 'Analisar';

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'produto', label: 'Produto' },
    { id: 'objecoes', label: 'Objecoes' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inteligencia de Produto</h1>
            <p className="text-sm text-muted-foreground">Tudo o que o mercado esta dizendo sobre seu produto nas conversas.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">IA</span>
        </div>
      </div>

      <div className="rounded-[28px] border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Brain className="h-3.5 w-3.5" />
              Agente estrategico de produto
            </div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">Rodar leitura completa do periodo</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              O agente vai ler as conversas do periodo inteiro para mostrar o que gera interesse, o que trava venda,
              o que confunde o cliente e quais decisoes o dono precisa tomar primeiro.
            </p>
            {strategicRun?.finished_at && <p className="text-xs text-muted-foreground">Ultima analise concluida em {formatDateTime(strategicRun.finished_at)}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data inicial</label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-2xl border border-border bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data final</label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-2xl border border-border bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" />
              </div>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-2">
              <Button type="button" onClick={() => startAnalysisMutation.mutate()} disabled={!canRunAnalysis || !!periodError || startAnalysisMutation.isPending || strategicRun?.status === 'queued' || strategicRun?.status === 'running'} className="h-11 rounded-2xl text-sm font-semibold">
                {strategicRun?.status === 'queued' || strategicRun?.status === 'running' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                {analyzeButtonLabel}
              </Button>
              {!canRunAnalysis && <p className="text-xs text-muted-foreground">Somente owner_admin pode disparar essa analise no momento.</p>}
              {periodError && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600">{periodError}</p>}
            </div>
          </div>
        </div>
      </div>

      <ProductIntelligenceStrategicPanel run={strategicRun ?? null} report={strategicReport} isLoading={strategicRunQuery.isLoading} />

      <div className="grid gap-3 md:grid-cols-3">
        <Link to="/playbooks" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-colors hover:border-primary/40 hover:bg-primary/10">
          <p className="text-sm font-semibold text-foreground">Ajustar playbook por produto</p>
          <p className="mt-1 text-xs text-muted-foreground">Transforme barreiras e objecoes recorrentes em respostas mais fortes para o time.</p>
        </Link>
        <Link to="/conversations" className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
          <p className="text-sm font-semibold text-foreground">Revisar conversas criticas</p>
          <p className="mt-1 text-xs text-muted-foreground">Abra as conversas que estao por tras dos sinais mais importantes da leitura estrategica.</p>
        </Link>
        <Link to="/revenue-insights" className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
          <p className="text-sm font-semibold text-foreground">Cruzar com receita</p>
          <p className="mt-1 text-xs text-muted-foreground">Valide o que esta travando valor, conversao e margem ao mesmo tempo.</p>
        </Link>
      </div>

      <div className="space-y-4 rounded-[28px] border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Leitura complementar por conversa</h2>
            <p className="text-sm text-muted-foreground">Apoio tatico a partir das extrações de produto ja existentes.</p>
          </div>
          <div className="flex gap-1 rounded-2xl border border-border bg-muted/40 p-1">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn('rounded-xl px-4 py-1.5 text-sm font-medium transition-all', tab === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {rawReportsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !agg ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <BarChart2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-semibold text-foreground">Nenhum apoio complementar carregado</h3>
            <p className="mt-2 text-sm text-muted-foreground">A leitura estrategica acima pode existir mesmo sem estas extrações auxiliares por conversa.</p>
          </div>
        ) : (
          <>
            {tab === 'produto' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <MetricCard label="Produto mais buscado" value={agg.topInterest[0]?.[0] ?? '—'} icon={Flame} sub={agg.topInterest[0] ? `${pct(agg.topInterest[0][1], agg.total)}% das conversas` : undefined} accent />
                  <MetricCard label="Produto com mais duvidas" value={agg.topHighDiff[0]?.[0] ?? '—'} icon={HelpCircle} sub={agg.highDiffTotal > 0 ? `${pct(agg.highDiffTotal, agg.total)}% com dificuldade alta` : undefined} />
                  <MetricCard label="Mais oportunidades perdidas" value={agg.topLost[0]?.[0] ?? '—'} icon={ThumbsDown} sub={agg.lostTotal > 0 ? `${pct(agg.lostTotal, agg.total)}% das conversas` : undefined} />
                  <MetricCard label="Conversas analisadas" value={String(agg.total)} icon={TrendingUp} sub="apoio complementar do periodo" />
                </div>

                {agg.topInterest.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <SectionHeader icon={Flame} title="Produtos mais buscados" sub="por presenca nas conversas" />
                    <div className="space-y-2">
                      {agg.topInterest.map(([name, count], index) => (
                        <ProductRankRow key={name} rank={index + 1} name={name} percentage={pct(count, agg.total)} badge={index === 0 ? 'mais buscado' : undefined} />
                      ))}
                    </div>
                  </div>
                )}

                {agg.topHighDiff.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <SectionHeader icon={HelpCircle} title="Produtos com mais duvidas" sub="dificuldade de entendimento alta" />
                    <div className="space-y-2">
                      {agg.topHighDiff.map(([product, count]) => (
                        <ProductIssueItem key={product} product={product} issue={agg.reasonByProduct[product] ?? 'Dificuldade de entendimento identificada'} percentage={pct(count, agg.total)} icon={HelpCircle} iconClassName="bg-blue-100 text-blue-600" />
                      ))}
                    </div>
                  </div>
                )}

                {agg.topLost.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <SectionHeader icon={ThumbsDown} title="Produtos com mais objecoes" sub="oportunidades perdidas por produto" />
                    <div className="space-y-2">
                      {agg.topLost.map(([product, count]) => (
                        <ProductIssueItem key={product} product={product} issue="Objecao nao tratada e oportunidade perdida" percentage={pct(count, agg.total)} icon={ThumbsDown} iconClassName="bg-rose-100 text-rose-600" />
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={Activity} title="Produtos que mais perdem tracao" sub="taxa de perda acima de 40%" />
                  {agg.losingTraction.length > 0 ? (
                    <div className="space-y-2">
                      {agg.losingTraction.map(([product, stats]) => (
                        <ProductIssueItem key={product} product={product} issue={`${Math.round((stats.lost / stats.total) * 100)}% das conversas resultam em perda`} percentage={pct(stats.lost, stats.total)} icon={TrendingDown} iconClassName="bg-amber-100 text-amber-600" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum produto com queda significativa neste periodo.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={Brain} title="Padroes identificados" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {agg.topInterest[0] && <PatternTag text={`${agg.topInterest[0][0]} e o produto mais buscado neste recorte.`} tone="rose" />}
                    {agg.highDiffTotal > 0 && <PatternTag text={`${pct(agg.highDiffTotal, agg.total)}% das conversas mostram dificuldade alta de entendimento.`} tone="violet" />}
                    {agg.lostTotal > 0 && <PatternTag text={`${pct(agg.lostTotal, agg.total)}% das conversas viraram oportunidade perdida.`} tone="amber" />}
                    {agg.topBarriers[0] && <PatternTag text={`Barreira mais comum: "${agg.topBarriers[0][0]}".`} tone="blue" />}
                  </div>
                </div>
              </div>
            )}

            {tab === 'objecoes' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  <MetricCard label="Objecao mais frequente" value={agg.topBarriers[0]?.[0] ?? '—'} icon={ThumbsDown} sub={agg.topBarriers[0] ? `${pct(agg.topBarriers[0][1], agg.total)}% das conversas` : undefined} accent />
                  <MetricCard label="Oportunidades perdidas" value={`${pct(agg.lostTotal, agg.total)}%`} icon={TrendingDown} sub={`${agg.lostTotal} de ${agg.total} conversas`} />
                  <MetricCard label="Conversas analisadas" value={String(agg.total)} icon={Activity} sub="apoio complementar do periodo" />
                </div>

                {agg.topBarriers.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <SectionHeader icon={ThumbsDown} title="Principais barreiras de produto" sub="identificadas nas extrações por conversa" />
                    <div className="space-y-3">
                      {agg.topBarriers.map(([text, count]) => (
                        <ObjectionCard key={text} text={text} percentage={pct(count, agg.total)} count={count} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    Nenhuma barreira consolidada nas extrações complementares.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
