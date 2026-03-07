import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { cn } from '../lib/utils';
import type { AgentRanking } from '../types';
import {
  Trophy,
  Medal,
  TrendingUp,
  Clock,
  MessageSquare,
  Star,
  AlertTriangle,
  DollarSign,
  BookOpen,
} from 'lucide-react';

// ── hook ──────────────────────────────────────────────────────────────────────

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

// ── sort options ──────────────────────────────────────────────────────────────

type SortKey =
  | 'avg_ai_quality_score'
  | 'total_conversations'
  | 'total_revenue'
  | 'avg_first_response_sec'
  | 'avg_predicted_csat'
  | 'total_deals_won';

const SORT_OPTIONS: { key: SortKey; label: string; desc: boolean }[] = [
  { key: 'avg_ai_quality_score', label: 'Qualidade IA', desc: true },
  { key: 'total_conversations', label: 'Conversas', desc: true },
  { key: 'total_revenue', label: 'Receita', desc: true },
  { key: 'total_deals_won', label: 'Negócios ganhos', desc: true },
  { key: 'avg_predicted_csat', label: 'CSAT', desc: true },
  { key: 'avg_first_response_sec', label: 'Tempo de resposta', desc: false }, // lower is better
];

function sortRanking(agents: AgentRanking[], sortKey: SortKey, desc: boolean): AgentRanking[] {
  return [...agents].sort((a, b) => {
    const av = (a[sortKey] as number | null) ?? -Infinity;
    const bv = (b[sortKey] as number | null) ?? -Infinity;
    return desc ? bv - av : av - bv;
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function qualityColor(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function qualityBg(score: number | null) {
  if (score == null) return 'bg-muted';
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function fmtTime(sec: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function fmtRevenue(v: number) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${Math.round(v)}%`;
}

function AgentInitials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  return <span className="text-sm font-bold text-white uppercase">{initials}</span>;
}

// ── podium card ───────────────────────────────────────────────────────────────

const PODIUM = [
  { rank: 1, icon: <Trophy className="h-5 w-5 text-yellow-500" />, ring: 'ring-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: '1º lugar' },
  { rank: 2, icon: <Medal className="h-5 w-5 text-slate-400" />, ring: 'ring-slate-300', bg: 'bg-slate-50 dark:bg-slate-800/40', label: '2º lugar' },
  { rank: 3, icon: <Medal className="h-5 w-5 text-orange-400" />, ring: 'ring-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20', label: '3º lugar' },
];

function PodiumCard({ agent, rank }: { agent: AgentRanking; rank: number }) {
  const p = PODIUM.find(x => x.rank === rank)!;
  return (
    <Link
      to={`/agents/${agent.agent_id}`}
      className={cn('rounded-2xl border border-border p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow', p.bg)}
    >
      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        {p.icon} {p.label}
      </div>
      <div className={cn('h-14 w-14 rounded-full ring-2 flex items-center justify-center bg-primary', p.ring)}>
        <AgentInitials name={agent.agent_name} />
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-foreground">{agent.agent_name}</p>
        <p className={cn('text-xl font-black mt-1', qualityColor(agent.avg_ai_quality_score))}>
          {agent.avg_ai_quality_score ?? '—'}
          <span className="text-xs font-normal text-muted-foreground ml-1">/ 100</span>
        </p>
        <p className="text-xs text-muted-foreground">Qualidade IA</p>
      </div>
      <div className="w-full grid grid-cols-2 gap-2 text-center border-t border-border pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Conversas</p>
          <p className="text-sm font-bold text-foreground">{agent.total_conversations}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CSAT</p>
          <p className="text-sm font-bold text-foreground">{agent.avg_predicted_csat?.toFixed(1) ?? '—'}</p>
        </div>
      </div>
    </Link>
  );
}

// ── rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ position }: { position: number }) {
  if (position === 1) return <span className="text-yellow-500 font-black text-base">🥇</span>;
  if (position === 2) return <span className="text-slate-400 font-black text-base">🥈</span>;
  if (position === 3) return <span className="text-orange-400 font-black text-base">🥉</span>;
  return <span className="text-xs font-bold text-muted-foreground w-6 text-center">{position}º</span>;
}

// ── quality bar ───────────────────────────────────────────────────────────────

function QualityBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', qualityBg(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn('text-xs font-semibold tabular-nums', qualityColor(score))}>{score}</span>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Ranking() {
  const [sortKey, setSortKey] = useState<SortKey>('avg_ai_quality_score');
  const { data, isLoading } = useRanking();

  const currentSort = SORT_OPTIONS.find(o => o.key === sortKey)!;
  const sorted = sortRanking(data ?? [], sortKey, currentSort.desc);

  const top3 = sorted.slice(0, 3);
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Ranking de Atendentes
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Últimos 30 dias · atualizado pela view materializada</p>
        </div>

        {/* sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ordenar por</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-ring/40 focus:border-primary outline-none"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-52 bg-muted rounded-2xl animate-pulse" />)}
          </div>
          <div className="h-64 bg-muted rounded-2xl animate-pulse" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center text-muted-foreground">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado disponível. A view materializada pode precisar ser atualizada.</p>
        </div>
      ) : (
        <>
          {/* podium top 3 */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {top3.map((agent, i) => (
                <PodiumCard key={agent.agent_id} agent={agent} rank={i + 1} />
              ))}
            </div>
          )}

          {/* full table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Classificação completa</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-10">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Atendente</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><Star className="h-3 w-3" />Qualidade IA</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><MessageSquare className="h-3 w-3" />Conversas</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" />1ª Resp.</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />SLA</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><DollarSign className="h-3 w-3" />Receita</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">CSAT</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><BookOpen className="h-3 w-3" />Coaching</span>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" />Alertas</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map((agent, i) => (
                    <tr
                      key={agent.agent_id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <RankBadge position={i + 1} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/agents/${agent.agent_id}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <AgentInitials name={agent.agent_name} />
                          </div>
                          <span className="font-medium text-foreground">{agent.agent_name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <QualityBar score={agent.avg_ai_quality_score} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-foreground">{agent.total_conversations}</span>
                        <span className="text-xs text-muted-foreground ml-1">({agent.total_closed} fech.)</span>
                      </td>
                      <td className="px-4 py-3 text-center text-foreground font-medium">
                        {fmtTime(agent.avg_first_response_sec)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'font-medium',
                          agent.avg_sla_first_response_pct != null && agent.avg_sla_first_response_pct >= 80
                            ? 'text-green-600 dark:text-green-400'
                            : agent.avg_sla_first_response_pct != null && agent.avg_sla_first_response_pct >= 60
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-muted-foreground',
                        )}>
                          {fmtPct(agent.avg_sla_first_response_pct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-foreground">
                        {agent.total_revenue > 0 ? fmtRevenue(agent.total_revenue) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {agent.avg_predicted_csat != null ? (
                          <span className={cn(
                            'font-semibold',
                            agent.avg_predicted_csat >= 4 ? 'text-green-600 dark:text-green-400'
                              : agent.avg_predicted_csat >= 3 ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400',
                          )}>
                            {agent.avg_predicted_csat.toFixed(1)} ★
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {agent.coaching_needed_count > 0 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-medium">
                            {agent.coaching_needed_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {agent.open_alerts > 0 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                            {agent.open_alerts}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
