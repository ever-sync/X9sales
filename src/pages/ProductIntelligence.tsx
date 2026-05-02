import { useMemo, useState, type ElementType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart2,
  Brain,
  CalendarRange,
  DollarSign,
  Loader2,
  Package,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime } from '../lib/utils';
import { useCompany } from '../contexts/CompanyContext';
import { env } from '../config/env';
import { supabase, clearStoredSupabaseSession, isInvalidRefreshTokenError } from '../integrations/supabase/client';
import { ProductIntelligenceStrategicPanel } from '../components/reports/ProductIntelligenceStrategicPanel';
import { IntelligenceTabs } from '../components/layout/IntelligenceTabs';
import { Button } from '../components/ui/button';
import type { ProductIntelligenceRun, ProductIntelligenceStrategicReport } from '../types';

type Tab = 'produto' | 'objecoes';

interface StartResponse {
  success: boolean;
  reused: boolean;
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_conversations: number;
  prompt_version?: string;
  error?: string;
}

interface ProductSignal {
  conversation_id: string;
  product_id: string | null;
  product_name_normalized: string;
  is_traffic_driver: boolean;
  mention_source: string | null;
  agent_offered: boolean;
  offer_outcome: string | null;
  price_objection: boolean;
  price_objection_type: string | null;
  price_anchor: string | null;
  value_questions: string[];
  value_understood: boolean | null;
  value_gap: string | null;
  value_arguments_used: string[];
  conversion_signal: string | null;
  loss_reason: string | null;
  sentiment_score: number | null;
}

interface ProductStats {
  name: string;
  total: number;
  trafficCount: number;
  clientInitiatedCount: number;
  agentOfferedCount: number;
  priceObjectionCount: number;
  priceBlockingCount: number;
  convertedCount: number;
  lostCount: number;
  lostByPrice: number;
  valueUnderstoodCount: number;
  valueUnderstoodTotal: number;
  topValueGaps: string[];
  topArguments: string[];
  avgSentiment: number | null;
}

const MOCK_STRATEGIC_REPORT: ProductIntelligenceStrategicReport = {
  resumo_executivo:
    'O mercado demonstra interesse no Plano Premium, mas a conversao cai quando o valor percebido nao e conectado ao ROI em ate 30 dias. A principal alavanca agora e simplificar posicionamento e prova de resultado.',
  percepcao_geral_produto: {
    clareza: 'Media: clientes entendem o problema, mas confundem diferencas entre planos.',
    valor_percebido: 'Alto quando ha simulacao de retorno; baixo quando a conversa fica tecnica.',
    interesse_gerado: 'Consistente em operacoes com time comercial estruturado.',
    principal_risco: 'Perda de deals por objecao de preco sem contextualizacao de valor.',
    principal_oportunidade: 'Padronizar demo com casos de ROI por segmento.',
  },
  clientes_buscam: [
    {
      title: 'Automacao de follow-up',
      summary: 'Recorrente em empresas que querem aumentar conversao sem contratar mais vendedores.',
      frequency: 14,
      impact: 'Pode elevar produtividade e taxa de fechamento no curto prazo.',
      urgency: 'alta',
      severity: 'high',
      likely_cause: 'produto',
      evidence_conversation_ids: ['mock-conv-001', 'mock-conv-005'],
    },
  ],
  principais_dores: [
    {
      title: 'Baixa previsibilidade de pipeline',
      summary: 'Lideres relatam dificuldade para priorizar oportunidades quentes.',
      frequency: 11,
      impact: 'Atraso de decisoes comerciais e perda de timing.',
      urgency: 'alta',
      severity: 'high',
      likely_cause: 'expectativa',
      evidence_conversation_ids: ['mock-conv-002'],
    },
  ],
  duvidas_frequentes: [
    {
      title: 'Diferenca entre Basico, Pro e Premium',
      summary: 'Duvida aparece mesmo em leads qualificados.',
      frequency: 10,
      impact: 'Aumenta ciclo comercial e gera comparacao por preco.',
      urgency: 'media',
      severity: 'medium',
      likely_cause: 'comunicacao',
      evidence_conversation_ids: ['mock-conv-001', 'mock-conv-003'],
    },
  ],
  objecoes_frequentes: [
    {
      title: 'Preco alto para o momento',
      summary: 'Objecao surge quando nao existe simulacao do custo de inacao.',
      frequency: 9,
      impact: 'Aumenta perdas no fundo do funil.',
      urgency: 'alta',
      severity: 'critical',
      likely_cause: 'preco',
      evidence_conversation_ids: ['mock-conv-001', 'mock-conv-005'],
    },
  ],
  valor_percebido: [
    {
      title: 'ROI rapido quando bem implantado',
      summary: 'Clientes que entendem onboarding reportam ganho percebido imediato.',
      frequency: 7,
      impact: 'Favorece expansao e upsell.',
      urgency: 'media',
      severity: 'medium',
      likely_cause: 'oferta',
      evidence_conversation_ids: ['mock-conv-004'],
    },
  ],
  pontos_de_confusao: [
    {
      title: 'Escopo da implantacao',
      summary: 'Nao fica claro o que esta incluso no servico inicial.',
      frequency: 6,
      impact: 'Gera inseguranca na tomada de decisao.',
      urgency: 'media',
      severity: 'medium',
      likely_cause: 'oferta',
      evidence_conversation_ids: ['mock-conv-003'],
    },
  ],
  melhorias_de_produto: [
    {
      title: 'Checklist guiado de onboarding',
      summary: 'Facilita ativacao nas primeiras duas semanas.',
      frequency: 5,
      impact: 'Reduz abandono inicial e tickets repetitivos.',
      urgency: 'media',
      severity: 'low',
      likely_cause: 'produto',
      evidence_conversation_ids: ['mock-conv-006'],
    },
  ],
  melhorias_de_oferta_e_comunicacao: [
    {
      title: 'Reposicionar Premium por resultado',
      summary: 'Trocar discurso de funcionalidades por metas de negocio.',
      frequency: 8,
      impact: 'Aumenta taxa de ganho em deals com objecao de preco.',
      urgency: 'alta',
      severity: 'high',
      likely_cause: 'posicionamento',
      evidence_conversation_ids: ['mock-conv-001', 'mock-conv-005'],
    },
  ],
  perfis_de_cliente: [
    {
      profile: 'Gestor Comercial Estruturado',
      what_they_seek: 'Escala operacional sem perder controle de funil.',
      main_blockers: 'Receio de migracao e curva de aprendizagem da equipe.',
      best_approach: 'Demo com playbook pronto e plano de implantacao em 15 dias.',
      frequency: 12,
    },
  ],
  sinais_estrategicos: [
    {
      title: 'Oferta vence quando demonstra impacto financeiro',
      summary: 'Conversas com simulacao de ROI convertem melhor.',
      frequency: 9,
      impact: 'Indica necessidade de material comercial orientado a valor.',
      urgency: 'alta',
      severity: 'high',
      likely_cause: 'comunicacao',
      evidence_conversation_ids: ['mock-conv-002', 'mock-conv-004'],
    },
  ],
  top_5_decisoes_recomendadas: [
    {
      title: 'Criar roteiro unico de comparacao entre planos',
      why_now: 'Duvida de posicionamento esta presente no topo das conversas.',
      expected_impact: 'Reducao de friccao e ciclo de venda mais curto.',
      urgency: 'alta',
      evidence_conversation_ids: ['mock-conv-001'],
    },
    {
      title: 'Adicionar calculadora de ROI na etapa de proposta',
      why_now: 'Objecao de preco continua derrubando deals quentes.',
      expected_impact: 'Aumento da taxa de fechamento no Premium.',
      urgency: 'alta',
      evidence_conversation_ids: ['mock-conv-005'],
    },
    {
      title: 'Padronizar narrativa de onboarding',
      why_now: 'Escopo da implantacao gera inseguranca no fechamento.',
      expected_impact: 'Menos perda por risco percebido.',
      urgency: 'media',
      evidence_conversation_ids: ['mock-conv-003'],
    },
    {
      title: 'Treinar time para conduzir objecoes de valor',
      why_now: 'Objecoes sao tratadas de forma reativa e sem prova concreta.',
      expected_impact: 'Melhora da conversao em propostas avancadas.',
      urgency: 'media',
      evidence_conversation_ids: ['mock-conv-002'],
    },
    {
      title: 'Segmentar discurso por maturidade comercial',
      why_now: 'Perfis distintos recebem o mesmo argumento de venda.',
      expected_impact: 'Maior aderencia de mensagem e ganho de relevancia.',
      urgency: 'media',
      evidence_conversation_ids: ['mock-conv-006'],
    },
  ],
  totals: {
    conversations_considered: 42,
    analyzed_conversations: 36,
    evidence_items: 28,
  },
};

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

export default function ProductIntelligence() {
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);

  const [tab, setTab] = useState<Tab>('produto');
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const isLocalhostPreview = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isDemoCompany = !!companyId && (!env.VITE_DEMO_COMPANY_ID || env.VITE_DEMO_COMPANY_ID === companyId);
  const shouldUseDemoData = isLocalhostPreview || (env.VITE_ENABLE_DEMO_DATA && isDemoCompany);

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

  type SignalsTab = 'overview' | 'traffic' | 'offer' | 'price' | 'value';
  const [signalsTab, setSignalsTab] = useState<SignalsTab>('overview');

  const signalsQuery = useQuery<ProductSignal[]>({
    queryKey: ['product-signals', companyId, periodStart, periodEnd],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('product_signals')
        .select('conversation_id, product_id, product_name_normalized, is_traffic_driver, mention_source, agent_offered, offer_outcome, price_objection, price_objection_type, price_anchor, value_questions, value_understood, value_gap, value_arguments_used, conversion_signal, loss_reason, sentiment_score')
        .eq('company_id', companyId)
        .gte('analyzed_at', `${periodStart}T00:00:00Z`)
        .lte('analyzed_at', `${periodEnd}T23:59:59Z`);
      if (error) throw error;
      return (data ?? []) as ProductSignal[];
    },
    enabled: filtersReady,
    staleTime: 1000 * 60 * 5,
  });

  const productStats = useMemo((): ProductStats[] => {
    const signals = signalsQuery.data ?? [];
    if (signals.length === 0) return [];

    const map = new Map<string, ProductStats>();

    for (const s of signals) {
      const name = s.product_name_normalized || 'Produto desconhecido';
      if (!map.has(name)) {
        map.set(name, {
          name,
          total: 0,
          trafficCount: 0,
          clientInitiatedCount: 0,
          agentOfferedCount: 0,
          priceObjectionCount: 0,
          priceBlockingCount: 0,
          convertedCount: 0,
          lostCount: 0,
          lostByPrice: 0,
          valueUnderstoodCount: 0,
          valueUnderstoodTotal: 0,
          topValueGaps: [],
          topArguments: [],
          avgSentiment: null,
        });
      }
      const p = map.get(name)!;
      p.total++;
      if (s.is_traffic_driver) p.trafficCount++;
      if (s.mention_source === 'cliente_iniciou') p.clientInitiatedCount++;
      if (s.agent_offered) p.agentOfferedCount++;
      if (s.price_objection) p.priceObjectionCount++;
      if (s.price_objection_type === 'bloqueante') p.priceBlockingCount++;
      if (s.conversion_signal === 'converteu') p.convertedCount++;
      if (s.conversion_signal === 'perdeu') p.lostCount++;
      if (s.loss_reason === 'preco') p.lostByPrice++;
      if (s.value_understood !== null) {
        p.valueUnderstoodTotal++;
        if (s.value_understood) p.valueUnderstoodCount++;
      }
      if (s.value_gap) p.topValueGaps.push(s.value_gap);
      if (s.value_arguments_used) p.topArguments.push(...s.value_arguments_used);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [signalsQuery.data]);

  const strategicRun = strategicRunQuery.data;
  const strategicReport = strategicRun?.report_json ?? (shouldUseDemoData ? MOCK_STRATEGIC_REPORT : null);
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

      <IntelligenceTabs />

      <div className="rounded-[22px] border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visao complementar</p>
            <h2 className="text-sm font-semibold text-foreground">Abas de Produto</h2>
          </div>
          <div className="flex gap-1 rounded-2xl border border-border bg-muted/40 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'rounded-xl px-4 py-1.5 text-sm font-medium transition-all',
                  tab === item.id ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
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

      <ProductIntelligenceStrategicPanel run={strategicRun ?? null} report={strategicReport} isLoading={shouldUseDemoData ? false : strategicRunQuery.isLoading} />

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
        {/* Header + tab selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Inteligencia de Produto por Produto</h2>
            <p className="text-sm text-muted-foreground">Dados extraidos e normalizados pelo catalogo de produtos.</p>
          </div>
          <div className="flex gap-1 rounded-2xl border border-border bg-muted/40 p-1">
            {(
              [
                { id: 'overview', label: 'Visao Geral' },
                { id: 'traffic', label: 'Trafego' },
                { id: 'offer', label: 'Oferta' },
                { id: 'price', label: 'Preco' },
                { id: 'value', label: 'Valor' },
              ] as Array<{ id: SignalsTab; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSignalsTab(item.id)}
                className={cn(
                  'rounded-xl px-4 py-1.5 text-sm font-medium transition-all',
                  signalsTab === item.id
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {signalsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : productStats.length === 0 ? (
          /* Empty state */
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <BarChart2 className="mx-auto h-9 w-9 text-muted-foreground" />
            <h3 className="mt-3 text-base font-semibold text-foreground">Nenhum sinal de produto encontrado</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Os sinais de produto sao preenchidos ao rodar o relatorio de inteligencia com um catalogo de produtos configurado.
              Execute a analise estrategica acima para popular estes dados.
            </p>
          </div>
        ) : (
          <>
            {/* ── TAB: VISAO GERAL ── */}
            {signalsTab === 'overview' && (
              <div className="space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <MetricCard
                    label="Produtos identificados"
                    value={String(productStats.length)}
                    icon={Package}
                    sub="no catalogo normalizado"
                  />
                  <MetricCard
                    label="Maior trafego"
                    value={
                      productStats.reduce((best, p) => (p.trafficCount > best.trafficCount ? p : best), productStats[0]).name
                    }
                    icon={Users}
                    sub={`${productStats.reduce((best, p) => (p.trafficCount > best.trafficCount ? p : best), productStats[0]).trafficCount} mencoes como driver`}
                    accent
                  />
                  <MetricCard
                    label="Maior pressao de preco"
                    value={
                      productStats.reduce((best, p) => (p.priceObjectionCount > best.priceObjectionCount ? p : best), productStats[0]).name
                    }
                    icon={DollarSign}
                    sub={(() => {
                      const worst = productStats.reduce((best, p) => (p.priceObjectionCount > best.priceObjectionCount ? p : best), productStats[0]);
                      return `${pct(worst.priceObjectionCount, worst.total)}% de objecao`;
                    })()}
                  />
                  <MetricCard
                    label="Melhor conversao"
                    value={(() => {
                      const best = productStats
                        .filter((p) => p.convertedCount + p.lostCount > 0)
                        .reduce(
                          (b, p) =>
                            p.convertedCount / (p.convertedCount + p.lostCount) >
                            b.convertedCount / (b.convertedCount + b.lostCount)
                              ? p
                              : b,
                          productStats.find((p) => p.convertedCount + p.lostCount > 0) ?? productStats[0],
                        );
                      return best.name;
                    })()}
                    icon={TrendingUp}
                    sub={(() => {
                      const best = productStats
                        .filter((p) => p.convertedCount + p.lostCount > 0)
                        .reduce(
                          (b, p) =>
                            p.convertedCount / (p.convertedCount + p.lostCount) >
                            b.convertedCount / (b.convertedCount + b.lostCount)
                              ? p
                              : b,
                          productStats.find((p) => p.convertedCount + p.lostCount > 0) ?? productStats[0],
                        );
                      const total = best.convertedCount + best.lostCount;
                      return total > 0 ? `${pct(best.convertedCount, total)}% taxa de conversao` : 'sem dados de resultado';
                    })()}
                  />
                </div>

                {/* Portfolio matrix */}
                <div className="rounded-2xl border border-border bg-card p-5">
                  <SectionHeader icon={Star} title="Matriz de portfolio" sub="trafego × conversao" />
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { label: '⭐ Estrela', highTraffic: true, highConv: true, bgCls: 'bg-primary/5 border-primary/20', textCls: 'text-primary' },
                        { label: '💎 Joia Oculta', highTraffic: false, highConv: true, bgCls: 'bg-violet-50 border-violet-200', textCls: 'text-violet-800' },
                        { label: '🔧 Oportunidade', highTraffic: true, highConv: false, bgCls: 'bg-amber-50 border-amber-200', textCls: 'text-amber-800' },
                        { label: '⚠️ Revisar', highTraffic: false, highConv: false, bgCls: 'bg-rose-50 border-rose-200', textCls: 'text-rose-800' },
                      ] as const
                    ).map((quadrant) => {
                      const products = productStats.filter((p) => {
                        const trafficRate = p.trafficCount / p.total;
                        const convTotal = p.convertedCount + p.lostCount;
                        const convRate = convTotal > 0 ? p.convertedCount / convTotal : 0;
                        const isHighTraffic = trafficRate > 0.5;
                        const isHighConv = convRate > 0.4;
                        return isHighTraffic === quadrant.highTraffic && isHighConv === quadrant.highConv;
                      });
                      return (
                        <div key={quadrant.label} className={cn('rounded-xl border p-4', quadrant.bgCls)}>
                          <p className={cn('mb-2 text-xs font-semibold', quadrant.textCls)}>{quadrant.label}</p>
                          {products.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhum produto</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {products.map((p) => (
                                <span
                                  key={p.name}
                                  className={cn('rounded-lg border px-2 py-0.5 text-xs font-medium', quadrant.bgCls, quadrant.textCls)}
                                >
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: TRAFEGO ── */}
            {signalsTab === 'traffic' && (
              <div className="space-y-4">
                {(() => {
                  const sorted = [...productStats].sort((a, b) => b.trafficCount - a.trafficCount);
                  const opportunityGap = sorted.find((p) => {
                    const hasOutcome = p.convertedCount + p.lostCount > 0;
                    const highTraffic = p.trafficCount / p.total > 0.4;
                    const lowConv = hasOutcome && p.convertedCount / (p.convertedCount + p.lostCount) < 0.3;
                    return highTraffic && lowConv;
                  });
                  return (
                    <>
                      {opportunityGap && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          <span className="font-semibold">Gap de oportunidade: </span>
                          <span>
                            {opportunityGap.name} gera muito trafego ({pct(opportunityGap.trafficCount, opportunityGap.total)}%) mas converte pouco (
                            {pct(opportunityGap.convertedCount, opportunityGap.convertedCount + opportunityGap.lostCount)}%). Revise o processo de oferta.
                          </span>
                        </div>
                      )}
                      <div className="overflow-auto rounded-2xl border border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40">
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produto</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total mencoes</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">% Trafego</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taxa conversao</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sentimento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((p, i) => {
                              const convTotal = p.convertedCount + p.lostCount;
                              const convRate = convTotal > 0 ? pct(p.convertedCount, convTotal) : null;
                              return (
                                <tr key={p.name} className={cn('border-b border-border last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-muted/20')}>
                                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">{p.total}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={cn('font-semibold', p.trafficCount / p.total > 0.5 ? 'text-primary' : 'text-foreground')}>
                                      {pct(p.trafficCount, p.total)}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {convRate !== null ? (
                                      <span className={cn('font-semibold', convRate >= 50 ? 'text-green-600' : convRate >= 30 ? 'text-amber-600' : 'text-rose-600')}>
                                        {convRate}%
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">
                                    {p.avgSentiment !== null ? p.avgSentiment.toFixed(1) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: OFERTA ── */}
            {signalsTab === 'offer' && (
              <div className="space-y-3">
                {[...productStats]
                  .map((p) => ({
                    ...p,
                    clientPct: pct(p.clientInitiatedCount, p.total),
                    agentPct: pct(p.agentOfferedCount, p.total),
                    gap: pct(p.clientInitiatedCount, p.total) - pct(p.agentOfferedCount, p.total),
                  }))
                  .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
                  .map((p) => (
                    <div key={p.name} className="rounded-2xl border border-border bg-card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        {Math.abs(p.gap) > 15 && (
                          <span className={cn('rounded-lg px-2 py-0.5 text-xs font-semibold', p.gap > 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                            {p.gap > 0 ? `⚠️ Gap +${p.gap}%` : `Gap ${p.gap}%`}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Cliente pediu</span>
                            <span className="font-medium text-foreground">{p.clientPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${p.clientPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Agente ofereceu</span>
                            <span className="font-medium text-foreground">{p.agentPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-violet-400" style={{ width: `${p.agentPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ── TAB: PRECO ── */}
            {signalsTab === 'price' && (
              <div className="space-y-3">
                {[...productStats].sort((a, b) => b.priceObjectionCount - a.priceObjectionCount).map((p) => {
                  const objPct = pct(p.priceObjectionCount, p.total);
                  const blockPct = p.priceObjectionCount > 0 ? pct(p.priceBlockingCount, p.priceObjectionCount) : 0;
                  return (
                    <div key={p.name} className="rounded-2xl border border-border bg-card p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <div className="flex gap-2">
                          {p.lostByPrice > 0 && (
                            <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                              {p.lostByPrice} perda{p.lostByPrice !== 1 ? 's' : ''} por preco
                            </span>
                          )}
                          {p.priceBlockingCount > 0 && (
                            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {blockPct}% bloqueante
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Objecao de preco</span>
                          <span className="font-medium text-foreground">{objPct}%</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', objPct >= 40 ? 'bg-rose-500' : objPct >= 20 ? 'bg-amber-400' : 'bg-green-400')}
                            style={{ width: `${objPct}%` }}
                          />
                        </div>
                        {p.priceObjectionCount > 0 && (
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-rose-700/60" style={{ width: `${blockPct}%` }} />
                          </div>
                        )}
                        {p.priceObjectionCount > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.priceObjectionCount} mencoes — {blockPct}% classificadas como bloqueantes
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TAB: VALOR ── */}
            {signalsTab === 'value' && (
              <div className="space-y-3">
                {[...productStats]
                  .sort((a, b) => {
                    const rateA = a.valueUnderstoodTotal > 0 ? a.valueUnderstoodCount / a.valueUnderstoodTotal : 1;
                    const rateB = b.valueUnderstoodTotal > 0 ? b.valueUnderstoodCount / b.valueUnderstoodTotal : 1;
                    return rateA - rateB;
                  })
                  .map((p) => {
                    const understoodRate = p.valueUnderstoodTotal > 0 ? pct(p.valueUnderstoodCount, p.valueUnderstoodTotal) : null;
                    const gapCounts = countOcc(p.topValueGaps);
                    const argCounts = countOcc(p.topArguments);
                    const top3Gaps = topN(gapCounts, 3);
                    const top3Args = topN(argCounts, 3);
                    return (
                      <div key={p.name} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{p.name}</p>
                          {understoodRate !== null && (
                            <span
                              className={cn(
                                'rounded-lg px-2 py-0.5 text-xs font-semibold',
                                understoodRate >= 70 ? 'bg-green-100 text-green-700' : understoodRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700',
                              )}
                            >
                              {understoodRate}% valor compreendido
                            </span>
                          )}
                        </div>
                        {understoodRate !== null && (
                          <div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  understoodRate >= 70 ? 'bg-green-500' : understoodRate >= 40 ? 'bg-amber-400' : 'bg-rose-500',
                                )}
                                style={{ width: `${understoodRate}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {top3Gaps.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Principais gaps de valor</p>
                              <div className="space-y-1">
                                {top3Gaps.map(([gap, count]) => (
                                  <div key={gap} className="flex items-start justify-between gap-2 text-xs">
                                    <span className="text-foreground leading-snug">{gap}</span>
                                    <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 font-medium">{count}×</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {top3Args.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Argumentos mais usados</p>
                              <div className="space-y-1">
                                {top3Args.map(([arg, count]) => (
                                  <div key={arg} className="flex items-start justify-between gap-2 text-xs">
                                    <span className="text-foreground leading-snug">{arg}</span>
                                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">{count}×</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
