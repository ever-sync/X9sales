import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import type {
  Conversation,
  AppEvent,
  DealSignal,
  Message as ConversationMessage,
  PlaybookRule,
} from '../types';
import { CACHE } from '../config/constants';
import { MetricCard } from '../components/dashboard/MetricCard';
import { formatSeconds, formatDateTime, channelLabel, cn } from '../lib/utils';
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
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="h-10 w-10 rounded-full object-cover" />
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
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
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
                          ? 'bg-primary text-white border-primary'
                          : 'bg-card text-foreground border-border'
                    )}
                  >
                    <p className="text-xs font-medium opacity-80 mb-1">
                      {isSystem ? 'Sistema' : isAgent ? (agent?.name ?? 'Atendente') : customerLabel}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
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
