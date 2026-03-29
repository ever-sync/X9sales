import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Crown, HandCoins, Trophy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { BadgePill } from '../components/gamification/BadgePill';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { cn } from '../lib/utils';
import { downloadCsv } from '../lib/export';
import type { AgentBadge, AgentRanking } from '../types';

function useRanking() {
  const { companyId } = useCompany();
  return useQuery<AgentRanking[]>({
    queryKey: ['agent-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_agent_ranking')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as AgentRanking[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  });
}

function useBadges() {
  const { companyId } = useCompany();
  return useQuery<AgentBadge[]>({
    queryKey: ['agent-badges', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc('get_agent_badges', {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? []) as AgentBadge[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 10,
  });
}

function fmtRevenue(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return 'AT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function qualityColor(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-secondary';
  if (score >= 60) return 'text-foreground';
  return 'text-red-500';
}

function safeConversion(agent: AgentRanking) {
  if (!agent.total_conversations) return 0;
  return Math.round((agent.total_deals_won / agent.total_conversations) * 100);
}

function rankAccent(position: number) {
  if (position === 0) return 'border-primary/70 bg-primary text-primary-foreground shadow-[0_18px_38px_rgba(220,254,27,0.28)]';
  if (position === 1) return 'border-secondary/20 bg-accent text-secondary';
  if (position === 2) return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-border bg-white text-foreground';
}

function PodiumCard({
  agent,
  index,
  badges,
  mode,
}: {
  agent: AgentRanking;
  index: number;
  badges: AgentBadge[];
  mode: 'sales' | 'service';
}) {
  const topMetric = mode === 'sales'
    ? fmtRevenue(agent.total_revenue)
    : `${Math.round(agent.avg_ai_quality_score ?? 0)}/100`;
  const metricLabel = mode === 'sales' ? 'Receita total' : 'Qualidade IA';
  const secondaryMetric = mode === 'sales'
    ? `${agent.total_deals_won} venda(s)`
    : `${Math.round(agent.avg_sla_first_response_pct ?? 0)}% SLA`;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[30px] border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-1',
        index === 0 ? 'border-primary/60 bg-[linear-gradient(180deg,rgba(220,254,27,0.22),rgba(255,255,255,1))]' : 'border-border bg-white',
      )}
    >
      <div className="absolute right-5 top-5">
        <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold', rankAccent(index))}>
          {index === 0 ? <Crown className="h-4.5 w-4.5" /> : index + 1}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className={cn(
          'flex h-16 w-16 items-center justify-center rounded-[22px] text-base font-black',
          index === 0 ? 'bg-primary text-primary-foreground' : 'bg-accent text-secondary',
        )}>
          {initials(agent.agent_name)}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-[-0.03em] text-foreground">{agent.agent_name}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {index === 0 ? 'Lider da rodada' : mode === 'sales' ? 'Top performer' : 'Destaque tecnico'}
          </p>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.slice(0, 2).map((badge) => (
            <BadgePill key={`${agent.agent_id}:${badge.badge_key}`} badge={badge} compact />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white/88 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{metricLabel}</p>
          <p className="mt-2 text-3xl font-bold tracking-[-0.05em] text-foreground">{topMetric}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white/88 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Indicador de apoio</p>
          <p className="mt-2 text-xl font-bold tracking-[-0.03em] text-foreground">{secondaryMetric}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({ agents }: { agents: AgentRanking[] }) {
  const totalRevenue = agents.reduce((sum, agent) => sum + agent.total_revenue, 0);
  const totalConversations = agents.reduce((sum, agent) => sum + agent.total_conversations, 0);
  const avgQualityBase = agents.filter((agent) => agent.avg_ai_quality_score != null);
  const avgQuality = avgQualityBase.length
    ? Math.round(avgQualityBase.reduce((sum, agent) => sum + (agent.avg_ai_quality_score ?? 0), 0) / avgQualityBase.length)
    : 0;

  const items = [
    { label: 'Receita consolidada', value: fmtRevenue(totalRevenue), tone: 'lime' },
    { label: 'Conversas monitoradas', value: String(totalConversations), tone: 'neutral' },
    { label: 'Score medio do time', value: `${avgQuality}/100`, tone: 'purple' },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-[26px] border border-border bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-3xl font-bold tracking-[-0.05em] text-foreground">{item.value}</p>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
              item.tone === 'lime' && 'bg-primary text-primary-foreground',
              item.tone === 'purple' && 'bg-accent text-secondary',
              item.tone === 'neutral' && 'bg-muted text-foreground',
            )}>
              resumo
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingTable({
  agents,
  badgesByAgent,
  mode,
}: {
  agents: AgentRanking[];
  badgesByAgent: Record<string, AgentBadge[]>;
  mode: 'sales' | 'service';
}) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-border bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">
            {mode === 'sales' ? 'Classificacao de vendas' : 'Classificacao de atendimento'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'sales'
              ? 'Receita, conversao e negocios ganhos em uma leitura mais limpa.'
              : 'Qualidade, SLA e consistencia tecnica do time.'}
          </p>
        </div>
        <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">
          {mode === 'sales' ? 'Comercial' : 'Qualidade'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <th className="px-6 py-4">Rank</th>
              <th className="px-6 py-4">Pessoa</th>
              {mode === 'sales' ? (
                <>
                  <th className="px-6 py-4 text-center">Negocios</th>
                  <th className="px-6 py-4 text-center">Ticket medio</th>
                  <th className="px-6 py-4 text-center">Conversao</th>
                  <th className="px-6 py-4 text-right">Receita</th>
                </>
              ) : (
                <>
                  <th className="px-6 py-4 text-center">Tempo resposta</th>
                  <th className="px-6 py-4 text-center">SLA 1a resp.</th>
                  <th className="px-6 py-4 text-center">CSAT medio</th>
                  <th className="px-6 py-4 text-right">Nota IA</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((agent, index) => {
              const badges = badgesByAgent[agent.agent_id] ?? [];
              return (
                <tr key={agent.agent_id} className="transition-colors hover:bg-accent/40">
                  <td className="px-6 py-5">
                    <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold', rankAccent(index))}>
                      {index === 0 ? <Crown className="h-4 w-4" /> : index + 1}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-sm font-black text-foreground">
                        {initials(agent.agent_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground">{agent.agent_name}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {badges.slice(0, 2).map((badge) => (
                            <BadgePill key={`${agent.agent_id}:${badge.badge_key}`} badge={badge} compact />
                          ))}
                          {badges.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              {mode === 'sales' ? 'Em disputa comercial' : 'Em evolucao tecnica'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {mode === 'sales' ? (
                    <>
                      <td className="px-6 py-5 text-center font-bold text-foreground">{agent.total_deals_won}</td>
                      <td className="px-6 py-5 text-center font-bold text-foreground">
                        {agent.total_deals_won > 0 ? fmtRevenue(Math.round(agent.total_revenue / agent.total_deals_won)) : 'R$ 0,00'}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="inline-flex rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-foreground">
                          {safeConversion(agent)}%
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right text-lg font-bold tracking-[-0.03em] text-foreground">
                        {fmtRevenue(agent.total_revenue)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-5 text-center font-bold text-foreground">
                        {Math.round((agent.avg_first_response_sec ?? 0) / 60)} min
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-bold text-secondary">
                          {Math.round(agent.avg_sla_first_response_pct ?? 0)}%
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-foreground">
                        {agent.avg_predicted_csat?.toFixed(1) ?? '--'}
                      </td>
                      <td className={cn('px-6 py-5 text-right text-lg font-bold tracking-[-0.03em]', qualityColor(agent.avg_ai_quality_score))}>
                        {Math.round(agent.avg_ai_quality_score ?? 0)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Ranking() {
  const { data, isLoading } = useRanking();
  const { data: badges = [] } = useBadges();
  const agents = data ?? [];

  const badgesByAgent = useMemo(() => {
    return badges.reduce<Record<string, AgentBadge[]>>((acc, badge) => {
      acc[badge.agent_id] = [...(acc[badge.agent_id] ?? []), badge];
      return acc;
    }, {});
  }, [badges]);

  const salesRanking = useMemo(() => [...agents].sort((a, b) => b.total_revenue - a.total_revenue), [agents]);
  const serviceRanking = useMemo(() => [...agents].sort((a, b) => (b.avg_ai_quality_score ?? 0) - (a.avg_ai_quality_score ?? 0)), [agents]);
  const salesPodium = [salesRanking[0], salesRanking[1], salesRanking[2]].filter(Boolean) as AgentRanking[];
  const servicePodium = [serviceRanking[0], serviceRanking[1], serviceRanking[2]].filter(Boolean) as AgentRanking[];

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-8 pt-6">
        <div className="h-40 animate-pulse rounded-[34px] bg-muted" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 animate-pulse rounded-[28px] bg-muted" />
          <div className="h-28 animate-pulse rounded-[28px] bg-muted" />
          <div className="h-28 animate-pulse rounded-[28px] bg-muted" />
        </div>
        <div className="h-80 animate-pulse rounded-[30px] bg-muted" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex-1 p-4 md:p-8 pt-6">
        <EmptyState
          icon={Trophy}
          title="Nenhum dado de ranking ainda"
          description="O ranking aparecera assim que o time acumular conversas, analises e vendas."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8 pt-6 pb-32">
      <section className="relative overflow-hidden rounded-[34px] border border-border bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] md:p-8">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_center,rgba(89,83,251,0.12),transparent_68%)]" />
        <div className="absolute bottom-0 left-0 h-36 w-36 rounded-full bg-[radial-gradient(circle_at_center,rgba(220,254,27,0.18),transparent_68%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/10 bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-secondary">
              <Trophy className="h-3.5 w-3.5" />
              Copa de performance
            </span>
            <h1 className="mt-4 text-[38px] font-bold tracking-[-0.05em] text-foreground md:text-[46px]">
              Onde o time mais forte se destaca
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Um ranking mais claro, mais premium e mais facil de ler, com foco no que realmente move vendas e qualidade.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              downloadCsv('ranking-agentes.csv', agents.map((agent) => ({
                agente: agent.agent_name,
                conversas: agent.total_conversations,
                qualidade_ia: agent.avg_ai_quality_score,
                sla_primeira_resposta: agent.avg_sla_first_response_pct,
                deals_ganhos: agent.total_deals_won,
                receita_total: agent.total_revenue,
                csat_previsto: agent.avg_predicted_csat,
              })));
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.01] hover:bg-primary/90"
          >
            Exportar CSV
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <SummaryStrip agents={agents} />

      <Tabs defaultValue="sales" className="space-y-8">
        <div className="flex justify-center">
          <TabsList className="h-14 rounded-full border border-border bg-white p-1 shadow-sm">
            <TabsTrigger
              value="sales"
              className="rounded-full px-8 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <HandCoins className="mr-2 h-4 w-4" />
              Ranking de vendas
            </TabsTrigger>
            <TabsTrigger
              value="service"
              className="rounded-full px-8 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Activity className="mr-2 h-4 w-4" />
              Ranking de atendimento
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sales" className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {salesPodium.map((agent, index) => (
              <PodiumCard
                key={agent.agent_id}
                agent={agent}
                index={index}
                badges={badgesByAgent[agent.agent_id] ?? []}
                mode="sales"
              />
            ))}
          </div>
          <RankingTable agents={salesRanking} badgesByAgent={badgesByAgent} mode="sales" />
        </TabsContent>

        <TabsContent value="service" className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {servicePodium.map((agent, index) => (
              <PodiumCard
                key={agent.agent_id}
                agent={agent}
                index={index}
                badges={badgesByAgent[agent.agent_id] ?? []}
                mode="service"
              />
            ))}
          </div>
          <RankingTable agents={serviceRanking} badgesByAgent={badgesByAgent} mode="service" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
