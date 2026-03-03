import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import type { Conversation, SpamRiskEvent, AIConversationAnalysis } from '../types';
import { CACHE } from '../config/constants';
import { Link } from 'react-router-dom';
import { ClipboardCheck, AlertTriangle, ShieldAlert, Brain } from 'lucide-react';
import { formatDateTime, channelLabel, formatSeconds, cn, severityColor } from '../lib/utils';

export default function Audit() {
  const { companyId } = useCompany();
  const { isAtLeast } = usePermissions();

  const canSeeSpamRisk = isAtLeast('manager');

  // Fetch conversations with worst SLA for audit
  const { data: worstSla, isLoading } = useQuery<Conversation[]>({
    queryKey: ['audit-worst-sla', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('conversations')
        .select('*, agent:agents(name), customer:customers(name, phone), metrics:metrics_conversation(*)')
        .eq('company_id', companyId)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      // Sort by worst SLA
      return ((data ?? []) as Conversation[]).sort((a, b) => {
        const aFrt = (a.metrics as any)?.first_response_time_sec ?? 0;
        const bFrt = (b.metrics as any)?.first_response_time_sec ?? 0;
        return bFrt - aFrt;
      });
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: spamEvents, isLoading: isLoadingSpam } = useQuery<SpamRiskEvent[]>({
    queryKey: ['spam-risk-events', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('spam_risk_events')
        .select('*, agent:agents(name)')
        .eq('company_id', companyId)
        .order('detected_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SpamRiskEvent[];
    },
    enabled: !!companyId && canSeeSpamRisk,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: lowQuality, isLoading: isLoadingLowQuality } = useQuery<AIConversationAnalysis[]>({
    queryKey: ['audit-low-quality', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('*, agent:agents(name), conversation:conversations(channel, started_at, customer:customers(name, phone))')
        .eq('company_id', companyId)
        .or('needs_coaching.eq.true,quality_score.lt.70')
        .order('quality_score', { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AIConversationAnalysis[];
    },
    enabled: !!companyId && canSeeSpamRisk,
    staleTime: CACHE.STALE_TIME,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Auditoria & QA</h2>
        <p className="text-muted-foreground mt-1">Revise a qualidade do atendimento e identifique pontos de melhoria</p>
      </div>

      {/* Worst SLA */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Conversas com Pior SLA</h3>
        </div>
        {isLoading ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
            ))}
          </div>
        ) : !worstSla || worstSla.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            Nenhuma conversa para auditar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Canal</th>
                  <th className="px-6 py-3">Atendente</th>
                  <th className="px-6 py-3 text-right">Tempo Resp.</th>
                  <th className="px-6 py-3">SLA</th>
                  <th className="px-6 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {worstSla.map(conv => {
                  const frt = (conv.metrics as any)?.first_response_time_sec;
                  const slaMet = (conv.metrics as any)?.sla_first_response_met;
                  return (
                    <tr key={conv.id} className="hover:bg-muted">
                      <td className="px-6 py-3">
                        <Link to={`/conversations/${conv.id}`} className="text-primary hover:underline">
                          {conv.customer?.name ?? conv.customer?.phone ?? 'Cliente'}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{channelLabel(conv.channel)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{conv.agent?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        <span className={cn(frt && frt > 300 ? 'text-red-600' : 'text-foreground')}>
                          {formatSeconds(frt)}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {slaMet === true && (
                          <span className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full">OK</span>
                        )}
                        {slaMet === false && (
                          <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">Breach</span>
                        )}
                        {slaMet == null && <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {conv.started_at ? formatDateTime(conv.started_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Baixa Qualidade IA — visible to manager+ */}
      {canSeeSpamRisk && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Baixa Qualidade IA</h3>
            <span className="ml-auto text-xs text-muted-foreground">Score abaixo de 70 ou coaching necessário</span>
          </div>
          {isLoadingLowQuality ? (
            <div className="p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
              ))}
            </div>
          ) : !lowQuality || lowQuality.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              Nenhuma conversa com baixa qualidade detectada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-6 py-3">Conversa</th>
                    <th className="px-6 py-3">Atendente</th>
                    <th className="px-6 py-3">Canal</th>
                    <th className="px-6 py-3 text-right">Score IA</th>
                    <th className="px-6 py-3">Tags</th>
                    <th className="px-6 py-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lowQuality.map(analysis => {
                    const conv = analysis.conversation as any;
                    const customerName = conv?.customer?.name ?? conv?.customer?.phone ?? 'Cliente';
                    return (
                      <tr key={analysis.id} className="hover:bg-muted">
                        <td className="px-6 py-3">
                          <Link to={`/conversations/${analysis.conversation_id}`} className="text-primary hover:underline">
                            {customerName}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{analysis.agent?.name ?? '—'}</td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {conv?.channel ? channelLabel(conv.channel) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className={cn(
                            'font-semibold',
                            analysis.quality_score == null ? 'text-muted-foreground' :
                            analysis.quality_score >= 70 ? 'text-primary' : 'text-red-600'
                          )}>
                            {analysis.quality_score ?? '—'}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap gap-1">
                            {analysis.training_tags?.slice(0, 3).map(tag => (
                              <span key={tag} className="text-xs bg-accent text-primary px-1.5 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground text-xs">
                          {formatDateTime(analysis.analyzed_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Meta Ban Risk — visible to manager+ */}
      {canSeeSpamRisk && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-semibold text-foreground">Riscos de Banimento Meta</h3>
            <span className="ml-auto text-xs text-muted-foreground">Mensagens idênticas enviadas para múltiplos clientes no WhatsApp</span>
          </div>
          {isLoadingSpam ? (
            <div className="p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
              ))}
            </div>
          ) : !spamEvents || spamEvents.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              Nenhum risco de banimento detectado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-6 py-3">Atendente</th>
                    <th className="px-6 py-3">Padrão</th>
                    <th className="px-6 py-3">Mensagem</th>
                    <th className="px-6 py-3 text-right">Clientes</th>
                    <th className="px-6 py-3">Risco</th>
                    <th className="px-6 py-3">Detectado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {spamEvents.map(evt => (
                    <tr key={evt.id} className="hover:bg-muted">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {evt.agent?.name ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {evt.pattern_type === 'identical_message' && 'Mensagem idêntica'}
                        {evt.pattern_type === 'near_identical_message' && 'Mensagem similar'}
                        {evt.pattern_type === 'burst_volume' && 'Volume em rajada'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground max-w-xs truncate">
                        {evt.message_sample ? `"${evt.message_sample.slice(0, 60)}${evt.message_sample.length > 60 ? '...' : ''}"` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-foreground">
                        {evt.recipient_count}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', severityColor(evt.risk_level))}>
                          {evt.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {formatDateTime(evt.detected_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
