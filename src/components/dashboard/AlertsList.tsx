import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../integrations/supabase/client';
import { useCompany } from '../../contexts/CompanyContext';
import type { Alert } from '../../types';
import { CACHE } from '../../config/constants';
import { cn, severityColor, formatDateTime } from '../../lib/utils';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AlertsList() {
  const { companyId } = useCompany();

  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts-open', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('*, agent:agents(name)')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      return (data ?? []) as Alert[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="h-5 bg-muted rounded w-36 mb-4 animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-lg mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  const openCount = alerts?.length ?? 0;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between">
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Alertas Recentes
          </p>
          <p className="text-[28px] font-bold text-foreground leading-none">
            {openCount}
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">abertos sem reconhecimento</p>
        </div>
        <Link
          to="/alerts"
          className="text-[12px] font-semibold text-primary hover:text-primary flex items-center gap-0.5 mt-1"
        >
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* List */}
      {openCount === 0 ? (
        <div className="px-5 pb-5 text-center text-[13px] text-muted-foreground">
          Nenhum alerta aberto
        </div>
      ) : (
        <div className="divide-y divide-border overflow-y-auto max-h-[340px]">
          {alerts!.map(alert => (
            <div key={alert.id} className="px-5 py-3 hover:bg-muted/60 transition-colors">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className={cn(
                  'h-3.5 w-3.5 mt-0.5 shrink-0',
                  severityColor(alert.severity).split(' ')[0]
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      severityColor(alert.severity)
                    )}>
                      {alert.severity}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {alert.alert_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-foreground truncate">{alert.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(alert.created_at)}</span>
                    {(alert as any).agent?.name && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        — {(alert as any).agent.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
