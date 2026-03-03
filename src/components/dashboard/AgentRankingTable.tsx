import { useAgentRanking } from '../../hooks/useDashboardMetrics';
import { formatSeconds, formatPercent, formatCurrency, cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { AlertTriangle, Trophy, Medal, Award, BookOpen, Star, ArrowRight } from 'lucide-react';

export function AgentRankingTable() {
  const { data: agents, isLoading } = useAgentRanking();

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="h-6 bg-secondary rounded w-40 mb-4 animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center text-muted-foreground">
        Nenhum dado de atendente disponivel
      </div>
    );
  }

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-4 w-4 text-primary" />;
    if (index === 1) return <Medal className="h-4 w-4 text-muted-foreground" />;
    if (index === 2) return <Award className="h-4 w-4 text-primary" />;
    return <span className="text-xs text-muted-foreground w-4 text-center">{index + 1}</span>;
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
            Ranking de Atendentes
          </p>
          <p className="text-[13px] font-semibold text-foreground mt-0.5">Últimos 30 dias</p>
        </div>
        <Link to="/agents" className="text-[12px] font-semibold text-primary hover:text-primary flex items-center gap-0.5">
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Atendente</th>
              <th className="px-6 py-3 text-right">Conversas</th>
              <th className="px-6 py-3 text-right">SLA %</th>
              <th className="px-6 py-3 text-right">Score IA</th>
              <th className="px-6 py-3 text-right">CSAT</th>
              <th className="px-6 py-3 text-right">Tempo Resp.</th>
              <th className="px-6 py-3 text-right">Msgs Enviadas</th>
              <th className="px-6 py-3 text-right">Negocios</th>
              <th className="px-6 py-3 text-right">Receita</th>
              <th className="px-6 py-3 text-center">Alertas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((agent, index) => (
              <tr key={agent.agent_id} className="hover:bg-muted transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center">
                    {getRankIcon(index)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Link
                    to={`/agents/${agent.agent_id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {agent.agent_name}
                  </Link>
                </td>
                <td className="px-6 py-4 text-right text-sm text-foreground">
                  {agent.total_conversations}
                  <span className="text-muted-foreground text-xs ml-1">
                    ({agent.total_closed} fechadas)
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      (agent.avg_sla_first_response_pct ?? 0) >= 90
                        ? 'text-primary'
                        : (agent.avg_sla_first_response_pct ?? 0) >= 70
                        ? 'text-primary'
                        : 'text-red-600'
                    )}
                  >
                    {formatPercent(agent.avg_sla_first_response_pct)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={cn(
                      'text-sm font-medium',
                      agent.avg_ai_quality_score == null ? 'text-muted-foreground' :
                      agent.avg_ai_quality_score >= 80 ? 'text-primary' :
                      agent.avg_ai_quality_score >= 60 ? 'text-primary' : 'text-red-600'
                    )}>
                      {agent.avg_ai_quality_score != null ? agent.avg_ai_quality_score : '—'}
                    </span>
                    {(agent.coaching_needed_count ?? 0) > 0 && (
                      <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                   <div className="flex items-center justify-end gap-1">
                      <span className="text-sm font-semibold text-foreground">
                        {agent.avg_predicted_csat ? agent.avg_predicted_csat.toFixed(1) : '—'}
                      </span>
                      {agent.avg_predicted_csat && agent.avg_predicted_csat >= 4 && (
                        <Star className="h-3 w-3 text-primary fill-primary" />
                      )}
                   </div>
                </td>
                <td className="px-6 py-4 text-right text-sm text-foreground">
                  {formatSeconds(agent.avg_first_response_sec)}
                </td>
                <td className="px-6 py-4 text-right text-sm text-foreground">
                  {agent.total_messages_sent}
                </td>
                <td className="px-6 py-4 text-right text-sm text-foreground">
                  <span className="text-primary">{agent.total_deals_won}W</span>
                  {' / '}
                  <span className="text-red-600">{agent.total_deals_lost}L</span>
                </td>
                <td className="px-6 py-4 text-right text-sm text-foreground">
                  {formatCurrency(agent.total_revenue)}
                </td>
                <td className="px-6 py-4 text-center">
                  {agent.open_alerts > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      {agent.open_alerts}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
