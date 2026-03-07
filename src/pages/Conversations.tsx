import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Inbox,
  MessageSquare,
  MessagesSquare,
  Phone,
  Sparkles,
  Thermometer,
  User,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { channelLabel, cn, formatDateTime, normalizePhone } from '../lib/utils';
import { CACHE, PAGINATION } from '../config/constants';
import type { Agent, Conversation } from '../types';

interface ConvAIAnalysis {
  quality_score: number | null;
  training_tags: string[] | null;
  structured_analysis: { diagnosis?: { interest_level?: string } } | null;
}

interface ConvWithAnalysis extends Conversation {
  ai_analysis?: ConvAIAnalysis[];
  updated_at?: string;
}

function useAgents() {
  const { companyId } = useCompany();

  return useQuery<Agent[]>({
    queryKey: ['agents-list', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, avatar_url')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: !!companyId,
  });
}

interface AgentConvOptions {
  companyId: string | null;
  agentId: string;
  status?: string;
  channel?: string;
  limit?: number;
}

function agentConvQueryKey(opts: AgentConvOptions) {
  return ['agent-conversations-preview', opts.companyId, opts.agentId, opts.status, opts.channel, opts.limit];
}

function getConversationDedupKey(conv: ConvWithAnalysis): string {
  const phone = normalizePhone(conv.customer?.phone);
  if (phone) return `phone:${phone}`;
  if (conv.customer_id) return `customer:${conv.customer_id}`;
  const name = conv.customer?.name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `conversation:${conv.id}`;
}

async function fetchAgentConversations(
  opts: AgentConvOptions,
): Promise<{ convs: ConvWithAnalysis[]; total: number }> {
  if (!opts.companyId) return { convs: [], total: 0 };

  const desiredLimit = opts.limit ?? 4;

  let q = supabase
    .from('conversations')
    .select(
      `*,
       agent:agents(id,name,avatar_url),
       customer:customers(name,phone),
       metrics:metrics_conversation(avg_response_gap_sec, first_response_time_sec),
       ai_analysis:ai_conversation_analysis(quality_score, training_tags, structured_analysis)`,
      { count: 'exact' },
    )
    .eq('company_id', opts.companyId)
    .eq('agent_id', opts.agentId)
    .order('started_at', { ascending: false })
    .limit(100);

  if (opts.status) q = q.eq('status', opts.status);
  if (opts.channel) q = q.eq('channel', opts.channel);

  const { data, error } = await q;
  if (error) throw error;

  const allConvs = (data ?? []) as ConvWithAnalysis[];
  const seen = new Set<string>();
  const unique: ConvWithAnalysis[] = [];

  for (const conv of allConvs) {
    const key = getConversationDedupKey(conv);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(conv);
  }

  return { convs: unique.slice(0, desiredLimit), total: seen.size };
}

function statusLabel(status: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'waiting') return 'Aguardando';
  if (status === 'closed') return 'Fechada';
  if (status === 'snoozed') return 'Pausada';
  return status;
}

function statusClass(status: string) {
  if (status === 'active') return 'border border-green-300 bg-green-200 text-green-900 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (status === 'waiting') return 'border border-yellow-300 bg-yellow-200 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  if (status === 'closed') return 'border border-border bg-muted text-foreground';
  return 'border border-blue-300 bg-blue-200 text-blue-900 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
}

function formatResponseTime(sec: number | null | undefined): string {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function qualityColor(score: number | null | undefined) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function qualityLabel(score: number | null | undefined) {
  if (score == null) return 'Sem QA';
  if (score >= 80) return 'Alta';
  if (score >= 60) return 'Media';
  return 'Critica';
}

function temperatureConfig(level: string | null | undefined): { label: string; cls: string } {
  if (level === 'alto') return { label: 'Quente', cls: 'text-red-500' };
  if (level === 'médio' || level === 'medio') return { label: 'Morno', cls: 'text-yellow-500' };
  if (level === 'baixo') return { label: 'Frio', cls: 'text-blue-500' };
  return { label: '—', cls: 'text-muted-foreground' };
}

function formatPhoneDisplay(phone: string | null | undefined) {
  const digits = normalizePhone(phone);
  if (!digits) return 'Telefone não informado';
  if (digits.length === 13) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 12) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessagesSquare;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ConversationRow({ conv }: { conv: ConvWithAnalysis }) {
  const analysis = Array.isArray(conv.ai_analysis) ? conv.ai_analysis[0] : undefined;
  const metrics = Array.isArray(conv.metrics) ? conv.metrics[0] : (conv.metrics as Conversation['metrics'] | undefined);
  const qualityScore = analysis?.quality_score ?? null;
  const interestLevel = analysis?.structured_analysis?.diagnosis?.interest_level ?? null;
  const tempCfg = temperatureConfig(interestLevel);
  const responseTime = metrics?.avg_response_gap_sec ?? metrics?.first_response_time_sec ?? null;
  const inboundCount = conv.message_count_in ?? 0;
  const outboundCount = conv.message_count_out ?? 0;
  const msgCount = inboundCount + outboundCount;
  const tags = (analysis?.training_tags ?? []).slice(0, 2);
  const customerPhone = formatPhoneDisplay(conv.customer?.phone);
  const lastActivity = conv.updated_at ?? conv.started_at ?? conv.created_at;

  return (
    <Link
      to={`/conversations/${conv.id}`}
      className="group block px-5 py-4 transition-colors hover:bg-muted/35"
    >
      <div className="flex gap-4">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 transition-transform group-hover:scale-[1.03]">
          <MessageSquare className="h-4.5 w-4.5 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground md:text-[15px]">
                  {conv.customer?.name ?? conv.customer?.phone ?? 'Cliente'}
                </p>
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm', statusClass(conv.status))}>
                  {statusLabel(conv.status)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {customerPhone}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {conv.agent?.name ?? 'Sem atendente'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Inbox className="h-3.5 w-3.5" />
                  {channelLabel(conv.channel)}
                </span>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill icon={MessagesSquare} label="Total" value={String(msgCount)} />
              <StatPill icon={ArrowDownLeft} label="Receb." value={String(inboundCount)} />
              <StatPill icon={ArrowUpRight} label="Env." value={String(outboundCount)} />
              <StatPill icon={Clock} label="Resp." value={formatResponseTime(responseTime)} />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {interestLevel && (
                  <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium', tempCfg.cls)}>
                    <Thermometer className="h-3.5 w-3.5" />
                    Interesse {tempCfg.label}
                  </span>
                )}

                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  QA {qualityLabel(qualityScore)}
                </span>

                {qualityScore != null && (
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', qualityColor(qualityScore))}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Score {qualityScore}
                  </span>
                )}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/35 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ritmo da conversa</p>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Abertura</span>
                  <span className="font-medium text-foreground">{conv.started_at ? formatDateTime(conv.started_at) : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Última atividade</span>
                  <span className="font-medium text-foreground">{lastActivity ? formatDateTime(lastActivity) : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Fluxo</span>
                  <span className="font-medium text-foreground">{inboundCount} entrada / {outboundCount} saída</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

interface AgentCardProps {
  agent: Agent;
  convs: ConvWithAnalysis[];
  total: number;
  loading: boolean;
}

function AgentCard({ agent, convs, total, loading }: AgentCardProps) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-border/70 bg-card">
      <div className="flex items-center gap-3 border-b border-border/70 bg-muted/25 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground">{agent.name}</span>
          {!loading && (
            <span className="ml-2 text-xs text-muted-foreground">
              {total} conversa{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Link
          to={`/agents/${agent.id}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : convs.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Nenhuma conversa encontrada
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {convs.map(conv => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      )}
    </div>
  );
}

function FlatList({ agentId, status, channel }: { agentId: string; status: string; channel: string }) {
  const [page, setPage] = useState(1);
  const { companyId } = useCompany();
  const pageSize = PAGINATION.DEFAULT_PAGE_SIZE;

  const { data, isLoading } = useQuery({
    queryKey: ['flat-conversations', companyId, agentId, status, channel, page],
    queryFn: async () => {
      if (!companyId) return { convs: [] as ConvWithAnalysis[], total: 0 };

      let q = supabase
        .from('conversations')
        .select(
          `*,
           agent:agents(id,name,avatar_url),
           customer:customers(name,phone),
           metrics:metrics_conversation(avg_response_gap_sec, first_response_time_sec),
           ai_analysis:ai_conversation_analysis(quality_score, training_tags, structured_analysis)`,
          { count: 'exact' },
        )
        .eq('company_id', companyId)
        .eq('agent_id', agentId)
        .order('started_at', { ascending: false })
        .limit(500);

      if (status) q = q.eq('status', status);
      if (channel) q = q.eq('channel', channel);

      const { data: rows, error } = await q;
      if (error) throw error;

      const allConvs = (rows ?? []) as ConvWithAnalysis[];
      const seen = new Set<string>();
      const unique: ConvWithAnalysis[] = [];

      for (const conv of allConvs) {
        const key = getConversationDedupKey(conv);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(conv);
      }

      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return { convs: unique.slice(start, end), total: unique.length };
    },
    enabled: !!companyId && !!agentId,
    staleTime: CACHE.STALE_TIME,
  });

  const conversations = data?.convs ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <>
      <div className="text-sm text-muted-foreground">{totalCount} conversa{totalCount !== 1 ? 's' : ''}</div>

      {isLoading ? (
        <div className="rounded-[26px] border border-border/70 bg-card p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-[26px] border border-border/70 bg-card p-12 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nenhuma conversa encontrada
        </div>
      ) : (
        <div className="overflow-hidden rounded-[26px] border border-border/70 bg-card divide-y divide-border/70">
          {conversations.map(conv => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

function GroupedView({ agents, status, channel, companyId }: {
  agents: Agent[];
  status: string;
  channel: string;
  companyId: string | null;
}) {
  const results = useQueries({
    queries: agents.map(agent => ({
      queryKey: agentConvQueryKey({ companyId, agentId: agent.id, status: status || undefined, channel: channel || undefined }),
      queryFn: () => fetchAgentConversations({ companyId, agentId: agent.id, status: status || undefined, channel: channel || undefined }),
      enabled: !!companyId,
    })),
  });

  return (
    <div className="space-y-4">
      {agents.map((agent, i) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          convs={results[i]?.data?.convs ?? []}
          total={results[i]?.data?.total ?? 0}
          loading={results[i]?.isLoading ?? true}
        />
      ))}
    </div>
  );
}

function SummaryBar({
  agentsCount,
  activeFilters,
  selectedAgent,
}: {
  agentsCount: number;
  activeFilters: number;
  selectedAgent: Agent | null;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Modo</p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {selectedAgent ? 'Fila detalhada' : 'Panorama por atendente'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedAgent ? `Exibindo conversas centralizadas de ${selectedAgent.name}.` : 'Visão resumida das conversas mais recentes por carteira.'}
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Cobertura</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{agentsCount} atendente{agentsCount !== 1 ? 's' : ''}</p>
        <p className="mt-1 text-sm text-muted-foreground">Agrupamento por telefone, com uma conversa por cliente.</p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Filtros ativos</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{activeFilters}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeFilters > 0 ? 'A listagem já está refinada pelos filtros escolhidos.' : 'Nenhum filtro aplicado; mostrando o panorama completo.'}
        </p>
      </div>
    </div>
  );
}

export default function Conversations() {
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');

  const { companyId } = useCompany();
  const { data: agentsData, isLoading: agentsLoading } = useAgents();
  const agents = agentsData ?? [];
  const selectedAgent = agents.find(agent => agent.id === agentId) ?? null;
  const activeFilters = [agentId, status, channel].filter(Boolean).length;

  const selectClass =
    'min-w-[190px] rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Conversas</h2>
        <p className="mt-1 text-muted-foreground">
          Visualização consolidada por telefone, com mais contexto operacional em cada atendimento.
        </p>
      </div>

      <SummaryBar agentsCount={agents.length} activeFilters={activeFilters} selectedAgent={selectedAgent} />

      <div className="rounded-[28px] border border-border/70 bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Refinar conversas</p>
            <p className="text-xs text-muted-foreground">
              Filtre por atendente, status e canal sem perder o agrupamento por cliente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className={selectClass}>
            <option value="">Todos os atendentes</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
            <option value="">Todos os status</option>
            <option value="active">Ativas</option>
            <option value="waiting">Aguardando</option>
            <option value="closed">Fechadas</option>
            <option value="snoozed">Pausadas</option>
          </select>

          <select value={channel} onChange={e => setChannel(e.target.value)} className={selectClass}>
            <option value="">Todos os canais</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
            <option value="call">Telefone</option>
            <option value="chat">Chat</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>

      {agentsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : agentId ? (
        <FlatList agentId={agentId} status={status} channel={channel} />
      ) : (
        <GroupedView agents={agents} status={status} channel={channel} companyId={companyId} />
      )}
    </div>
  );
}
