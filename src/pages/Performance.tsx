import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  MessageSquare,
  Star,
  ShieldCheck,
  DollarSign,
  Target,
  Award,
  Users,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { formatCurrency } from '../lib/utils';
import type { AgentRanking, DailyTrend } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(sec: number | null): string {
  if (!sec) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}m`;
}

function qualityColor(score: number | null) {
  if (!score) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function qualityBg(score: number | null) {
  if (!score) return 'bg-slate-100 dark:bg-slate-800';
  if (score >= 80) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

// ── Performance page ──────────────────────────────────────────────────────────

export default function Performance() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [days, setDays] = useState(30);

  const isAdmin = can('performance.view_all');

  // ── find own agent id (for agent view) ────────────────────────────────────
  const { data: myAgentRow } = useQuery({
    queryKey: ['my-agent-for-perf', companyId, user?.id],
    queryFn: async () => {
      if (!companyId || !user?.email) return null;
      const { data, error } = await supabase
        .from('agents')
        .select('id')
        .eq('company_id', companyId)
        .eq('email', user.email)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!companyId && !!user?.email && !isAdmin,
    staleTime: CACHE.STALE_TIME,
  });

  const myAgentId = myAgentRow?.id ?? null;

  // ── agent ranking ──────────────────────────────────────────────────────────
  const { data: rankingData = [], isLoading: rankingLoading } = useQuery<AgentRanking[]>({
    queryKey: ['perf-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_agent_ranking')
        .select('*')
        .eq('company_id', companyId)
        .order('avg_ai_quality_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentRanking[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  // ── daily trend ────────────────────────────────────────────────────────────
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }, [days]);

  const { data: companyTrend = [], isLoading: trendLoading } = useQuery<DailyTrend[]>({
    queryKey: ['perf-trend', companyId, days],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_daily_trend')
        .select('*')
        .eq('company_id', companyId)
        .gte('conversation_date', since)
        .order('conversation_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyTrend[];
    },
    enabled: !!companyId && isAdmin,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: agentDailyTrend = [], isLoading: agentTrendLoading } = useQuery({
    queryKey: ['perf-agent-daily', companyId, myAgentId, days],
    queryFn: async () => {
      if (!companyId || !myAgentId) return [];
      const { data, error } = await supabase
        .from('metrics_agent_daily')
        .select('metric_date, conversations_total, sla_first_response_pct, avg_first_response_sec, deals_won, revenue')
        .eq('company_id', companyId)
        .eq('agent_id', myAgentId)
        .gte('metric_date', since)
        .order('metric_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && !!myAgentId && !isAdmin,
    staleTime: CACHE.STALE_TIME,
  });

  // ── chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (isAdmin) {
      const map = new Map<string, { date: string; conversas: number; sla: number; count: number }>();
      for (const row of companyTrend) {
        const key = row.conversation_date;
        const existing = map.get(key);
        if (existing) {
          existing.conversas += row.conversation_count;
          existing.sla += row.sla_pct ?? 0;
          existing.count += 1;
        } else {
          map.set(key, { date: key, conversas: row.conversation_count, sla: row.sla_pct ?? 0, count: 1 });
        }
      }
      return Array.from(map.values()).map((r) => ({
        day: new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        conversas: r.conversas,
        sla: r.count > 0 ? Math.round(r.sla / r.count) : 0,
      }));
    } else {
      return agentDailyTrend.map((r) => ({
        day: new Date(r.metric_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        conversas: r.conversations_total,
        sla: Math.round(Number(r.sla_first_response_pct ?? 0)),
      }));
    }
  }, [isAdmin, companyTrend, agentDailyTrend]);

  // ── KPI aggregates ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (isAdmin) {
      const n = rankingData.length || 1;
      return {
        totalConversas: rankingData.reduce((s, a) => s + a.total_conversations, 0),
        qualidadeMedia: rankingData.reduce((s, a) => s + (a.avg_ai_quality_score ?? 0), 0) / n,
        slaMedia: rankingData.reduce((s, a) => s + (a.avg_sla_first_response_pct ?? 0), 0) / n,
        receitaTotal: rankingData.reduce((s, a) => s + a.total_revenue, 0),
      };
    } else {
      const me = rankingData.find((a) => a.agent_id === myAgentId);
      return {
        totalConversas: me?.total_conversations ?? 0,
        qualidadeMedia: me?.avg_ai_quality_score ?? null,
        slaMedia: me?.avg_sla_first_response_pct ?? null,
        receitaTotal: me?.total_revenue ?? 0,
      };
    }
  }, [isAdmin, rankingData, myAgentId]);

  const isLoading = rankingLoading || (isAdmin ? trendLoading : agentTrendLoading);

  const topAgents = useMemo(
    () => [...rankingData].sort((a, b) => (b.avg_ai_quality_score ?? 0) - (a.avg_ai_quality_score ?? 0)).slice(0, 5),
    [rankingData],
  );

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 space-y-8 p-4 sm:p-8 pt-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
            <Activity className="text-primary h-8 w-8 sm:h-10 sm:w-10" />
            {isAdmin ? 'Performance' : 'Minha Performance'}
          </h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            {isAdmin ? `Visão geral do time · últimos ${days} dias.` : `Seus resultados · últimos ${days} dias.`}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-card p-1.5 rounded-2xl border shadow-sm">
          {[
            { v: 7, label: '7 dias' },
            { v: 30, label: 'Mês' },
            { v: 90, label: 'Trimestre' },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setDays(v)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                days === v
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Conversas"
          value={isLoading ? '…' : String(kpis.totalConversas)}
          icon={MessageSquare}
          color="text-blue-500"
        />
        <KpiCard
          label="Qualidade IA"
          value={isLoading ? '…' : kpis.qualidadeMedia != null ? `${Math.round(kpis.qualidadeMedia)}%` : '—'}
          icon={Star}
          color="text-amber-500"
        />
        <KpiCard
          label="SLA Resposta"
          value={isLoading ? '…' : kpis.slaMedia != null ? `${Math.round(kpis.slaMedia)}%` : '—'}
          icon={ShieldCheck}
          color="text-emerald-500"
        />
        <KpiCard
          label={isAdmin ? 'Receita Total' : 'Receita (30d)'}
          value={isLoading ? '…' : formatCurrency(kpis.receitaTotal)}
          icon={DollarSign}
          color="text-indigo-500"
        />
      </div>

      {/* Chart + Top ranking */}
      <div className="grid gap-6 lg:grid-cols-7">
        <div className="lg:col-span-4 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="text-xl font-black text-foreground">Fluxo de Conversas</h4>
              <p className="text-sm text-muted-foreground font-medium">Volume diário · SLA %</p>
            </div>
            <div className="hidden sm:flex gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-xs font-bold text-muted-foreground">Conversas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold text-muted-foreground">SLA %</span>
              </div>
            </div>
          </div>

          <div className="h-[260px] w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Sem dados para o período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="perfConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="perfSla" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 700 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.15)',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="conversas"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#perfConv)"
                  />
                  <Area
                    type="monotone"
                    dataKey="sla"
                    stroke="#4ade80"
                    strokeWidth={2}
                    fill="url(#perfSla)"
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm flex flex-col">
          <h4 className="text-xl font-black text-foreground mb-1">
            {isAdmin ? 'Top Performance' : 'Ranking do Time'}
          </h4>
          <p className="text-sm text-muted-foreground font-medium mb-6">Por qualidade IA (30 dias)</p>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
          ) : topAgents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Sem dados.</div>
          ) : (
            <div className="space-y-5 flex-1">
              {topAgents.map((agent, i) => {
                const isMe = agent.agent_id === myAgentId;
                return (
                  <div key={agent.agent_id} className="flex items-center justify-between group cursor-default">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black text-sm transition-colors ${
                          isMe
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground'
                        }`}
                      >
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </div>
                      <div>
                        <h5 className="font-bold text-foreground text-sm leading-tight">
                          {agent.agent_name}
                          {isMe && <span className="ml-1 text-primary text-xs">(você)</span>}
                        </h5>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-bold text-muted-foreground">
                            {agent.total_conversations} conv.
                          </span>
                          <div className="h-1 w-1 rounded-full bg-border" />
                          <span className={`text-xs font-bold ${qualityColor(agent.avg_ai_quality_score)}`}>
                            QA{' '}
                            {agent.avg_ai_quality_score != null ? Math.round(agent.avg_ai_quality_score) : '—'}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-foreground">
                        {agent.avg_predicted_csat != null ? `★ ${agent.avg_predicted_csat.toFixed(1)}` : '—'}
                      </div>
                      <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">CSAT</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Admin: full table */}
      {isAdmin && (
        <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8 border-b">
            <h4 className="text-xl font-black text-foreground flex items-center gap-2">
              <Users size={20} className="text-primary" />
              Desempenho por Atendente
            </h4>
            <p className="text-sm text-muted-foreground font-medium mt-1">Últimos 30 dias · ordenado por qualidade</p>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando…</div>
            ) : rankingData.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Sem dados para o período.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <th className="text-left p-4 pl-6">#</th>
                    <th className="text-left p-4">Atendente</th>
                    <th className="text-right p-4">Conversas</th>
                    <th className="text-right p-4">Qualidade IA</th>
                    <th className="text-right p-4">SLA Resp.</th>
                    <th className="text-right p-4">CSAT</th>
                    <th className="text-right p-4">T. Resposta</th>
                    <th className="text-right p-4 pr-6">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rankingData]
                    .sort((a, b) => (b.avg_ai_quality_score ?? 0) - (a.avg_ai_quality_score ?? 0))
                    .map((agent, i) => (
                      <tr key={agent.agent_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-4 pl-6 font-black text-muted-foreground">{i + 1}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black ${qualityBg(agent.avg_ai_quality_score)} ${qualityColor(agent.avg_ai_quality_score)}`}
                            >
                              {agent.agent_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-foreground">{agent.agent_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {agent.total_deals_won}W · {agent.total_deals_lost}L
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right font-bold text-foreground">{agent.total_conversations}</td>
                        <td className="p-4 text-right">
                          <span className={`font-black text-base ${qualityColor(agent.avg_ai_quality_score)}`}>
                            {agent.avg_ai_quality_score != null
                              ? `${Math.round(agent.avg_ai_quality_score)}%`
                              : '—'}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-foreground">
                          {agent.avg_sla_first_response_pct != null
                            ? `${Math.round(agent.avg_sla_first_response_pct)}%`
                            : '—'}
                        </td>
                        <td className="p-4 text-right font-bold text-foreground">
                          {agent.avg_predicted_csat != null ? `★ ${agent.avg_predicted_csat.toFixed(1)}` : '—'}
                        </td>
                        <td className="p-4 text-right font-bold text-foreground">
                          {fmtSeconds(agent.avg_first_response_sec)}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          {agent.open_alerts > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-500 font-bold">
                              <AlertTriangle size={14} />
                              {agent.open_alerts}
                            </span>
                          ) : (
                            <span className="text-emerald-500 font-bold">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Agent: detail cards */}
      {!isAdmin && (() => {
        const me = rankingData.find((a) => a.agent_id === myAgentId);
        if (!me) return null;
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailCard
              title="Negócios"
              items={[
                { label: 'Ganhos', value: String(me.total_deals_won), color: 'text-emerald-500' },
                { label: 'Perdidos', value: String(me.total_deals_lost), color: 'text-red-500' },
                {
                  label: 'Taxa de conv.',
                  value:
                    me.total_deals_won + me.total_deals_lost > 0
                      ? `${Math.round((me.total_deals_won / (me.total_deals_won + me.total_deals_lost)) * 100)}%`
                      : '—',
                  color: 'text-blue-500',
                },
              ]}
              icon={Target}
            />
            <DetailCard
              title="Atendimento"
              items={[
                { label: 'Conversas', value: String(me.total_conversations), color: 'text-blue-500' },
                { label: 'Fechadas', value: String(me.total_closed), color: 'text-emerald-500' },
                { label: 'T. Resposta', value: fmtSeconds(me.avg_first_response_sec), color: 'text-amber-500' },
              ]}
              icon={MessageSquare}
            />
            <DetailCard
              title="Qualidade"
              items={[
                {
                  label: 'Score IA',
                  value:
                    me.avg_ai_quality_score != null ? `${Math.round(me.avg_ai_quality_score)}%` : '—',
                  color: qualityColor(me.avg_ai_quality_score),
                },
                {
                  label: 'CSAT',
                  value: me.avg_predicted_csat != null ? `★ ${me.avg_predicted_csat.toFixed(1)}` : '—',
                  color: 'text-amber-500',
                },
                {
                  label: 'Coaching',
                  value: me.coaching_needed_count > 0 ? `${me.coaching_needed_count} sessões` : 'Em dia ✓',
                  color: me.coaching_needed_count > 0 ? 'text-red-500' : 'text-emerald-500',
                },
              ]}
              icon={Award}
            />
          </div>
        );
      })()}
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border bg-card p-5 sm:p-6 shadow-sm transition-all hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5">
      <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:scale-110 transition-transform">
        <Icon size={70} />
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <h3 className={`mt-2 text-2xl sm:text-3xl font-black ${color}`}>{value}</h3>
    </div>
  );
}

function DetailCard({
  title,
  items,
  icon: Icon,
}: {
  title: string;
  items: { label: string; value: string; color: string }[];
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-3xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Icon size={18} className="text-primary" />
        <h5 className="font-black text-foreground">{title}</h5>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">{item.label}</span>
            <span className={`text-sm font-black ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
