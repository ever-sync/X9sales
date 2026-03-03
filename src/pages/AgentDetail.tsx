import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Agent, AgentDailyMetrics, AIConversationAnalysis } from '../types';
import { useConversations } from '../hooks/useConversations';
import { CACHE } from '../config/constants';
import { MetricCard } from '../components/dashboard/MetricCard';
import { formatSeconds, formatPercent, formatCurrency, formatDateTime, channelLabel, cn } from '../lib/utils';
import { ArrowLeft, User, Clock, CheckCircle, MessageSquare, TrendingUp, Brain, BookOpen, Copy, Check, Link2 } from 'lucide-react';

function ScoreBar({ value, max = 10 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = (value / max) * 100;
  const color = pct >= 80 ? 'bg-primary' : pct >= 60 ? 'bg-primary' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-4 text-right">{value}</span>
    </div>
  );
}

function WebhookCard({ webhookUrl }: { webhookUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [webhookUrl]);

  return (
    <div className="bg-card rounded-2xl border border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Integração UazAPI</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Cole esta URL no campo <span className="font-mono bg-muted px-1 rounded">Webhook URL</span> da instância deste atendente no UazAPI.
      </p>
      <div className="flex items-center gap-2 bg-muted border border-border rounded-xl px-3 py-2">
        <span className="flex-1 text-xs font-mono text-foreground break-all select-all">{webhookUrl}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar URL"
          className="shrink-0 p-1.5 hover:bg-secondary rounded-lg transition-colors"
        >
          {copied
            ? <Check className="h-4 w-4 text-primary" />
            : <Copy className="h-4 w-4 text-muted-foreground" />
          }
        </button>
      </div>
      {copied && <p className="text-xs text-primary mt-1">URL copiada!</p>}
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { companyId } = useCompany();

  const { data: agent } = useQuery<Agent | null>({
    queryKey: ['agent', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Agent | null) ?? null;
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: metrics } = useQuery<AgentDailyMetrics[]>({
    queryKey: ['agent-daily-metrics', id, companyId],
    queryFn: async () => {
      if (!id || !companyId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('metrics_agent_daily')
        .select('*')
        .eq('agent_id', id)
        .eq('company_id', companyId)
        .gte('metric_date', since.toISOString().split('T')[0])
        .order('metric_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentDailyMetrics[];
    },
    enabled: !!id && !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: aiAnalyses } = useQuery<AIConversationAnalysis[]>({
    queryKey: ['agent-ai-analyses', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('*, conversation:conversations(started_at, channel, customer:customers(name, phone))')
        .eq('agent_id', id)
        .order('analyzed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AIConversationAnalysis[];
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: conversationsData } = useConversations({ agentId: id, pageSize: 10 });

  // Aggregate metrics
  const totalConv = metrics?.reduce((s, m) => s + m.conversations_total, 0) ?? 0;
  const avgFrt = metrics && metrics.length > 0
    ? Math.floor(metrics.filter(m => m.avg_first_response_sec != null)
        .reduce((s, m) => s + (m.avg_first_response_sec ?? 0), 0) /
        Math.max(metrics.filter(m => m.avg_first_response_sec != null).length, 1))
    : null;
  const avgSla = metrics && metrics.length > 0
    ? metrics.filter(m => m.sla_first_response_pct != null)
        .reduce((s, m) => s + (m.sla_first_response_pct ?? 0), 0) /
        Math.max(metrics.filter(m => m.sla_first_response_pct != null).length, 1)
    : null;
  const totalRevenue = metrics?.reduce((s, m) => s + m.revenue, 0) ?? 0;

  // AI aggregates
  const scoredAnalyses = aiAnalyses?.filter(a => a.quality_score != null) ?? [];
  const avgQuality = scoredAnalyses.length > 0
    ? Math.round(scoredAnalyses.reduce((s, a) => s + (a.quality_score ?? 0), 0) / scoredAnalyses.length)
    : null;
  const avgEmpathy = scoredAnalyses.length > 0
    ? +(scoredAnalyses.reduce((s, a) => s + (a.score_empathy ?? 0), 0) / scoredAnalyses.length).toFixed(1)
    : null;
  const avgProfessionalism = scoredAnalyses.length > 0
    ? +(scoredAnalyses.reduce((s, a) => s + (a.score_professionalism ?? 0), 0) / scoredAnalyses.length).toFixed(1)
    : null;
  const avgClarity = scoredAnalyses.length > 0
    ? +(scoredAnalyses.reduce((s, a) => s + (a.score_clarity ?? 0), 0) / scoredAnalyses.length).toFixed(1)
    : null;

  const needsCoachingList = aiAnalyses?.filter(a => a.needs_coaching) ?? [];

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/agents"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div className="flex items-center gap-3">
          {agent.avatar_url ? (
            <img src={agent.avatar_url} alt={agent.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="h-12 w-12 bg-accent rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-foreground">{agent.name}</h2>
            {agent.email && <p className="text-muted-foreground">{agent.email}</p>}
          </div>
        </div>
      </div>

      {/* UazAPI webhook URL */}
      {(() => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        if (!supabaseUrl || !companyId) return null;
        if (!agent.external_id) {
          return (
            <div className="bg-accent border border-primary/30 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Link2 className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm text-primary">
                Este atendente não possui um <span className="font-mono font-semibold">ID Externo</span> configurado.
                Edite o registro no banco para definir um <code className="bg-accent px-1 rounded">external_id</code> e o webhook UazAPI será gerado automaticamente aqui.
              </p>
            </div>
          );
        }
        const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook?company_id=${companyId}&agent_id=${agent.external_id}`;
        return <WebhookCard webhookUrl={webhookUrl} />;
      })()}

      {/* Metrics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Conversas (30d)"
          value={String(totalConv)}
          icon={<MessageSquare className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Tempo Primeira Resp."
          value={formatSeconds(avgFrt)}
          icon={<Clock className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="SLA %"
          value={formatPercent(avgSla)}
          icon={<CheckCircle className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Receita (30d)"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        />
      </div>

      {/* AI Analysis section */}
      {aiAnalyses && aiAnalyses.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Análise IA</h3>
            <span className="ml-auto text-xs text-muted-foreground">{aiAnalyses.length} conversa{aiAnalyses.length !== 1 ? 's' : ''} analisada{aiAnalyses.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: score summary */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0',
                  avgQuality == null ? 'bg-muted text-muted-foreground' :
                  avgQuality >= 80 ? 'bg-accent text-primary' :
                  avgQuality >= 60 ? 'bg-accent text-primary' : 'bg-red-100 text-red-700'
                )}>
                  {avgQuality ?? '—'}
                </div>
                <div>
                  <p className="font-semibold text-foreground">Score Geral</p>
                  <p className="text-xs text-muted-foreground">Média das últimas {scoredAnalyses.length} análises</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Empatia</span>
                  <div className="flex-1"><ScoreBar value={avgEmpathy} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Profissionalismo</span>
                  <div className="flex-1"><ScoreBar value={avgProfessionalism} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Clareza</span>
                  <div className="flex-1"><ScoreBar value={avgClarity} /></div>
                </div>
              </div>
            </div>

            {/* Right: coaching tips if needed */}
            {needsCoachingList.length > 0 && (
              <div className="bg-accent rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Pontos para Desenvolver</p>
                </div>
                <ul className="space-y-1.5">
                  {needsCoachingList[0].coaching_tips?.map((tip, i) => (
                    <li key={i} className="text-xs text-primary flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
                {needsCoachingList[0].training_tags && needsCoachingList[0].training_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {needsCoachingList[0].training_tags.map(tag => (
                      <span key={tag} className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent AI analyses table */}
          <div className="border-t border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-6 py-3">Conversa</th>
                  <th className="px-6 py-3 text-right">Score</th>
                  <th className="px-6 py-3 text-right">Empatia</th>
                  <th className="px-6 py-3 text-right">Prof.</th>
                  <th className="px-6 py-3 text-right">Clareza</th>
                  <th className="px-6 py-3">Coaching</th>
                  <th className="px-6 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {aiAnalyses.map(analysis => {
                  const conv = analysis.conversation as any;
                  const customerName = conv?.customer?.name ?? conv?.customer?.phone ?? 'Cliente';
                  return (
                    <tr key={analysis.id} className="hover:bg-muted">
                      <td className="px-6 py-3">
                        <Link
                          to={`/conversations/${analysis.conversation_id}`}
                          className="text-primary hover:underline text-sm"
                        >
                          {customerName}
                        </Link>
                        {conv?.channel && (
                          <span className="ml-1 text-xs text-muted-foreground">{channelLabel(conv.channel)}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn(
                          'font-semibold',
                          analysis.quality_score == null ? 'text-muted-foreground' :
                          analysis.quality_score >= 80 ? 'text-primary' :
                          analysis.quality_score >= 60 ? 'text-primary' : 'text-red-600'
                        )}>
                          {analysis.quality_score ?? '—'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{analysis.score_empathy ?? '—'}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{analysis.score_professionalism ?? '—'}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{analysis.score_clarity ?? '—'}</td>
                      <td className="px-6 py-3">
                        {analysis.needs_coaching ? (
                          <span className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full">Sim</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {formatDateTime(analysis.analyzed_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent conversations */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Conversas Recentes</h3>
        </div>
        {conversationsData?.data && conversationsData.data.length > 0 ? (
          <div className="divide-y divide-border">
            {conversationsData.data.map(conv => (
              <Link
                key={conv.id}
                to={`/conversations/${conv.id}`}
                className="px-6 py-4 flex items-center justify-between hover:bg-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {conv.customer?.name ?? conv.customer?.phone ?? 'Cliente'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{channelLabel(conv.channel)}</span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full',
                      conv.status === 'active' ? 'bg-accent text-primary' :
                      conv.status === 'waiting' ? 'bg-accent text-primary' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {conv.status}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {conv.started_at ? formatDateTime(conv.started_at) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conv.message_count_in + conv.message_count_out} msgs
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Nenhuma conversa encontrada
          </div>
        )}
      </div>

      {/* Daily metrics table */}
      {metrics && metrics.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">Metricas Diarias</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3 text-right">Conversas</th>
                  <th className="px-6 py-3 text-right">SLA %</th>
                  <th className="px-6 py-3 text-right">FRT</th>
                  <th className="px-6 py-3 text-right">Msgs</th>
                  <th className="px-6 py-3 text-right">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.slice(0, 15).map(m => (
                  <tr key={m.metric_date} className="hover:bg-muted">
                    <td className="px-6 py-3 text-foreground">{m.metric_date}</td>
                    <td className="px-6 py-3 text-right text-foreground">{m.conversations_total}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn(
                        'font-medium',
                        (m.sla_first_response_pct ?? 0) >= 90 ? 'text-primary' :
                        (m.sla_first_response_pct ?? 0) >= 70 ? 'text-primary' : 'text-red-600'
                      )}>
                        {formatPercent(m.sla_first_response_pct)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-foreground">{formatSeconds(m.avg_first_response_sec)}</td>
                    <td className="px-6 py-3 text-right text-foreground">{m.messages_sent + m.messages_received}</td>
                    <td className="px-6 py-3 text-right text-foreground">{formatCurrency(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
