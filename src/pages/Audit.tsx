import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Brain, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import type { AIConversationAnalysis, Conversation, ConversationMetrics, SpamRiskEvent } from '../types';
import { CACHE } from '../config/constants';
import { channelLabel, cn, formatDateTime, formatSeconds, severityColor, stripAgentPrefix } from '../lib/utils';
import { downloadCsv } from '../lib/export';

type AuditWorstSlaRow = ConversationMetrics & {
  conversation?: Conversation;
};

function ErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="p-10 text-center text-muted-foreground">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm">{message}</p>
    </div>
  );
}

export default function Audit() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const { isBlockedPhone } = useBlockedPhones();

  const canReviewAudit = can('audit.review');

  const {
    data: worstSla,
    isLoading: isLoadingWorstSla,
    isError: isWorstSlaError,
    error: worstSlaError,
  } = useQuery<AuditWorstSlaRow[]>({
    queryKey: ['audit-worst-sla', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('metrics_conversation')
        .select('*, conversation:conversations!inner(id, channel, started_at, agent:agents(name), customer:customers(name, phone))')
        .eq('company_id', companyId)
        .not('first_response_time_sec', 'is', null)
        .order('first_response_time_sec', { ascending: false })
        .limit(20);

      if (error) throw error;
      const rows = (data ?? []) as AuditWorstSlaRow[];
      return rows.filter(r => !isBlockedPhone((r.conversation as any)?.customer?.phone));
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const {
    data: spamEvents,
    isLoading: isLoadingSpam,
    isError: isSpamError,
    error: spamError,
  } = useQuery<SpamRiskEvent[]>({
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
    enabled: !!companyId && canReviewAudit,
    staleTime: CACHE.STALE_TIME,
  });

  const {
    data: lowQuality,
    isLoading: isLoadingLowQuality,
    isError: isLowQualityError,
    error: lowQualityError,
  } = useQuery<AIConversationAnalysis[]>({
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
      const rows = (data ?? []) as AIConversationAnalysis[];
      return rows.filter(r => !isBlockedPhone((r.conversation as any)?.customer?.phone));
    },
    enabled: !!companyId && canReviewAudit,
    staleTime: CACHE.STALE_TIME,
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Auditoria & QA</h2>
            <p className="text-muted-foreground mt-1">Revise a qualidade do atendimento e identifique pontos de melhoria</p>
          </div>
          <button
            type="button"
            onClick={() => {
              downloadCsv('auditoria-qa.csv', [
                ...((worstSla ?? []).map((metric) => ({
                  tipo: 'sla',
                  cliente: stripAgentPrefix(metric.conversation?.customer?.name, metric.conversation?.agent?.name, metric.conversation?.customer?.phone),
                  canal: metric.conversation?.channel ? channelLabel(metric.conversation.channel) : '--',
                  atendente: metric.conversation?.agent?.name ?? '--',
                  tempo_resposta: formatSeconds(metric.first_response_time_sec),
                  sla: metric.sla_first_response_met,
                  data: metric.conversation?.started_at ?? '',
                }))),
                ...((lowQuality ?? []).map((analysis) => ({
                  tipo: 'qualidade_ia',
                  conversa: analysis.conversation_id,
                  atendente: analysis.agent?.name ?? '--',
                  score_ia: analysis.quality_score,
                  coaching: analysis.needs_coaching,
                  data: analysis.analyzed_at,
                }))),
              ]);
            }}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Conversas com Pior SLA</h3>
        </div>
        {isLoadingWorstSla ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
            ))}
          </div>
        ) : isWorstSlaError ? (
          <ErrorState
            title="Nao foi possivel carregar as conversas com pior SLA."
            message={worstSlaError instanceof Error ? worstSlaError.message : 'Verifique a consulta e as permissoes de leitura.'}
          />
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
                {worstSla.map((metric) => {
                  const conv = metric.conversation;
                  const frt = metric.first_response_time_sec;
                  const slaMet = metric.sla_first_response_met;

                  return (
                    <tr key={metric.id} className="hover:bg-muted">
                      <td className="px-6 py-3">
                        {conv?.id ? (
                          <Link to={`/conversations/${conv.id}`} className="text-primary hover:underline">
                            {stripAgentPrefix(conv.customer?.name, conv?.agent?.name, conv.customer?.phone)}
                          </Link>
                        ) : (
                          <span>{stripAgentPrefix(conv?.customer?.name, conv?.agent?.name, conv?.customer?.phone)}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {conv?.channel ? channelLabel(conv.channel) : '--'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{conv?.agent?.name ?? '--'}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        <span className={cn(frt != null && frt > 300 ? 'text-red-600' : 'text-foreground')}>
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
                        {slaMet == null && <span className="text-xs text-muted-foreground">--</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {conv?.started_at ? formatDateTime(conv.started_at) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canReviewAudit && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Baixa Qualidade IA</h3>
            <span className="ml-auto text-xs text-muted-foreground">Score abaixo de 70 ou coaching necessario</span>
          </div>
          {isLoadingLowQuality ? (
            <div className="p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
              ))}
            </div>
          ) : isLowQualityError ? (
            <ErrorState
              title="Nao foi possivel carregar a auditoria de IA."
              message={lowQualityError instanceof Error ? lowQualityError.message : 'Verifique a leitura de ai_conversation_analysis.'}
            />
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
                  {lowQuality.map((analysis) => {
                    const conv = analysis.conversation as Conversation | undefined;
                    const customerName = stripAgentPrefix(conv?.customer?.name, analysis.agent?.name, conv?.customer?.phone);

                    return (
                      <tr key={analysis.id} className="hover:bg-muted">
                        <td className="px-6 py-3">
                          <Link to={`/conversations/${analysis.conversation_id}`} className="text-primary hover:underline">
                            {customerName}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{analysis.agent?.name ?? '--'}</td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {conv?.channel ? channelLabel(conv.channel) : '--'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span
                            className={cn(
                              'font-semibold',
                              analysis.quality_score == null
                                ? 'text-muted-foreground'
                                : analysis.quality_score >= 70
                                  ? 'text-primary'
                                  : 'text-red-600',
                            )}
                          >
                            {analysis.quality_score ?? '--'}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap gap-1">
                            {analysis.training_tags?.slice(0, 3).map((tag) => (
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

      {canReviewAudit && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-semibold text-foreground">Riscos de Banimento Meta</h3>
            <span className="ml-auto text-xs text-muted-foreground">Mensagens identicas enviadas para multiplos clientes no WhatsApp</span>
          </div>
          {isLoadingSpam ? (
            <div className="p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded mb-2 animate-pulse" />
              ))}
            </div>
          ) : isSpamError ? (
            <ErrorState
              title="Nao foi possivel carregar os riscos de spam."
              message={spamError instanceof Error ? spamError.message : 'Verifique a leitura de spam_risk_events.'}
            />
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
                    <th className="px-6 py-3">Padrao</th>
                    <th className="px-6 py-3">Mensagem</th>
                    <th className="px-6 py-3 text-right">Clientes</th>
                    <th className="px-6 py-3">Risco</th>
                    <th className="px-6 py-3">Detectado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {spamEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-muted">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {evt.agent?.name ?? '--'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {evt.pattern_type === 'identical_message' && 'Mensagem identica'}
                        {evt.pattern_type === 'near_identical_message' && 'Mensagem similar'}
                        {evt.pattern_type === 'burst_volume' && 'Volume em rajada'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground max-w-xs truncate">
                        {evt.message_sample ? `"${evt.message_sample.slice(0, 60)}${evt.message_sample.length > 60 ? '...' : ''}"` : '--'}
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
