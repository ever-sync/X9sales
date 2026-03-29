import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Alert } from '../types';
import { CACHE } from '../config/constants';
import { cn, formatDateTime } from '../lib/utils';
import {
  AlertTriangle,
  Check,
  ShieldAlert,
  TrendingDown,
  BookOpen,
  Clock,
  CheckCircle2,
  XCircle,
  Bell,
  CheckSquare,
  Square,
} from 'lucide-react';

// ── humanização ───────────────────────────────────────────────────────────────

const ALERT_TYPE_INFO: Record<string, { label: string; explanation: string; action: string; icon: React.ElementType }> = {
  META_BAN_RISK: {
    label: 'Risco de banimento pelo WhatsApp',
    explanation: 'Este atendente enviou mensagens em padrão que pode ser detectado como spam pelo Meta. Se continuar, a conta pode ser bloqueada.',
    action: 'Verifique as últimas conversas e oriente o atendente a parar de enviar mensagens repetitivas ou em massa.',
    icon: ShieldAlert,
  },
  LOW_QUALITY_AGENT: {
    label: 'Qualidade de atendimento abaixo do esperado',
    explanation: 'A IA analisou as conversas deste atendente e identificou que a qualidade está consistentemente baixa — pode ser falta de empatia, respostas vagas ou demora em resolver.',
    action: 'Revise as conversas recentes deste atendente e considere uma sessão de feedback ou treinamento.',
    icon: TrendingDown,
  },
  COACHING_NEEDED: {
    label: 'Atendente precisa de orientação',
    explanation: 'A análise de IA detectou situações em que o atendente não soube conduzir bem a conversa — pode ter perdido uma oportunidade de venda ou deixado o cliente sem resposta satisfatória.',
    action: 'Abra o perfil do atendente, veja os pontos de melhoria identificados pela IA e marque uma conversa de alinhamento.',
    icon: BookOpen,
  },
  SLA_BREACH: {
    label: 'Tempo de resposta ultrapassado',
    explanation: 'Um cliente esperou mais do que o tempo máximo definido para receber uma resposta. Isso pode prejudicar a experiência e a imagem da empresa.',
    action: 'Verifique se o atendente estava sobrecarregado ou ausente. Considere redistribuir conversas ou revisar os limites de SLA.',
    icon: Clock,
  },
};

function getTypeInfo(alertType: string) {
  return ALERT_TYPE_INFO[alertType] ?? {
    label: alertType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    explanation: 'Um evento que requer atenção foi detectado.',
    action: 'Revise os detalhes do alerta e tome a ação necessária.',
    icon: AlertTriangle,
  };
}

const SEVERITY_CONFIG: Record<string, { label: string; badge: string; border: string; bg: string; iconBg: string; iconColor: string }> = {
  critical: {
    label: 'Crítico',
    badge: 'bg-red-600 text-white',
    border: 'border-l-red-600',
    bg: 'bg-red-50/40 dark:bg-red-950/15',
    iconBg: 'bg-red-600',
    iconColor: 'text-white',
  },
  high: {
    label: 'Alto',
    badge: 'bg-orange-500 text-white',
    border: 'border-l-orange-500',
    bg: 'bg-orange-50/40 dark:bg-orange-950/15',
    iconBg: 'bg-orange-500',
    iconColor: 'text-white',
  },
  medium: {
    label: 'Médio',
    badge: 'bg-yellow-500 text-white',
    border: 'border-l-yellow-500',
    bg: '',
    iconBg: 'bg-yellow-500',
    iconColor: 'text-white',
  },
  low: {
    label: 'Baixo',
    badge: 'bg-blue-500 text-white',
    border: 'border-l-blue-400',
    bg: '',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
  },
};

function getSeverityConfig(severity: string) {
  return SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  open: { label: 'Aberto', icon: XCircle, cls: 'text-red-600 dark:text-red-400' },
  acknowledged: { label: 'Visto', icon: CheckCircle2, cls: 'text-primary' },
  closed: { label: 'Resolvido', icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
}

// ── componente do card de alerta ──────────────────────────────────────────────

interface AlertCardProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  isPending: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function AlertCard({ alert, onAcknowledge, isPending, selected, onToggleSelect }: AlertCardProps) {
  const typeInfo = getTypeInfo(alert.alert_type);
  const sevCfg = getSeverityConfig(alert.severity);
  const statuCfg = getStatusConfig(alert.status);
  const Icon = typeInfo.icon;
  const StatusIcon = statuCfg.icon;

  return (
    <div className={cn(
      'px-6 py-5 border-l-4 flex items-start gap-4',
      sevCfg.border,
      sevCfg.bg,
      alert.status !== 'open' && 'opacity-60',
      selected && 'bg-primary/5',
    )}>
      {/* checkbox de seleção (apenas alertas abertos) */}
      {alert.status === 'open' && onToggleSelect && (
        <button
          type="button"
          onClick={() => onToggleSelect(alert.id)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          aria-label={selected ? 'Desselecionar alerta' : 'Selecionar alerta'}
        >
          {selected
            ? <CheckSquare className="h-4.5 w-4.5 text-primary" />
            : <Square className="h-4.5 w-4.5" />
          }
        </button>
      )}

      {/* ícone do tipo */}
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', sevCfg.iconBg)}>
        <Icon className={cn('h-5 w-5', sevCfg.iconColor)} />
      </div>

      {/* conteúdo */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* badges + data */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', sevCfg.badge)}>
            {sevCfg.label}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <StatusIcon className={cn('h-3.5 w-3.5', statuCfg.cls)} />
            {statuCfg.label}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDateTime(alert.created_at)}
          </span>
        </div>

        {/* título amigável */}
        <p className="text-sm font-semibold text-foreground">{typeInfo.label}</p>

        {/* atendente */}
        {(alert as any).agent?.name && (
          <p className="text-xs text-muted-foreground">
            Atendente: <span className="font-medium text-foreground">{(alert as any).agent.name}</span>
          </p>
        )}

        {/* explicação */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {alert.description ?? typeInfo.explanation}
        </p>

        {/* o que fazer */}
        {alert.status === 'open' && (
          <div className="flex items-start gap-2 bg-muted/60 rounded-lg px-3 py-2 mt-1">
            <Bell className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-foreground">
              <span className="font-semibold">O que fazer: </span>
              {typeInfo.action}
            </p>
          </div>
        )}
      </div>

      {/* botão reconhecer */}
      {alert.status === 'open' && (
        <button
          type="button"
          onClick={() => onAcknowledge(alert.id)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-2 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors shrink-0 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Marcar como visto
        </button>
      )}
    </div>
  );
}

// ── filtro de severidade ──────────────────────────────────────────────────────

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_FILTER_OPTIONS: { key: SeverityFilter; label: string; activeClass: string }[] = [
  { key: 'all', label: 'Todos', activeClass: 'bg-foreground text-background' },
  { key: 'critical', label: 'Crítico', activeClass: 'bg-red-600 text-white' },
  { key: 'high', label: 'Alto', activeClass: 'bg-orange-500 text-white' },
  { key: 'medium', label: 'Médio', activeClass: 'bg-yellow-500 text-white' },
  { key: 'low', label: 'Baixo', activeClass: 'bg-blue-500 text-white' },
];

// ── página principal ──────────────────────────────────────────────────────────

export default function Alerts() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['all-alerts', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('*, agent:agents(name)')
        .eq('company_id', companyId)
        .order('severity', { ascending: true }) // critical first (alphabetically c < h < l < m)
        .order('created_at', { ascending: false })
        .limit(200);
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

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'acknowledged' })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-open'] });
    },
  });

  const openAlerts = alerts.filter(a => a.status === 'open');
  const pastAlerts = alerts.filter(a => a.status !== 'open');

  const filteredOpenAlerts = severityFilter === 'all'
    ? openAlerts
    : openAlerts.filter(a => a.severity === severityFilter);

  // counts per severity for filter pills
  const severityCounts = openAlerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {});

  const allFilteredSelected = filteredOpenAlerts.length > 0 && filteredOpenAlerts.every(a => selectedIds.has(a.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredOpenAlerts.forEach(a => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredOpenAlerts.forEach(a => next.add(a.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedOpenIds = [...selectedIds].filter(id => openAlerts.some(a => a.id === id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Alertas</h2>
        <p className="text-muted-foreground mt-1">
          Situações que precisam da sua atenção. Quando resolver, marque como "visto".
        </p>
      </div>

      {/* summary badges */}
      {!isLoading && alerts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-foreground">{openAlerts.length}</span>
            <span className="text-muted-foreground">aberto{openAlerts.length !== 1 ? 's' : ''}</span>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{pastAlerts.length}</span>
            <span className="text-muted-foreground">resolvido{pastAlerts.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
          <p className="font-medium text-foreground">Tudo certo por aqui!</p>
          <p className="text-sm mt-1">Nenhum alerta no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* alertas abertos */}
          {openAlerts.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* cabeçalho + filtros */}
              <div className="px-6 py-4 border-b border-border bg-red-50/50 dark:bg-red-950/10 space-y-3">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Precisam de ação ({openAlerts.length})
                </h3>

                {/* filtro por severidade */}
                <div className="flex items-center gap-2 flex-wrap">
                  {SEVERITY_FILTER_OPTIONS.map(opt => {
                    const count = opt.key === 'all' ? openAlerts.length : (severityCounts[opt.key] ?? 0);
                    if (opt.key !== 'all' && count === 0) return null;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSeverityFilter(opt.key);
                          setSelectedIds(new Set());
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors border',
                          severityFilter === opt.key
                            ? cn(opt.activeClass, 'border-transparent')
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                        )}
                      >
                        {opt.label}
                        <span className={cn(
                          'rounded-full px-1.5 py-0 text-[10px] font-bold',
                          severityFilter === opt.key ? 'bg-white/20' : 'bg-muted',
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* barra de ações em massa */}
                {filteredOpenAlerts.length > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {allFilteredSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />
                      }
                      {allFilteredSelected ? 'Desselecionar todos' : 'Selecionar todos'}
                    </button>

                    {selectedOpenIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => bulkAcknowledgeMutation.mutate(selectedOpenIds)}
                        disabled={bulkAcknowledgeMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Marcar {selectedOpenIds.length} como visto{selectedOpenIds.length !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="divide-y divide-border">
                {filteredOpenAlerts.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhum alerta com severidade "{SEVERITY_CONFIG[severityFilter]?.label}" no momento.
                  </div>
                ) : (
                  filteredOpenAlerts.map(alert => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onAcknowledge={id => acknowledgeMutation.mutate(id)}
                      isPending={acknowledgeMutation.isPending || bulkAcknowledgeMutation.isPending}
                      selected={selectedIds.has(alert.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* alertas resolvidos / vistos */}
          {pastAlerts.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-6 py-3 border-b border-border bg-muted/40">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Histórico ({pastAlerts.length})
                </h3>
              </div>
              <div className="divide-y divide-border">
                {pastAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={id => acknowledgeMutation.mutate(id)}
                    isPending={acknowledgeMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
