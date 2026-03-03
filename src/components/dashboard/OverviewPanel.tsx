import {
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  Hourglass,
  Star,
} from 'lucide-react';
import { MetricCard } from './MetricCard';
import { useDashboardOverview } from '../../hooks/useDashboardMetrics';
import { formatSeconds, formatPercent } from '../../lib/utils';

export function OverviewPanel() {
  const { data: overview, isLoading } = useDashboardOverview();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-2" />
            <div className="h-8 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Conversas (30 dias)"
        value={String(overview.conversations_30d ?? 0)}
        subtitle={`${overview.conversations_7d ?? 0} nos ultimos 7 dias`}
        icon={<MessageSquare className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Tempo Primeira Resposta"
        value={formatSeconds(overview.avg_frt_30d)}
        subtitle="Media 30 dias"
        icon={<Clock className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="SLA Atingido"
        value={formatPercent(overview.sla_pct_30d)}
        subtitle="Primeira resposta (30 dias)"
        icon={<CheckCircle className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Alertas Abertos"
        value={String(overview.open_alerts ?? 0)}
        subtitle={overview.critical_alerts ? `${overview.critical_alerts} criticos` : undefined}
        icon={<AlertTriangle className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Conversas Ativas"
        value={String(overview.active_conversations ?? 0)}
        icon={<Users className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Aguardando Resposta"
        value={String(overview.waiting_conversations ?? 0)}
        icon={<Hourglass className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Tempo de Resolucao"
        value={formatSeconds(overview.avg_resolution_30d)}
        subtitle="Media 30 dias"
        icon={<Clock className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Mensagens (30 dias)"
        value={String((overview.messages_in_30d ?? 0) + (overview.messages_out_30d ?? 0))}
        subtitle={`${overview.messages_in_30d ?? 0} recebidas / ${overview.messages_out_30d ?? 0} enviadas`}
        icon={<MessageSquare className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Satisfacao (CSAT)"
        value={overview.avg_predicted_csat_30d ? `${overview.avg_predicted_csat_30d.toFixed(1)}/5` : 'N/A'}
        subtitle="Predicao por IA (30 dias)"
        icon={<Star className="h-5 w-5 text-primary fill-primary" />}
      />
    </div>
  );
}
