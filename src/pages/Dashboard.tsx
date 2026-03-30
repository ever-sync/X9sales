import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  ChevronDown,
  Sparkles,
  ShoppingBag,
  ListTodo,
  Trophy,
  Target,
  TrendingUp,
  Medal,
} from 'lucide-react';
import { useDashboardOverview } from '../hooks/useDashboardMetrics';
import { filterBlockedItems, useBlockedPhones } from '../hooks/useBlockedPhones';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { formatCurrency, formatPercent } from '../lib/utils';
import { downloadCsv } from '../lib/export';
import type { AIConversationAnalysis } from '../types';
import { SetupChecklist } from '../components/onboarding/SetupChecklist';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

type AuditPreview = Partial<AIConversationAnalysis> & {
  id: string;
  conversation_id: string;
  analyzed_at: string;
  quality_score: number | null;
  training_tags: string[] | null;
  needs_coaching: boolean;
  agent?: { name?: string | null; avatar_url?: string | null } | null;
  conversation?: {
    channel?: string | null;
    customer?: { name?: string | null; phone?: string | null } | null;
  } | null;
};

type CustomerLeadMessage = {
  started_at: string;
  customer_id: string | null;
  customer?: { phone?: string | null } | null;
};

type AgentSlaMetric = {
  sla_first_response_met?: boolean | null;
  first_response_time_sec?: number | null;
  agent?: { id?: string | null; name?: string | null } | null;
};

type AgentScoreMetric = {
  conversation_id?: string | null;
  quality_score?: number | null;
  agent?: { id?: string | null; name?: string | null; avatar_url?: string | null } | null;
};

type SalesDashboardRow = {
  id: string;
  sold_at: string;
  quantity: number;
  margin_amount: number;
  store_name: string;
  seller?: { id?: string | null; name?: string | null } | null;
};

const COLORS = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  lime: '#DCFE1B',
  purple: '#5953FB',
  text: '#191919',
  soft: '#6B7280',
  line: '#E9E9E7',
  mint: '#E8FFD1',
  coral: '#FFE8E8',
};

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return 'AT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function localDateKey(timezone?: string | null) {
  const format = (timeZone?: string) =>
    new Intl.DateTimeFormat('sv-SE', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

  if (!timezone) return format();
  try {
    return format(timezone);
  } catch {
    return format();
  }
}

function formatDateKey(date: Date | string, timezone?: string | null) {
  const value = typeof date === 'string' ? new Date(date) : date;
  const format = (timeZone?: string) =>
    new Intl.DateTimeFormat('sv-SE', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);

  if (!timezone) return format();
  try {
    return format(timezone);
  } catch {
    return format();
  }
}


function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function DashboardCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[30px] border p-6 shadow-[0_12px_40px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.07)] ${className}`}
      style={{ background: COLORS.card, borderColor: COLORS.line }}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold tracking-[-0.02em] text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeroBadge({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'purple' | 'lime';
}) {
  const toneClass =
    tone === 'purple'
      ? 'bg-accent text-secondary'
      : tone === 'lime'
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-white/88 px-4 py-3 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-bold tracking-[-0.04em] text-foreground">{value}</span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${toneClass}`}>
          ao vivo
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { company, isLoading: companyLoading } = useCompany();
  const { blockedPhones, blockedConversationIds, isLoading: isLoadingBlockedPhones } = useBlockedPhones();
  const overviewQuery = useDashboardOverview();

  const businessTimezone = company?.settings?.timezone;

  const auditItemsQuery = useQuery<AuditPreview[]>({
    queryKey: ['dashboard-audit-preview', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('id, conversation_id, quality_score, training_tags, needs_coaching, analyzed_at, agent:agents(name, avatar_url), conversation:conversations(channel, customer:customers(name, phone))')
        .eq('company_id', company.id)
        .order('analyzed_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return ((data ?? []) as unknown[]).map((row: any) => ({
        ...row,
        agent: firstRelation(row.agent),
        conversation: (() => {
          const conversation = firstRelation(row.conversation);
          if (!conversation) return null;
          return {
            ...conversation,
            customer: firstRelation((conversation as any).customer),
          };
        })(),
      })) as AuditPreview[];
    },
    enabled: !!company?.id,
    staleTime: CACHE.STALE_TIME,
  });
  const { data: rawAuditItems = [] } = auditItemsQuery;

  const leadMessagesQuery = useQuery<CustomerLeadMessage[]>({
    queryKey: ['dashboard-lead-messages', company?.id, businessTimezone],
    queryFn: async () => {
      if (!company?.id) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from('conversations')
        .select('started_at, customer_id, customer:customers(phone)')
        .eq('company_id', company.id)
        .gte('started_at', since.toISOString());

      if (error) throw error;
      return ((data ?? []) as any[]).map((item) => ({
        ...item,
        customer: Array.isArray(item.customer) ? (item.customer[0] ?? null) : (item.customer ?? null),
      })) as CustomerLeadMessage[];
    },
    enabled: !!company?.id && !isLoadingBlockedPhones,
    staleTime: CACHE.STALE_TIME,
  });
  const { data: rawLeadMessages = [] } = leadMessagesQuery;

  const auditItems = useMemo(
    () => filterBlockedItems(rawAuditItems, (item) => item.conversation?.customer?.phone, blockedPhones),
    [blockedPhones, rawAuditItems],
  );

  const leadMessages = useMemo(
    () => filterBlockedItems(rawLeadMessages, (item) => item.customer?.phone, blockedPhones),
    [blockedPhones, rawLeadMessages],
  );

  const slaMetricsQuery = useQuery<AgentSlaMetric[]>({
    queryKey: ['dashboard-sla-metrics', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceKey = formatDateKey(since, businessTimezone);

      const { data, error } = await supabase
        .from('metrics_conversation')
        .select('sla_first_response_met, first_response_time_sec, agent:agents(id, name)')
        .eq('company_id', company.id)
        .gte('conversation_date', sinceKey)
        .not('first_response_time_sec', 'is', null)
        .not('agent_id', 'is', null);

      if (error) throw error;
      return (data ?? []) as unknown as AgentSlaMetric[];
    },
    enabled: !!company?.id,
    staleTime: CACHE.STALE_TIME,
  });
  const { data: slaMetrics = [] } = slaMetricsQuery;

  const scoreMetricsQuery = useQuery<AgentScoreMetric[]>({
    queryKey: ['dashboard-score-metrics', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('conversation_id, quality_score, agent:agents(id, name, avatar_url)')
        .eq('company_id', company.id)
        .gte('analyzed_at', since.toISOString())
        .not('quality_score', 'is', null)
        .not('agent_id', 'is', null);

      if (error) throw error;
      return ((data ?? []) as unknown as AgentScoreMetric[]).filter((item) => !blockedConversationIds.has(item.conversation_id ?? ''));
    },
    enabled: !!company?.id,
    staleTime: CACHE.STALE_TIME,
  });
  const { data: scoreMetrics = [] } = scoreMetricsQuery;

  const salesRecordsQuery = useQuery<SalesDashboardRow[]>({
    queryKey: ['dashboard-sales-records', company?.id, businessTimezone],
    queryFn: async () => {
      if (!company?.id) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from('sales_records')
        .select('id, sold_at, quantity, margin_amount, store_name, seller:agents(id, name)')
        .eq('company_id', company.id)
        .gte('sold_at', since.toISOString())
        .order('sold_at', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        seller: firstRelation(row.seller),
      })) as SalesDashboardRow[];
    },
    enabled: !!company?.id,
    staleTime: CACHE.STALE_TIME,
  });
  const { data: salesRecords = [] } = salesRecordsQuery;

  const leadTrendData = useMemo(() => {
    const perDay = new Map<string, Set<string>>();

    for (const item of leadMessages) {
      const customerId = item.customer_id;
      if (!customerId) continue;
      const dayKey = formatDateKey(item.started_at, businessTimezone);
      const current = perDay.get(dayKey) ?? new Set<string>();
      current.add(customerId);
      perDay.set(dayKey, current);
    }

    const output: Array<{ date: string; conversations: number; shortDate: string }> = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const dayKey = formatDateKey(day, businessTimezone);
      output.push({
        date: dayKey,
        conversations: perDay.get(dayKey)?.size ?? 0,
        shortDate: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(day),
      });
    }

    return output;
  }, [leadMessages, businessTimezone]);

  const trendData = leadTrendData;
  const recentTrend = trendData.slice(-7);
  const todayIso = localDateKey(businessTimezone);
  const leadsToday = trendData.find((item) => item.date === todayIso)?.conversations ?? 0;
  const leadsMonth = useMemo(() => {
    const uniqueCustomers = new Set<string>();
    for (const item of leadMessages) {
      if (item.customer_id) uniqueCustomers.add(item.customer_id);
    }
    return uniqueCustomers.size;
  }, [leadMessages]);
  
  const slaByAgent = useMemo(() => {
    const aggregates = new Map<string, { agent_id: string; agent_name: string; total: number; met: number }>();

    for (const row of slaMetrics) {
      const agent = firstRelation(row.agent);
      const agentId = agent?.id;
      const agentName = agent?.name;
      if (!agentId || !agentName) continue;

      const current = aggregates.get(agentId) ?? {
        agent_id: agentId,
        agent_name: agentName,
        total: 0,
        met: 0,
      };

      current.total += 1;
      if (row.sla_first_response_met) current.met += 1;
      aggregates.set(agentId, current);
    }

    return Array.from(aggregates.values())
      .map((item) => ({
        ...item,
        sla_pct: item.total > 0 ? (item.met / item.total) * 100 : 0,
      }))
      .sort((a, b) => b.sla_pct - a.sla_pct);
  }, [slaMetrics]);

  const teamSla = useMemo(() => {
    const total = slaByAgent.reduce((sum, item) => sum + item.total, 0);
    const met = slaByAgent.reduce((sum, item) => sum + item.met, 0);
    if (total === 0) return 0;
    return Math.max(0, Math.min(100, (met / total) * 100));
  }, [slaByAgent]);

  const scoreByAgent = useMemo(() => {
    const aggregates = new Map<string, {
      agent_id: string;
      agent_name: string;
      agent_avatar: string | null;
      total: number;
      score_sum: number;
    }>();

    for (const row of scoreMetrics) {
      const agent = firstRelation(row.agent);
      const agentId = agent?.id;
      const agentName = agent?.name;
      const qualityScore = row.quality_score;
      if (!agentId || !agentName || qualityScore == null) continue;

      const current = aggregates.get(agentId) ?? {
        agent_id: agentId,
        agent_name: agentName,
        agent_avatar: agent?.avatar_url ?? null,
        total: 0,
        score_sum: 0,
      };

      current.total += 1;
      current.score_sum += qualityScore;
      aggregates.set(agentId, current);
    }

    return Array.from(aggregates.values())
      .map((item) => ({
        ...item,
        avg_ai_quality_score: item.total > 0 ? item.score_sum / item.total : 0,
      }))
      .sort((a, b) => b.avg_ai_quality_score - a.avg_ai_quality_score);
  }, [scoreMetrics]);

  const scoreBoard = scoreByAgent;

  const tagFrequency = useMemo(() => {
    const frequency = new Map<string, number>();

    for (const item of auditItems) {
      for (const tag of item.training_tags ?? []) {
        const normalized = tag.trim();
        if (!normalized) continue;
        frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
      }
    }

    return Array.from(frequency.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [auditItems]);

  const pieData = [
    { name: 'Base', value: 100, color: COLORS.purple },
    { name: 'Equipe', value: teamSla, color: COLORS.lime },
  ];

  const salesThisWeek = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(today.getDate() - diffToMonday);

    return salesRecords.filter((sale) => new Date(sale.sold_at) >= weekStart);
  }, [salesRecords]);

  const weeklySalesCount = useMemo(
    () => salesThisWeek.reduce((sum, sale) => sum + Number(sale.quantity ?? 0), 0),
    [salesThisWeek],
  );

  const weeklyMargin = useMemo(
    () => salesThisWeek.reduce((sum, sale) => sum + Number(sale.margin_amount ?? 0), 0),
    [salesThisWeek],
  );

  const weeklyGoal = 30;
  const weeklyGoalPct = weeklyGoal > 0 ? Math.min(100, Math.round((weeklySalesCount / weeklyGoal) * 100)) : 0;

  const salesRanking = useMemo(() => {
    const ranking = new Map<string, { agentId: string; agentName: string; totalPieces: number; totalMargin: number }>();

    for (const sale of salesThisWeek) {
      const agentId = sale.seller?.id ?? 'unknown';
      const agentName = sale.seller?.name ?? 'Sem vendedor';
      const current = ranking.get(agentId) ?? {
        agentId,
        agentName,
        totalPieces: 0,
        totalMargin: 0,
      };
      current.totalPieces += Number(sale.quantity ?? 0);
      current.totalMargin += Number(sale.margin_amount ?? 0);
      ranking.set(agentId, current);
    }

    return Array.from(ranking.values()).sort((a, b) => {
      if (b.totalPieces !== a.totalPieces) return b.totalPieces - a.totalPieces;
      return b.totalMargin - a.totalMargin;
    });
  }, [salesThisWeek]);

  const salesLeader = salesRanking[0] ?? null;

  const salesByDay = useMemo(() => {
    const days: Array<{ date: string; shortDate: string }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const dateKey = formatDateKey(day, businessTimezone);
      days.push({
        date: dateKey,
        shortDate: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit' }).format(day),
      });
    }

    const sellerNames = Array.from(new Set(salesThisWeek.map((sale) => sale.seller?.name).filter(Boolean))) as string[];

    return days.map((day) => {
      const row: Record<string, string | number> = { shortDate: day.shortDate };
      sellerNames.forEach((sellerName) => {
        const total = salesThisWeek
          .filter((sale) => formatDateKey(sale.sold_at, businessTimezone) === day.date && sale.seller?.name === sellerName)
          .reduce((sum, sale) => sum + Number(sale.quantity ?? 0), 0);
        row[sellerName] = total;
      });
      return row;
    });
  }, [salesThisWeek, businessTimezone]);

  const salesLegend = useMemo(() => {
    const sellerNames = Array.from(new Set(salesThisWeek.map((sale) => sale.seller?.name).filter(Boolean))) as string[];
    const palette = ['#D3FE18', '#5945FD', '#0EA5E9', '#F97316', '#10B981', '#F43F5E', '#EAB308'];
    return sellerNames.map((name, index) => ({ name, color: palette[index % palette.length] }));
  }, [salesThisWeek]);

  const dashboardQueries = [
    overviewQuery,
    leadMessagesQuery,
    slaMetricsQuery,
    scoreMetricsQuery,
    auditItemsQuery,
    salesRecordsQuery,
  ];
  const dashboardLoading = dashboardQueries.some((query) => query.isLoading);
  const dashboardError = dashboardQueries.some((query) => query.isError);
  const firstErrorQuery = dashboardQueries.find((query) => query.isError);
  const dashboardErrorMessage = firstErrorQuery?.error instanceof Error ? firstErrorQuery.error.message : null;


  if (companyLoading) {
    return (
      <div className="space-y-6" style={{ color: COLORS.text }}>
        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Carregando empresa e dados do dashboard...
        </section>
      </div>
    );
  }

  if (!company?.id) {
    return (
      <div className="space-y-6" style={{ color: COLORS.text }}>
        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma empresa selecionada. Cadastre ou selecione uma empresa para visualizar os dados.
        </section>
      </div>
    );
  }

  const overview = overviewQuery.data;

  return (
    <div className="space-y-6" style={{ color: COLORS.text }}>
      <section className="relative overflow-hidden rounded-[34px] border border-border bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] md:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(89,83,251,0.12),transparent_68%)]" />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(220,254,27,0.16),transparent_68%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-secondary/10 bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-secondary">
              Painel executivo
            </span>
            <h1 className="mt-4 text-[36px] font-bold leading-none tracking-[-0.05em] text-foreground md:text-[44px]">
              {company?.name ? `${company.name} em foco` : 'Sua operacao em foco'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Uma leitura limpa do comercial e do atendimento para acompanhar ritmo, qualidade e oportunidades sem ruido visual.
            </p>
            {dashboardLoading && <p className="mt-3 text-xs text-muted-foreground">Atualizando metricas...</p>}
            {dashboardError && <p className="mt-3 text-xs text-red-600">Falha ao carregar parte dos dados. Tente atualizar.</p>}
            {dashboardError && dashboardErrorMessage && <p className="mt-1 text-xs text-red-600">{dashboardErrorMessage}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
              Periodo: 30 dias
              <ChevronDown size={14} className="ml-2" />
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
              Atualizacao: 24h
              <ChevronDown size={14} className="ml-2" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!overview) return;
                downloadCsv('dashboard-resumo.csv', [
                  {
                    empresa: company?.name ?? 'Empresa',
                    conversas_7d: overview.conversations_7d,
                    conversas_30d: overview.conversations_30d,
                    sla_30d: overview.sla_pct_30d,
                    frt_30d: overview.avg_frt_30d,
                    alertas_abertos: overview.open_alerts,
                    alertas_criticos: overview.critical_alerts,
                    csat_previsto_30d: overview.avg_predicted_csat_30d,
                    atualizado_em: overview.refreshed_at,
                  },
                ]);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.01] hover:bg-primary/90"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void Promise.all([
                  queryClient.invalidateQueries({ queryKey: ['dashboard-overview', company?.id] }),
                  queryClient.invalidateQueries({ queryKey: ['dashboard-lead-messages', company?.id] }),
                  queryClient.invalidateQueries({ queryKey: ['dashboard-sla-metrics', company?.id] }),
                  queryClient.invalidateQueries({ queryKey: ['dashboard-score-metrics', company?.id] }),
                  queryClient.invalidateQueries({ queryKey: ['dashboard-audit-preview', company?.id] }),
                ]);
              }}
              aria-label="Atualizar dashboard"
              className="flex items-center justify-center rounded-full border border-border bg-card p-2.5 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-secondary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <HeroBadge label="Conversas na semana" value={String(overview?.conversations_7d ?? 0)} tone="lime" />
          <HeroBadge label="SLA medio 30d" value={formatPercent(overview?.sla_pct_30d ?? 0)} tone="purple" />
          <HeroBadge label="Alertas criticos" value={String(overview?.critical_alerts ?? 0)} />
        </div>
      </section>
      <div className="hidden flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.03em]">
            Bem-vindo(a) de volta{company?.name ? `, ${company.name}` : ''}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Aqui está o resumo da sua operação</p>
          {dashboardLoading && <p className="mt-2 text-xs text-muted-foreground">Atualizando métricas...</p>}
          {dashboardError && <p className="mt-2 text-xs text-red-600">Falha ao carregar parte dos dados. Tente atualizar.</p>}
          {dashboardError && dashboardErrorMessage && <p className="mt-1 text-xs text-red-600">{dashboardErrorMessage}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end xl:self-start mt-10 xl:mt-0">
          <div className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-card text-muted-foreground shadow-sm">
            Período: 30 dias
            <ChevronDown size={14} className="ml-2" />
          </div>
          <div className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-card text-muted-foreground shadow-sm">
            Atualização: 24h
            <ChevronDown size={14} className="ml-2" />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!overviewQuery.data) return;
              downloadCsv('dashboard-resumo.csv', [
                {
                  empresa: company?.name ?? 'Empresa',
                  conversas_7d: overviewQuery.data.conversations_7d,
                  conversas_30d: overviewQuery.data.conversations_30d,
                  sla_30d: overviewQuery.data.sla_pct_30d,
                  frt_30d: overviewQuery.data.avg_frt_30d,
                  alertas_abertos: overviewQuery.data.open_alerts,
                  alertas_criticos: overviewQuery.data.critical_alerts,
                  csat_previsto_30d: overviewQuery.data.avg_predicted_csat_30d,
                  atualizado_em: overviewQuery.data.refreshed_at,
                },
              ]);
            }}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-card text-muted-foreground shadow-sm hover:bg-muted/50 transition-colors"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: ['dashboard-overview', company?.id] }),
                queryClient.invalidateQueries({ queryKey: ['dashboard-lead-messages', company?.id] }),
                queryClient.invalidateQueries({ queryKey: ['dashboard-sla-metrics', company?.id] }),
                queryClient.invalidateQueries({ queryKey: ['dashboard-score-metrics', company?.id] }),
                queryClient.invalidateQueries({ queryKey: ['dashboard-audit-preview', company?.id] }),
              ]);
            }}
            aria-label="Atualizar dashboard"
            className="flex items-center justify-center rounded-full p-2.5 bg-card text-muted-foreground shadow-sm hover:bg-muted/50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
      </div>

      <SetupChecklist />

      <Tabs defaultValue="sales" className="space-y-6">
        <div className="flex justify-center">
          <TabsList className="h-14 rounded-full border border-border/70 bg-card p-1 shadow-sm">
            <TabsTrigger
              value="sales"
              className="rounded-full px-8 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Painel de vendas
            </TabsTrigger>
            <TabsTrigger
              value="service"
              className="rounded-full px-8 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Painel de atendimento
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sales" className="space-y-6">

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <DashboardCard
          title="Meta Semanal"
          action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><Target size={14} /></div>}
        >
          <div className="mt-1 flex items-end gap-2">
            <span className="text-[32px] font-bold tracking-tight text-foreground">{weeklySalesCount}</span>
            <span className="pb-1 text-sm font-semibold text-muted-foreground">/ {weeklyGoal}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{weeklyGoalPct}% concluído</p>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${weeklyGoalPct}%`, background: COLORS.lime }}
            />
          </div>
        </DashboardCard>

        <DashboardCard
          title="Margem da Semana"
          action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><TrendingUp size={14} /></div>}
        >
          <div className="mt-1 text-[32px] font-bold tracking-tight">{formatCurrency(weeklyMargin)}</div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">Margem acumulada nas vendas da semana.</p>
        </DashboardCard>

        <DashboardCard
          title="Líder Atual"
          action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><Medal size={14} /></div>}
        >
          <div className="mt-1 text-[30px] font-bold uppercase tracking-tight text-foreground">
            {salesLeader?.agentName ?? '—'}
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {salesLeader ? `${salesLeader.totalPieces} peça${salesLeader.totalPieces !== 1 ? 's' : ''} na semana` : 'Sem vendas registradas nesta semana'}
          </p>
        </DashboardCard>

        <DashboardCard
          title="Lojas Ativas"
          action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><ShoppingBag size={14} /></div>}
        >
          <div className="mt-1 text-[32px] font-bold tracking-tight">
            {new Set(salesThisWeek.map((sale) => sale.store_name).filter(Boolean)).size}
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">Quantidade de lojas com venda na semana.</p>
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="col-span-1 xl:col-span-8">
          <DashboardCard title="Vendas por Dia" action={<span className="text-sm font-semibold rounded-full bg-muted/50 px-3 py-1 text-muted-foreground">Últimos 7 dias</span>}>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                <BarChart data={salesByDay} margin={{ top: 8, right: 10, left: -20, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#ECEBE8" />
                  <XAxis dataKey="shortDate" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLORS.soft }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLORS.soft }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, border: `1px solid ${COLORS.line}`, boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}
                    formatter={(value) => [`${Number(value ?? 0)} peça(s)`, 'Vendas']}
                  />
                  <Legend />
                  {salesLegend.map((entry) => (
                    <Bar key={entry.name} dataKey={entry.name} fill={entry.color} radius={[6, 6, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>
        </div>

        <div className="col-span-1 xl:col-span-4">
          <DashboardCard title="Ranking Semanal" action={<Trophy size={16} color={COLORS.soft} />}>
            <div className="space-y-3">
              {salesRanking.map((entry, index) => (
                <div
                  key={entry.agentId}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${index === 0 ? 'border-primary/40 bg-primary/10' : 'border-border/60 bg-muted/20'}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{entry.agentName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(entry.totalMargin)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{entry.totalPieces}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">peças</p>
                  </div>
                </div>
              ))}
              {salesRanking.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Sem vendas registradas na semana.
                </div>
              )}
            </div>
          </DashboardCard>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="service" className="space-y-6">

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column Section */}
        <div className="col-span-1 border-none xl:col-span-7 space-y-6">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <DashboardCard title="Leads Hoje" action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><Settings2Icon/></div>}>
              <div className="mt-2 text-[32px] font-bold tracking-tight">{leadsToday}</div>
              <p className="text-sm font-medium text-muted-foreground mt-1 mb-4">Novas conversas iniciadas hoje</p>
              <div className="h-16 w-full relative">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <LineChart data={recentTrend}>
                    <Line type="monotone" dataKey="conversations" stroke={COLORS.purple} strokeWidth={3} dot={{ stroke: COLORS.purple, strokeWidth: 2, r: 4, fill: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>

            <DashboardCard title="Leads no Mês" action={<div className="p-1.5 bg-muted rounded-full text-muted-foreground"><ShoppingBag size={14}/></div>}>
              <div className="mt-2 text-[32px] font-bold tracking-tight">{leadsMonth}</div>
              <p className="text-sm font-medium text-muted-foreground mt-1 mb-4">Novas conversas iniciadas nos ultimos 30 dias</p>
              <div className="h-16 w-full relative">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <LineChart data={recentTrend}>
                    <Line type="monotone" dataKey="conversations" stroke={COLORS.purple} strokeWidth={3} dot={{ stroke: COLORS.purple, strokeWidth: 2, r: 4, fill: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>
          </div>

          <DashboardCard title="Evolução de Leads" action={<span className="text-sm font-semibold rounded-full bg-muted/50 px-3 py-1 text-muted-foreground flex items-center">Últimos 30 dias <ChevronDown size={14} className="inline ml-1" /></span>}>
            <div className="h-[280px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                <AreaChart data={trendData} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardLeadsArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.lime} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={COLORS.lime} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#ECEBE8" />
                  <XAxis dataKey="shortDate" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLORS.soft }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLORS.soft }} />
                  <Tooltip
                    cursor={{ stroke: '#DDDAD7', strokeDasharray: '4 4' }}
                    contentStyle={{ borderRadius: 16, border: `1px solid ${COLORS.line}`, boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}
                    formatter={(value) => [`${Number(value ?? 0)} conversas`, 'Iniciadas no dia']}
                  />
                  <Area type="monotone" dataKey="conversations" stroke={COLORS.lime} strokeWidth={3} fill="url(#dashboardLeadsArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>

          <DashboardCard title="Auditoria Recente" action={<Link to="/audit" className="text-sm rounded-full bg-muted/50 px-3 py-1 font-semibold text-muted-foreground inline-flex items-center hover:bg-muted transition-colors">Ver tudo</Link>}>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="pb-3 pt-1 pl-2 text-xs font-bold text-muted-foreground w-8">#</th>
                    <th className="pb-3 pt-1 text-xs font-bold text-muted-foreground">Cliente</th>
                    <th className="pb-3 pt-1 text-xs font-bold text-muted-foreground">Qualidade</th>
                    <th className="pb-3 pt-1 text-xs font-bold text-muted-foreground hidden sm:table-cell">Área de melhoria</th>
                    <th className="pb-3 pt-1 text-xs font-bold text-muted-foreground hidden md:table-cell">Atendente</th>
                    <th className="pb-3 pt-1 text-xs font-bold text-muted-foreground text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.map((item, idx) => {
                    const customerName = (item.conversation?.customer?.name ?? item.conversation?.customer?.phone ?? 'Cliente')
                      .replace(/\*\*/g, '');
                    const rawTag = item.training_tags?.[0] ?? '';
                    const tagLabel = rawTag
                      ? rawTag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : '—';
                    const score = item.quality_score ?? 0;
                    const scoreColor = score >= 80
                      ? 'text-green-600 dark:text-green-400'
                      : score >= 60
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400';
                    const statusCfg = score >= 80
                      ? { label: 'Ótimo', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
                      : score >= 60
                        ? { label: 'Regular', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
                        : { label: 'Atenção', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' };
                    return (
                      <tr key={item.id} className="group border-t border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pl-2 text-xs font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="py-3 pr-3">
                          <Link to={`/conversations/${item.conversation_id}`} className="flex items-center gap-2.5 hover:underline">
                            <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center font-bold text-xs shrink-0">
                              {initials(customerName)}
                            </div>
                            <span className="font-medium text-foreground truncate max-w-[120px]">{customerName}</span>
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>{score}</span>
                            <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${score}%`,
                                  background: score >= 80 ? '#16a34a' : score >= 60 ? '#ca8a04' : '#dc2626',
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tagLabel}</span>
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground hidden md:table-cell">
                          {item.agent?.name ?? '—'}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-block ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {auditItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Sem registros recentes de auditoria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>

        </div>

        {/* Right Column Section */}
        <div className="col-span-1 border-none xl:col-span-5 space-y-6">
          <DashboardCard title="SLA de Clientes" action={<span className="text-sm font-semibold rounded-full bg-muted/50 px-3 py-1 text-muted-foreground flex items-center">Últimos 30 dias <ChevronDown size={14} className="inline ml-1" /></span>}>
            <div className="flex flex-col sm:flex-row items-center gap-8 mt-4">
              <div className="relative h-[180px] w-[220px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                  <PieChart>
                    <Pie
                      data={[pieData[0]]}
                      cx="50%"
                      cy="72%"
                      innerRadius={65}
                      outerRadius={85}
                      startAngle={180}
                      endAngle={0}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={40}
                    >
                      <Cell fill={COLORS.purple} />
                    </Pie>
                    <Pie
                      data={[pieData[1]]}
                      cx="50%"
                      cy="72%"
                      innerRadius={65}
                      outerRadius={85}
                      startAngle={180}
                      endAngle={180 - (teamSla * 1.8)}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={40}
                    >
                      <Cell fill={COLORS.lime} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-x-0 bottom-6 flex flex-col items-center justify-center text-center">
                  <span className="text-[28px] font-bold tracking-tight">{teamSla.toFixed(0)}%</span>
                  <span className="text-xs font-semibold text-muted-foreground">SLA da equipe</span>
                </div>
              </div>

              <div className="space-y-5 flex-1 w-full">
                {slaByAgent.map((agent, index) => (
                  <div key={agent.agent_id} className="flex flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-lime-500' : 'bg-purple-500/40'}`}></div>
                        <span className="text-sm font-semibold text-foreground">{agent.agent_name}</span>
                      </div>
                      <span className="text-sm font-bold text-foreground">{formatPercent(agent.sla_pct)}</span>
                    </div>
                  </div>
                ))}
                {slaByAgent.length === 0 && <p className="text-sm text-muted-foreground">Sem dados de SLA por atendente.</p>}
              </div>
            </div>
          </DashboardCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <DashboardCard title="Score da Equipe" action={<div className="p-1 rounded-full bg-muted/50"><ListTodo size={14} className="text-muted-foreground"/></div>}>
              <p className="text-xs font-semibold text-muted-foreground mb-4">Atendentes e seus scores</p>
              <div className="space-y-5">
                {scoreBoard.map((agent) => {
                  const score = Math.round(Math.max(0, Math.min(100, agent.avg_ai_quality_score ?? 0)));
                  return (
                    <div key={agent.agent_id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/30 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {agent.agent_avatar ? (
                            <img src={agent.agent_avatar} alt={agent.agent_name} className="h-full w-full object-cover" />
                          ) : (
                            initials(agent.agent_name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{agent.agent_name}</p>
                          <p className="text-xs text-muted-foreground">Score de qualidade</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-foreground">{score}%</span>
                    </div>
                  );
                })}
                {scoreBoard.length === 0 && <p className="text-sm text-muted-foreground">Sem scores por atendente.</p>}
              </div>
            </DashboardCard>

            <DashboardCard title="Categorias de Dados" action={<Sparkles size={16} color={COLORS.soft} />}>
              <p className="text-xs font-semibold text-muted-foreground mb-4">Top áreas de melhoria identificadas pela IA</p>
              {tagFrequency.length > 0 ? (
                <div className="space-y-3">
                  {tagFrequency.map((entry, index) => {
                    const label = entry.name
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c: string) => c.toUpperCase());
                    const maxTotal = tagFrequency[0].total;
                    const pct = Math.round((entry.total / maxTotal) * 100);
                    const opacity = 1 - index * 0.12;
                    return (
                      <div key={entry.name} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate">{label}</span>
                          <span className="text-xs font-bold text-muted-foreground shrink-0">{entry.total}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, rgba(139,92,246,${opacity}) 0%, rgba(109,40,217,${opacity}) 100%)`,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">Sem dados ainda</div>
              )}
            </DashboardCard>
          </div>

        </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Settings2Icon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
}
