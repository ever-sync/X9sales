import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Alert } from '../types';
import { CACHE } from '../config/constants';
import { cn, severityColor, formatDateTime } from '../lib/utils';
import { AlertTriangle, Check, ShieldAlert, TrendingDown, BookOpen } from 'lucide-react';

function AlertTypeIcon({ alertType, className }: { alertType: string; className?: string }) {
  if (alertType === 'META_BAN_RISK') return <ShieldAlert className={className} />;
  if (alertType === 'LOW_QUALITY_AGENT') return <TrendingDown className={className} />;
  if (alertType === 'COACHING_NEEDED') return <BookOpen className={className} />;
  return <AlertTriangle className={className} />;
}

export default function Alerts() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ['all-alerts', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('*, agent:agents(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Alert[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'acknowledged' })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-open'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Alertas</h2>
        <p className="text-muted-foreground mt-1">Alertas de SLA, inatividade e eventos criticos</p>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded mb-2 animate-pulse" />
            ))}
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            Nenhum alerta encontrado
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map(alert => (
              <div key={alert.id} className="px-6 py-4 flex items-start gap-4 hover:bg-muted transition-colors">
                <AlertTypeIcon alertType={alert.alert_type} className={cn('h-5 w-5 mt-0.5 shrink-0', severityColor(alert.severity).split(' ')[0])} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', severityColor(alert.severity))}>
                      {alert.severity}
                    </span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      alert.status === 'open' ? 'bg-red-50 text-red-700' :
                      alert.status === 'acknowledged' ? 'bg-accent text-primary' :
                      'bg-accent text-primary'
                    )}>
                      {alert.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{alert.alert_type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1">{alert.title}</p>
                  {alert.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{formatDateTime(alert.created_at)}</span>
                    {(alert as any).agent?.name && (
                      <span className="text-xs text-muted-foreground">Atendente: {(alert as any).agent.name}</span>
                    )}
                  </div>
                </div>
                {alert.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => acknowledgeMutation.mutate(alert.id)}
                    disabled={acknowledgeMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary bg-accent px-3 py-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Reconhecer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
