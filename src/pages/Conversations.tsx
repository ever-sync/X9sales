import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { formatDateTime, channelLabel, cn } from '../lib/utils';
import { CACHE, PAGINATION } from '../config/constants';
import { MessageSquare, ChevronLeft, ChevronRight, User, ArrowRight, Thermometer, Clock, MessagesSquare } from 'lucide-react';
import type { Agent, Conversation } from '../types';

// ── local types ──────────────────────────────────────────────────────────────

interface ConvAIAnalysis {
  quality_score: number | null;
  training_tags: string[] | null;
  structured_analysis: { diagnosis?: { interest_level?: string } } | null;
}

interface ConvWithAnalysis extends Conversation {
  ai_analysis?: ConvAIAnalysis[];
}

// ── hooks ──────────────────────────────────────────────────────────────────

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

async function fetchAgentConversations(
  opts: AgentConvOptions,
): Promise<{ convs: ConvWithAnalysis[]; total: number }> {
  if (!opts.companyId) return { convs: [], total: 0 };

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
    .limit(opts.limit ?? 4);

  if (opts.status) q = q.eq('status', opts.status);
  if (opts.channel) q = q.eq('channel', opts.channel);

  const { data, error, count } = await q;
  if (error) throw error;
  return { convs: (data ?? []) as ConvWithAnalysis[], total: count ?? 0 };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  if (s === 'active') return 'Ativa';
  if (s === 'waiting') return 'Aguardando';
  if (s === 'closed') return 'Fechada';
  return s;
}

function statusClass(s: string) {
  if (s === 'active') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (s === 'waiting') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-muted text-muted-foreground';
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

function temperatureConfig(level: string | null | undefined): { label: string; cls: string } {
  if (level === 'alto') return { label: 'Quente', cls: 'text-red-500' };
  if (level === 'médio' || level === 'medio') return { label: 'Morno', cls: 'text-yellow-500' };
  if (level === 'baixo') return { label: 'Frio', cls: 'text-blue-500' };
  return { label: '—', cls: 'text-muted-foreground' };
}

// ── sub-components ───────────────────────────────────────────────────────────

function ConversationRow({ conv }: { conv: ConvWithAnalysis }) {
  const analysis = Array.isArray(conv.ai_analysis) ? conv.ai_analysis[0] : undefined;
  const metrics = Array.isArray(conv.metrics) ? conv.metrics[0] : (conv.metrics as any);

  const qualityScore = analysis?.quality_score ?? null;
  const interestLevel = analysis?.structured_analysis?.diagnosis?.interest_level ?? null;
  const tempCfg = temperatureConfig(interestLevel);
  const responseTime = metrics?.avg_response_gap_sec ?? metrics?.first_response_time_sec ?? null;
  const msgCount = (conv.message_count_in ?? 0) + (conv.message_count_out ?? 0);
  const tags = (analysis?.training_tags ?? []).slice(0, 2);

  return (
    <Link
      to={`/conversations/${conv.id}`}
      className="group px-5 py-4 flex gap-3 hover:bg-muted/40 transition-colors"
    >
      {/* icon */}
      <div className="h-9 w-9 bg-muted rounded-xl flex items-center justify-center shrink-0 mt-0.5">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* row 1: name + status + date */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground truncate">
            {conv.customer?.name ?? conv.customer?.phone ?? 'Cliente'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusClass(conv.status))}>
              {statusLabel(conv.status)}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:block">
              {conv.started_at ? formatDateTime(conv.started_at) : '—'}
            </span>
          </div>
        </div>

        {/* row 2: channel + metrics chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">{channelLabel(conv.channel)}</span>

          {/* temperatura */}
          {interestLevel && (
            <span className={cn('flex items-center gap-1 text-xs font-medium', tempCfg.cls)}>
              <Thermometer className="h-3 w-3" />
              {tempCfg.label}
            </span>
          )}

          {/* qualidade com mini-barra */}
          {qualityScore != null && (
            <div className="flex items-center gap-1.5">
              <span className={cn('text-xs font-bold tabular-nums', qualityColor(qualityScore))}>
                {qualityScore}
              </span>
              <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    qualityScore >= 80 ? 'bg-green-500' : qualityScore >= 60 ? 'bg-yellow-500' : 'bg-red-500',
                  )}
                  style={{ width: `${qualityScore}%` }}
                />
              </div>
            </div>
          )}

          {/* tempo de resposta */}
          {responseTime != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatResponseTime(responseTime)}
            </span>
          )}

          {/* total de msgs */}
          {msgCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessagesSquare className="h-3 w-3" />
              {msgCount}
            </span>
          )}
        </div>

        {/* row 3: training tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1.5">
            {tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium"
              >
                {tag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
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
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* header */}
      <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">{agent.name}</span>
          {!loading && (
            <span className="text-xs text-muted-foreground ml-2">
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

      {/* rows */}
      {loading ? (
        <div className="p-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : convs.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          Nenhuma conversa encontrada
        </div>
      ) : (
        <div className="divide-y divide-border">
          {convs.map(conv => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── flat list (single agent selected) ────────────────────────────────────────

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
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (status) q = q.eq('status', status);
      if (channel) q = q.eq('channel', channel);
      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { convs: (rows ?? []) as ConvWithAnalysis[], total: count ?? 0 };
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
        <div className="bg-card rounded-2xl border border-border p-6 space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : conversations.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhuma conversa encontrada
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
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
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

// ── grouped view (all agents, 4 each) ─────────────────────────────────────────

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

// ── main page ─────────────────────────────────────────────────────────────────

export default function Conversations() {
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');

  const { companyId } = useCompany();
  const { data: agentsData, isLoading: agentsLoading } = useAgents();
  const agents = agentsData ?? [];

  const selectClass =
    'text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-ring/40 focus:border-primary outline-none';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Conversas</h2>
        <p className="text-muted-foreground mt-1">Últimas conversas por atendente</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={agentId} onChange={e => setAgentId(e.target.value)} className={selectClass}>
          <option value="">Todos os atendentes</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
          <option value="">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="waiting">Aguardando</option>
          <option value="closed">Fechadas</option>
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

      {/* Content */}
      {agentsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 bg-muted rounded-2xl animate-pulse" />
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
