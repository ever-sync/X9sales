import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import type {
  Conversation,
  AppEvent,
  DealSignal,
  Message as ConversationMessage,
  PlaybookRule,
  AIConversationAnalysis,
} from '../types';
import { CACHE } from '../config/constants';
import { MetricCard } from '../components/dashboard/MetricCard';
import { formatSeconds, formatDateTime, channelLabel, cn, getMessageDisplayContent } from '../lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft,
  User,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  FileText,
  CheckCircle,
  ArrowRightLeft,
  Phone,
  Mail,
  Copy,
  Sparkles,
  CheckCircle2,
  Brain,
  Target,
  Search,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Eye,
} from 'lucide-react';

function eventIcon(eventType: string) {
  switch (eventType) {
    case 'FIRST_RESPONSE':  return <Clock className="h-4 w-4 text-primary" />;
    case 'SLA_BREACH':      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    case 'WON':             return <TrendingUp className="h-4 w-4 text-primary" />;
    case 'LOST':            return <TrendingDown className="h-4 w-4 text-red-600" />;
    case 'HANDOFF':         return <ArrowRightLeft className="h-4 w-4 text-primary" />;
    case 'FOLLOWUP':        return <MessageSquare className="h-4 w-4 text-primary" />;
    case 'PROPOSAL_SENT':   return <FileText className="h-4 w-4 text-primary" />;
    default:                return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    FIRST_RESPONSE:  'Primeira Resposta',
    SLA_BREACH:      'Violação de SLA',
    WON:             'Negócio Ganho',
    LOST:            'Negócio Perdido',
    HANDOFF:         'Transferência',
    FOLLOWUP:        'Seguimento',
    PROPOSAL_SENT:   'Proposta Enviada',
  };
  return labels[eventType] ?? eventType.replace(/_/g, ' ');
}

function eventMeta(event: AppEvent): string | null {
  const m = event.meta;
  if (event.event_type === 'FIRST_RESPONSE' && m.first_response_time_sec != null) {
    return `${formatSeconds(m.first_response_time_sec as number)} de espera`;
  }
  if (event.event_type === 'SLA_BREACH' && m.first_response_time_sec != null) {
    return `${formatSeconds(m.first_response_time_sec as number)} (alvo: ${formatSeconds(m.sla_target_sec as number)})`;
  }
  return null;
}

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: conv, isLoading } = useQuery<Conversation | null>({
    queryKey: ['conversation', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('conversations')
        .select('*, agent:agents(*), customer:customers(*), metrics:metrics_conversation(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Conversation | null) ?? null;
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: events } = useQuery<AppEvent[]>({
    queryKey: ['conversation-events', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('conversation_id', id)
        .order('event_timestamp', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppEvent[];
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: messages, isLoading: isLoadingMessages } = useQuery<ConversationMessage[]>({
    queryKey: ['conversation-messages', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConversationMessage[];
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: dealSignal } = useQuery<DealSignal | null>({
    queryKey: ['conversation-deal-signal', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('deal_signals')
        .select('*')
        .eq('conversation_id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as DealSignal | null) ?? null;
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: activePlaybookRules } = useQuery<PlaybookRule[]>({
    queryKey: ['conversation-active-playbook-rules', conv?.company_id],
    queryFn: async () => {
      if (!conv?.company_id) return [];
      const { data, error } = await supabase
        .from('playbook_rules')
        .select('*')
        .eq('company_id', conv.company_id)
        .order('is_required', { ascending: false })
        .order('weight', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as PlaybookRule[];
    },
    enabled: !!conv?.company_id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: aiAnalysis } = useQuery<AIConversationAnalysis | null>({
    queryKey: ['conversation-ai-analysis', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('*')
        .eq('conversation_id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as AIConversationAnalysis | null) ?? null;
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const [expandedPillar, setExpandedPillar] = React.useState<string | null>(null);
  const [agentAvatarError, setAgentAvatarError] = React.useState(false);

  const coachingActionMutation = useMutation({
    mutationFn: async ({
      actionType,
      accepted,
      impactScore,
      meta,
    }: {
      actionType: string;
      accepted: boolean;
      impactScore?: number | null;
      meta?: Record<string, unknown>;
    }) => {
      if (!conv) throw new Error('Conversa nao carregada.');
      const { error } = await supabase.from('coaching_actions').insert({
        company_id: conv.company_id,
        conversation_id: conv.id,
        agent_id: conv.agent_id,
        action_type: actionType,
        accepted,
        applied_at: new Date().toISOString(),
        impact_score: impactScore ?? null,
        meta: meta ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-actions-page', conv?.company_id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">Conversa não encontrada.</p>
        <Link to="/conversations" className="text-primary hover:underline text-sm">
          Voltar para Conversas
        </Link>
      </div>
    );
  }

  const metrics = (conv as any).metrics;
  const agent   = conv.agent;
  const customer = conv.customer;

  const totalMessages = conv.message_count_in + conv.message_count_out;
  const slaMet = metrics?.sla_first_response_met;

  // Duration from started_at to closed_at (or now if still open)
  const durationSec = conv.started_at
    ? Math.floor(
        (new Date(conv.closed_at ?? new Date()).getTime() -
          new Date(conv.started_at).getTime()) / 1000
      )
    : null;

  const customerLabel = customer?.name ?? customer?.phone ?? 'Cliente';
  const customerInitials = customerLabel.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const handleCopySuggestion = async () => {
    if (!dealSignal?.suggested_reply) return;
    try {
      await navigator.clipboard.writeText(dealSignal.suggested_reply);
      toast.success('Resposta sugerida copiada.');
    } catch {
      toast.error('Nao foi possivel copiar a resposta sugerida.');
    }
  };

  const handleApplySuggestion = async () => {
    if (!dealSignal) return;
    try {
      await coachingActionMutation.mutateAsync({
        actionType: 'copilot_suggestion_applied',
        accepted: true,
        impactScore: dealSignal.close_probability ?? null,
        meta: {
          stage: dealSignal.stage,
          intent_level: dealSignal.intent_level,
          loss_risk_level: dealSignal.loss_risk_level,
        },
      });
      toast.success('Aplicacao da sugestao registrada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao registrar acao.');
    }
  };

  const handlePlaybookRuleDone = async (rule: PlaybookRule) => {
    try {
      await coachingActionMutation.mutateAsync({
        actionType: 'playbook_rule_completed',
        accepted: true,
        meta: {
          rule_id: rule.id,
          rule_type: rule.rule_type,
          rule_text: rule.rule_text,
        },
      });
      toast.success('Checklist registrada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao registrar checklist.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/conversations" className="p-2 hover:bg-muted rounded-lg transition-colors mt-1">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>

        <div className="flex items-center gap-3 flex-1">
          <div className="h-12 w-12 bg-accent rounded-full flex items-center justify-center shrink-0">
            <span className="text-primary font-semibold text-sm">{customerInitials || <User className="h-6 w-6" />}</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{customerLabel}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                conv.status === 'active'  ? 'bg-accent text-primary' :
                conv.status === 'waiting' ? 'bg-accent text-primary' :
                conv.status === 'closed'  ? 'bg-muted text-muted-foreground' :
                'bg-accent text-primary'
              )}>
                {conv.status === 'active'  ? 'Ativa' :
                 conv.status === 'waiting' ? 'Aguardando' :
                 conv.status === 'closed'  ? 'Encerrada' : conv.status}
              </span>
              <span className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full font-medium">
                {channelLabel(conv.channel)}
              </span>
              {conv.started_at && (
                <span className="text-xs text-muted-foreground">{formatDateTime(conv.started_at)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total de Mensagens"
          value={String(totalMessages)}
          subtitle={`${conv.message_count_in} recebidas · ${conv.message_count_out} enviadas`}
          icon={<MessageSquare className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Primeira Resposta"
          value={formatSeconds(metrics?.first_response_time_sec ?? null)}
          icon={<Clock className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="Tempo de Resolução"
          value={formatSeconds(metrics?.resolution_time_sec ?? durationSec)}
          subtitle={conv.status !== 'closed' ? 'Em andamento' : undefined}
          icon={<Clock className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="SLA"
          value={slaMet === true ? 'Atingido' : slaMet === false ? 'Violado' : '—'}
          icon={<CheckCircle className={cn('h-5 w-5', slaMet === true ? 'text-primary' : slaMet === false ? 'text-red-500' : 'text-muted-foreground')} />}
        />
      </div>

      {/* Agent & Customer info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Agent */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Atendente</h3>
          {agent ? (
            <div className="flex items-center gap-3">
              {agent.avatar_url && !agentAvatarError ? (
                <img src={agent.avatar_url} alt={agent.name} className="h-10 w-10 rounded-full object-cover" onError={() => setAgentAvatarError(true)} />
              ) : (
                <div className="h-10 w-10 bg-accent rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <Link
                  to={`/agents/${agent.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {agent.name}
                </Link>
                {agent.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />{agent.email}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Não atribuído</p>
          )}
        </div>

        {/* Customer */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Cliente</h3>
          {customer ? (
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">{customer.name ?? '—'}</p>
              {customer.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{customer.phone}
                </p>
              )}
              {customer.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />{customer.email}
                </p>
              )}
              {customer.external_id && (
                <p className="text-xs text-muted-foreground">ID: {customer.external_id}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Dados não disponíveis</p>
          )}
        </div>
      </div>

      {/* AI Quality Analysis */}
      {aiAnalysis && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Analise de Qualidade IA
            </h3>
            <span className="text-xs text-muted-foreground">
              {aiAnalysis.prompt_version} · {formatDateTime(aiAnalysis.analyzed_at)}
            </span>
          </div>

          {/* Score + Weighted Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-4">
              <div className={cn(
                'h-20 w-20 rounded-full flex items-center justify-center text-white font-bold text-2xl shrink-0',
                (aiAnalysis.quality_score ?? 0) >= 80 ? 'bg-primary' :
                (aiAnalysis.quality_score ?? 0) >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              )}>
                {aiAnalysis.quality_score ?? '—'}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Score Geral Ponderado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Comunicacao 30% · Investigacao 25% · Conducao 20% · Objecoes 15% · Fechamento 10%
                </p>
              </div>
            </div>

            {aiAnalysis.structured_analysis?.weighted_breakdown && (
              <div className="space-y-2">
                {[
                  { label: 'Comunicacao', value: aiAnalysis.structured_analysis.weighted_breakdown.communication_weighted, max: 30 },
                  { label: 'Investigacao', value: aiAnalysis.structured_analysis.weighted_breakdown.investigation_weighted, max: 25 },
                  { label: 'Conducao', value: aiAnalysis.structured_analysis.weighted_breakdown.steering_weighted, max: 20 },
                  { label: 'Objecoes', value: aiAnalysis.structured_analysis.weighted_breakdown.objections_weighted, max: 15 },
                  { label: 'Fechamento', value: aiAnalysis.structured_analysis.weighted_breakdown.closing_weighted, max: 10 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className="w-24 text-muted-foreground">{item.label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-medium text-foreground">{item.value}/{item.max}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diagnosis */}
          {aiAnalysis.structured_analysis?.diagnosis && aiAnalysis.structured_analysis.diagnosis.conversation_type && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Diagnostico</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-primary">
                  Tipo: {aiAnalysis.structured_analysis.diagnosis.conversation_type}
                </span>
                <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-primary">
                  Estagio: {aiAnalysis.structured_analysis.diagnosis.sales_stage}
                </span>
                <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-primary">
                  Intencao: {aiAnalysis.structured_analysis.diagnosis.customer_intent}
                </span>
                <span className={cn(
                  'rounded-full px-2.5 py-1 font-medium',
                  aiAnalysis.structured_analysis.diagnosis.interest_level === 'alto' ? 'bg-green-100 text-green-700' :
                  aiAnalysis.structured_analysis.diagnosis.interest_level === 'medio' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                )}>
                  Interesse: {aiAnalysis.structured_analysis.diagnosis.interest_level}
                </span>
              </div>
            </div>
          )}

          {/* Pillar Scores Grid */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Scores por Pilar</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Empatia', value: aiAnalysis.score_empathy, key: 'empathy' },
                { label: 'Profissionalismo', value: aiAnalysis.score_professionalism, key: 'professionalism' },
                { label: 'Clareza', value: aiAnalysis.score_clarity, key: 'clarity' },
                { label: 'Investigacao', value: aiAnalysis.score_investigation, key: 'investigation' },
                { label: 'Cond. Comercial', value: aiAnalysis.score_commercial_steering, key: 'commercial_steering' },
                { label: 'Objecoes', value: aiAnalysis.score_objection_handling, key: 'objection_handling' },
                { label: 'Rapport', value: aiAnalysis.score_rapport, key: 'rapport' },
                { label: 'Urgencia', value: aiAnalysis.score_urgency, key: 'urgency' },
                { label: 'Proposta Valor', value: aiAnalysis.score_value_proposition, key: 'value_proposition' },
                { label: 'Resolucao Conflito', value: aiAnalysis.score_conflict_resolution, key: 'conflict_resolution' },
              ].filter(p => p.value != null).map((pillar) => {
                const evidence = aiAnalysis.structured_analysis?.pillar_evidence?.[pillar.key];
                const isExpanded = expandedPillar === pillar.key;
                return (
                  <div
                    key={pillar.key}
                    className={cn(
                      'rounded-xl border border-border p-3 transition-colors',
                      evidence ? 'cursor-pointer hover:bg-muted/50' : ''
                    )}
                    onClick={() => evidence && setExpandedPillar(isExpanded ? null : pillar.key)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">{pillar.label}</span>
                      {evidence && (isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />)}
                    </div>
                    <div className="flex items-end gap-1">
                      <span className={cn(
                        'text-lg font-bold',
                        (pillar.value ?? 0) >= 8 ? 'text-primary' :
                        (pillar.value ?? 0) >= 6 ? 'text-yellow-600' : 'text-red-500'
                      )}>
                        {pillar.value}
                      </span>
                      <span className="text-xs text-muted-foreground mb-0.5">/10</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          (pillar.value ?? 0) >= 8 ? 'bg-primary' :
                          (pillar.value ?? 0) >= 6 ? 'bg-yellow-500' : 'bg-red-500'
                        )}
                        style={{ width: `${(pillar.value ?? 0) * 10}%` }}
                      />
                    </div>
                    {isExpanded && evidence && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                          <Eye className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="italic">&quot;{evidence}&quot;</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Strengths & Improvements */}
          {aiAnalysis.structured_analysis && (aiAnalysis.structured_analysis.strengths.length > 0 || aiAnalysis.structured_analysis.improvements.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiAnalysis.structured_analysis.strengths.length > 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2 flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5" /> Pontos Fortes
                  </p>
                  <ul className="space-y-1.5">
                    {aiAnalysis.structured_analysis.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-green-800 flex items-start gap-1.5">
                        <span className="text-green-500 mt-1">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.structured_analysis.improvements.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-1">
                    <ThumbsDown className="h-3.5 w-3.5" /> Pontos a Melhorar
                  </p>
                  <ul className="space-y-1.5">
                    {aiAnalysis.structured_analysis.improvements.map((s, i) => (
                      <li key={i} className="text-sm text-orange-800 flex items-start gap-1.5">
                        <span className="text-orange-500 mt-1">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Missed Opportunities */}
          {aiAnalysis.structured_analysis?.missed_opportunities && aiAnalysis.structured_analysis.missed_opportunities.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Target className="h-3.5 w-3.5" /> Oportunidades Perdidas
              </p>
              <div className="space-y-2">
                {aiAnalysis.structured_analysis.missed_opportunities.map((opp, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/50 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Turno #{opp.turn}
                      </span>
                      <span className={cn(
                        'text-[10px] font-semibold uppercase rounded-full px-2 py-0.5',
                        opp.impact === 'high' ? 'bg-red-100 text-red-700' :
                        opp.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-muted text-muted-foreground'
                      )}>
                        Impacto {opp.impact}
                      </span>
                    </div>
                    {opp.agent_message && (
                      <blockquote className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 mb-1.5">
                        &quot;{opp.agent_message}&quot;
                      </blockquote>
                    )}
                    <p className="text-sm text-foreground flex items-start gap-1">
                      <Search className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      {opp.missed_action}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coaching Tips & Tags */}
          {(aiAnalysis.coaching_tips?.length || aiAnalysis.training_tags?.length || aiAnalysis.structured_analysis?.failure_tags?.length) && (
            <div className="flex flex-wrap gap-2">
              {aiAnalysis.coaching_tips?.map((tip, i) => (
                <span key={`tip-${i}`} className="text-xs bg-accent text-primary rounded-full px-2.5 py-1">
                  {tip}
                </span>
              ))}
              {aiAnalysis.training_tags?.map((tag, i) => (
                <span key={`tag-${i}`} className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">
                  {tag}
                </span>
              ))}
              {aiAnalysis.structured_analysis?.failure_tags?.map((tag, i) => (
                <span key={`ftag-${i}`} className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-1">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revenue Copilot + Playbook checklist */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Copilot de Conversao
            </h3>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>

          {!dealSignal ? (
            <p className="text-sm text-muted-foreground">
              Ainda nao existe analise de Revenue Copilot para esta conversa.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-accent px-2 py-1 font-medium text-primary">
                  Estagio: {dealSignal.stage}
                </span>
                <span className="rounded-full bg-accent px-2 py-1 font-medium text-primary">
                  Intencao: {dealSignal.intent_level}
                </span>
                <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-700">
                  Risco: {dealSignal.loss_risk_level}
                </span>
              </div>

              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proxima melhor acao</p>
                <p className="text-sm text-foreground">{dealSignal.next_best_action ?? '--'}</p>
              </div>

              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resposta sugerida</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{dealSignal.suggested_reply ?? '--'}</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopySuggestion}
                  disabled={!dealSignal.suggested_reply}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar resposta
                </button>
                <button
                  type="button"
                  onClick={handleApplySuggestion}
                  disabled={coachingActionMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Marcar como aplicada
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Checklist de Playbook
          </h3>
          {!activePlaybookRules || activePlaybookRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma regra de playbook ativa disponivel.</p>
          ) : (
            <div className="space-y-2">
              {activePlaybookRules.slice(0, 8).map((rule) => (
                <div key={rule.id} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                      {rule.rule_type}
                    </span>
                    {rule.is_required && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                        obrigatoria
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-sm text-foreground">{rule.rule_text}</p>
                  <button
                    type="button"
                    onClick={() => handlePlaybookRuleDone(rule)}
                    disabled={coachingActionMutation.isPending}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    Registrar no coaching
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Mensagens</h3>
        </div>

        {isLoadingMessages ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Carregando mensagens...
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Nenhuma mensagem encontrada para esta conversa
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-3 bg-muted/40">
            {messages.map((msg) => {
              const isAgent = msg.sender_type === 'agent';
              const isSystem = msg.sender_type === 'system' || msg.sender_type === 'bot';
              const messageText = getMessageDisplayContent(msg);

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex',
                    isSystem ? 'justify-center' : isAgent ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[90%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 border',
                      isSystem
                        ? 'bg-muted text-muted-foreground border-border'
                        : isAgent
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-accent/40 text-muted-foreground border-transparent hover:bg-accent/80 hover:text-foreground'
                    )}
                  >
                    <p className="text-xs font-medium opacity-80 mb-1">
                      {isSystem ? 'Sistema' : isAgent ? (agent?.name ?? 'Atendente') : customerLabel}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{messageText}</p>
                    <p
                      className={cn(
                        'text-[11px] mt-1.5',
                        isSystem
                          ? 'text-muted-foreground'
                          : isAgent
                            ? 'text-primary-foreground'
                            : 'text-muted-foreground'
                      )}
                    >
                      {formatDateTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Events timeline */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Linha do Tempo</h3>
        </div>
        {!events || events.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Nenhum evento registrado para esta conversa
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((evt, idx) => {
              const meta = eventMeta(evt);
              return (
                <div key={evt.id} className="px-6 py-4 flex items-start gap-4">
                  {/* Vertical connector */}
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center',
                      evt.event_type === 'SLA_BREACH' || evt.event_type === 'LOST' ? 'bg-red-50' :
                      evt.event_type === 'WON' || evt.event_type === 'FIRST_RESPONSE' ? 'bg-accent' :
                      'bg-accent'
                    )}>
                      {eventIcon(evt.event_type)}
                    </div>
                    {idx < events.length - 1 && (
                      <div className="w-px h-4 bg-secondary mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-sm font-medium text-foreground">{eventLabel(evt.event_type)}</p>
                    {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(evt.event_timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
