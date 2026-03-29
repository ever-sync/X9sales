import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Brain, MapPin, MessageSquare, Pencil, Plus, Search, Store, User, X } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import type { Agent, AgentRanking, Store as AgentStore } from '../types';
import { CACHE } from '../config/constants';
import { cn } from '../lib/utils';

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#EA580C'];
type AgentForm = { name: string; email: string; phone: string; storeId: string; external_id: string; password?: string };
const emptyForm: AgentForm = { name: '', email: '', phone: '', storeId: '', external_id: '', password: '' };
type AgentLiveStats = {
  agent_id: string;
  total_conversations: number;
  avg_ai_quality_score: number | null;
  open_alerts: number;
  avg_first_response_sec: number | null;
};

function agentColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function isUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function qualityColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function AgentAvatar({ agent, className }: { agent: Agent; className: string }) {
  const [imageError, setImageError] = useState(false);
  const color = agentColor(agent.name);
  const initials = agent.name.split(' ').map((chunk) => chunk[0]).slice(0, 2).join('').toUpperCase();

  if (agent.avatar_url && !imageError) {
    return (
      <img
        src={agent.avatar_url}
        alt={agent.name}
        className={className}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div
      className={cn('flex items-center justify-center font-bold text-white shadow-sm', className)}
      style={{ backgroundColor: color }}
    >
      {initials || <User className="h-6 w-6" />}
    </div>
  );
}
function formatSecondsCompact(seconds: number | null | undefined) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export default function Agents() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManageAgents = can('agents.view_all');

  const [showModal, setShowModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [storeError, setStoreError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ['agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from('agents').select('*, store:stores(id, company_id, name, is_active, created_at, updated_at)').eq('company_id', companyId).eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: stores = [] } = useQuery<AgentStore[]>({
    queryKey: ['agent-stores', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from('stores').select('*').eq('company_id', companyId).eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []) as AgentStore[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: rankingData = [] } = useQuery<AgentRanking[]>({
    queryKey: ['agent-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from('mv_agent_ranking').select('agent_id, total_conversations, avg_ai_quality_score, open_alerts, avg_first_response_sec').eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as AgentRanking[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: liveStats = [] } = useQuery<AgentLiveStats[]>({
    queryKey: ['agents-live-stats', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString();
      const sinceDate = sinceIso.split('T')[0];

      const [conversationsRes, qualityRes, alertsRes, frtRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('agent_id')
          .eq('company_id', companyId)
          .gte('started_at', sinceIso)
          .not('agent_id', 'is', null),
        supabase
          .from('ai_conversation_analysis')
          .select('agent_id, quality_score')
          .eq('company_id', companyId)
          .gte('analyzed_at', sinceIso)
          .not('agent_id', 'is', null)
          .not('quality_score', 'is', null),
        supabase
          .from('alerts')
          .select('agent_id')
          .eq('company_id', companyId)
          .eq('status', 'open')
          .not('agent_id', 'is', null),
        supabase
          .from('metrics_conversation')
          .select('agent_id, first_response_time_sec')
          .eq('company_id', companyId)
          .gte('conversation_date', sinceDate)
          .not('agent_id', 'is', null)
          .not('first_response_time_sec', 'is', null),
      ]);

      if (conversationsRes.error) throw conversationsRes.error;
      if (qualityRes.error) throw qualityRes.error;
      if (alertsRes.error) throw alertsRes.error;
      if (frtRes.error) throw frtRes.error;

      const stats = new Map<string, { total_conversations: number; open_alerts: number; quality_sum: number; quality_count: number; frt_sum: number; frt_count: number }>();
      const ensure = (agentId: string) => {
        const current = stats.get(agentId) ?? {
          total_conversations: 0,
          open_alerts: 0,
          quality_sum: 0,
          quality_count: 0,
          frt_sum: 0,
          frt_count: 0,
        };
        stats.set(agentId, current);
        return current;
      };

      for (const row of conversationsRes.data ?? []) {
        if (!row.agent_id) continue;
        ensure(row.agent_id).total_conversations += 1;
      }
      for (const row of qualityRes.data ?? []) {
        if (!row.agent_id || row.quality_score == null) continue;
        const current = ensure(row.agent_id);
        current.quality_sum += Number(row.quality_score);
        current.quality_count += 1;
      }
      for (const row of alertsRes.data ?? []) {
        if (!row.agent_id) continue;
        ensure(row.agent_id).open_alerts += 1;
      }
      for (const row of frtRes.data ?? []) {
        if (!row.agent_id || row.first_response_time_sec == null) continue;
        const current = ensure(row.agent_id);
        current.frt_sum += Number(row.first_response_time_sec);
        current.frt_count += 1;
      }

      return Array.from(stats.entries()).map(([agent_id, item]) => ({
        agent_id,
        total_conversations: item.total_conversations,
        open_alerts: item.open_alerts,
        avg_ai_quality_score: item.quality_count > 0 ? item.quality_sum / item.quality_count : null,
        avg_first_response_sec: item.frt_count > 0 ? item.frt_sum / item.frt_count : null,
      }));
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const rankingMap = useMemo(() => new Map(rankingData.map((item) => [item.agent_id, item])), [rankingData]);
  const liveStatsMap = useMemo(() => new Map(liveStats.map((item) => [item.agent_id, item])), [liveStats]);
  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((agent) => {
      if (storeFilter && agent.store?.name !== storeFilter) return false;
      if (!q) return true;
      return [agent.name, agent.email, agent.phone, agent.external_id, agent.store?.name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [agents, search, storeFilter]);
  const summary = useMemo(() => {
    const totalAgents = agents.length;
    const activeStores = new Set(agents.map((agent) => agent.store?.name).filter(Boolean)).size;
    const statsRows = agents.map((agent) => {
      const ranking = rankingMap.get(agent.id);
      const live = liveStatsMap.get(agent.id);
      return {
        open_alerts: ranking?.open_alerts ?? live?.open_alerts ?? 0,
        avg_ai_quality_score: ranking?.avg_ai_quality_score ?? live?.avg_ai_quality_score ?? null,
      };
    });
    const totalAlerts = statsRows.reduce((sum, item) => sum + (item.open_alerts ?? 0), 0);
    const scored = statsRows.filter((item) => item.avg_ai_quality_score != null);
    const avgQuality = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.avg_ai_quality_score ?? 0), 0) / scored.length) : null;
    return { totalAgents, activeStores, totalAlerts, avgQuality };
  }, [agents, liveStatsMap, rankingMap]);

  const closeModal = useCallback(() => { setShowModal(false); setEditingAgentId(null); setForm(emptyForm); setFormError(null); }, []);
  const closeStoreModal = useCallback(() => { setShowStoreModal(false); setStoreName(''); setStoreError(null); }, []);
  const openCreateModal = useCallback(() => { setEditingAgentId(null); setForm(emptyForm); setFormError(null); setShowModal(true); }, []);
  const openEditModal = useCallback((agent: Agent) => {
    setEditingAgentId(agent.id);
    setForm({ name: agent.name ?? '', email: agent.email ?? '', phone: agent.phone ?? '', storeId: agent.store_id ?? '', external_id: agent.external_id ?? '', password: '' });
    setFormError(null);
    setShowModal(true);
  }, []);

  const createAgent = useMutation({
    mutationFn: async (values: AgentForm) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      if (!values.storeId) throw new Error('Selecione a loja do atendente');
      
      const payload = {
        company_id: companyId,
        name: values.name.trim(),
        email: values.email.trim() || undefined,
        password: values.password?.trim() || undefined,
        phone: values.phone.trim() || undefined,
        store_id: values.storeId,
        external_id: values.external_id.trim() || undefined,
      };

      const { data, error } = await supabase.functions.invoke('create-agent-user', {
        body: payload
      });
      
      if (error) {
        console.error("Functions error:", error);
        throw new Error("Sessão expirada ou erro. Atualize a página e tente se o erro prosseguir.");
      }
      if (data?.error) throw new Error(data.error);
      
      return data.agent.id as string;
    },
    onSuccess: (id) => { queryClient.invalidateQueries({ queryKey: ['agents', companyId] }); closeModal(); navigate(`/agents/${id}`); },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateAgent = useMutation({
    mutationFn: async (values: AgentForm) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      if (!editingAgentId) throw new Error('Atendente não encontrado');
      if (!values.storeId) throw new Error('Selecione a loja do atendente');
      
      const payload = {
        company_id: companyId,
        agent_id: editingAgentId,
        name: values.name.trim(),
        email: values.email.trim() || undefined,
        password: values.password?.trim() || undefined,
        phone: values.phone.trim() || undefined,
        store_id: values.storeId,
      };

      const { data, error } = await supabase.functions.invoke('update-agent-user', {
        body: payload
      });
      
      if (error) {
        console.error("Functions error:", error);
        throw new Error("Falha no servidor. Se a sessão tiver expirado, por favor Dê F5 para recarregar a página e tentar de novo.");
      }
      if (data?.error) throw new Error(data.error);

    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['agents', companyId] }); queryClient.invalidateQueries({ queryKey: ['agent', editingAgentId] }); closeModal(); },
    onError: (error: Error) => setFormError(error.message),
  });

  const createStore = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const resolvedName = name.trim();
      if (!resolvedName) throw new Error('Informe o nome da loja');
      const { data, error } = await supabase.from('stores').insert({ company_id: companyId, name: resolvedName, is_active: true }).select('*').single();
      if (error) throw error;
      return data as AgentStore;
    },
    onSuccess: (store) => { queryClient.invalidateQueries({ queryKey: ['agent-stores', companyId] }); setStoreName(''); setStoreError(null); setShowStoreModal(false); setForm((current) => ({ ...current, storeId: store.id })); },
    onError: (error: Error) => setStoreError(error.message),
  });

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.name.trim()) return setFormError('Nome é obrigatório');
    if (!form.storeId) return setFormError('Loja é obrigatória');
    if (editingAgentId) return updateAgent.mutate(form);
    return createAgent.mutate(form);
  }, [createAgent, editingAgentId, form, updateAgent]);

  const handleStoreSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setStoreError(null);
    createStore.mutate(storeName);
  }, [createStore, storeName]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(211,254,24,0.18),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#f3f4f6_100%)] px-6 py-7 md:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Gestão de equipe</p>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-foreground">Atendentes</h2>
              <p className="mt-2 text-sm text-muted-foreground">Organize a equipe, acompanhe qualidade operacional e mantenha cada vendedor conectado à sua loja.</p>
            </div>
            {canManageAgents && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setShowStoreModal(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"><Store className="h-4 w-4" />Cadastrar loja</button><button type="button" onClick={openCreateModal} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-black shadow-sm hover:bg-primary/90"><Plus className="h-4 w-4" />Novo Atendente</button></div>}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={<User className="h-5 w-5" />} tone="primary" label="Equipe ativa" value={String(summary.totalAgents)} />
            <SummaryCard icon={<MapPin className="h-5 w-5" />} tone="sky" label="Lojas ativas" value={String(summary.activeStores)} />
            <SummaryCard icon={<Brain className="h-5 w-5" />} tone="amber" label="Qualidade média IA" value={summary.avgQuality != null ? String(summary.avgQuality) : '—'} />
            <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} tone="rose" label="Alertas abertos" value={String(summary.totalAlerts)} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, email, telefone, loja ou ID" className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary" /></label>
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="h-12 rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors focus:border-primary"><option value="">Todas as lojas</option>{stores.map((store) => <option key={store.id} value={store.name}>{store.name}</option>)}</select>
        </div>
      </section>

      {isLoading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, index) => <div key={index} className="rounded-[28px] border border-border bg-card p-5 shadow-sm animate-pulse"><div className="flex items-center gap-4"><div className="h-16 w-16 rounded-[22px] bg-muted" /><div className="flex-1 space-y-2"><div className="h-5 w-36 rounded bg-muted" /><div className="h-3 w-24 rounded bg-muted" /></div></div><div className="mt-5 grid grid-cols-3 gap-2"><div className="h-20 rounded-2xl bg-muted" /><div className="h-20 rounded-2xl bg-muted" /><div className="h-20 rounded-2xl bg-muted" /></div></div>)}</div> : filteredAgents.length === 0 ? (
        <div className="rounded-[28px] border border-border bg-card p-12 text-center shadow-sm">
          <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">Nenhum atendente encontrado para os filtros atuais.</p>
          {canManageAgents && <button type="button" onClick={openCreateModal} className="text-sm font-medium text-primary hover:underline">Criar primeiro atendente</button>}
        </div>
      ) : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredAgents.map((agent) => {
        const ranking = rankingMap.get(agent.id);
        const live = liveStatsMap.get(agent.id);
        const totalConversations = ranking?.total_conversations ?? live?.total_conversations ?? 0;
        const avgQuality = ranking?.avg_ai_quality_score ?? live?.avg_ai_quality_score ?? null;
        const openAlerts = ranking?.open_alerts ?? live?.open_alerts ?? 0;
        const avgFirstResponse = ranking?.avg_first_response_sec ?? live?.avg_first_response_sec ?? null;
        return (
          <Link key={agent.id} to={`/agents/${agent.id}`} className="group relative overflow-hidden rounded-[28px] border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg">
            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#d3fe18_0%,#b7f200_45%,rgba(211,254,24,0.05)_100%)]" />
            {canManageAgents && <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openEditModal(agent); }} className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Editar</button>}
            <div className="flex items-start gap-4 pr-20">
              <div className="relative shrink-0"><AgentAvatar agent={agent} className="h-16 w-16 rounded-[22px] border border-border object-cover" /><span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate text-[22px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">{agent.name}</p><span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Ativo</span></div>
                {agent.store?.name && <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{agent.store.name}</p>}
                <div className="mt-3 space-y-1.5">{agent.email ? <p className="truncate text-sm text-muted-foreground">{agent.email}</p> : agent.phone ? <p className="text-sm text-muted-foreground">{agent.phone}</p> : agent.external_id && !isUUID(agent.external_id) ? <p className="text-sm font-mono text-muted-foreground/80">{agent.external_id}</p> : <p className="text-sm text-muted-foreground">Sem contato principal informado</p>}<p className="text-xs text-muted-foreground">ID: <span className="font-mono">{agent.external_id && !isUUID(agent.external_id) ? agent.external_id : agent.id.slice(0, 8)}</span></p></div>
              </div>
              <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/80 pt-4">
              <MetricMini icon={<MessageSquare className="h-3.5 w-3.5" />} label="Conversas" value={String(totalConversations)} />
              <MetricMini icon={<Brain className="h-3.5 w-3.5" />} label="Qualidade" value={avgQuality != null ? String(Math.round(avgQuality)) : '—'} valueClass={avgQuality != null ? qualityColor(avgQuality) : 'text-muted-foreground'} />
              <MetricMini icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Alertas" value={String(openAlerts)} valueClass={openAlerts > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Primeira resposta média</p><p className="mt-1 text-sm font-semibold text-foreground">{formatSecondsCompact(avgFirstResponse)}</p></div><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status operacional</p><p className={cn('mt-1 text-sm font-semibold', openAlerts > 0 ? 'text-amber-600' : 'text-emerald-600')}>{openAlerts > 0 ? 'Exige atenção' : 'Operação saudável'}</p></div></div>
          </Link>
        );
      })}</div>}

      {showStoreModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"><div className="w-full max-w-md rounded-2xl bg-card shadow-xl"><div className="flex items-center justify-between border-b border-border px-6 py-4"><h3 className="text-lg font-semibold text-foreground">Cadastrar loja</h3><button type="button" onClick={closeStoreModal} aria-label="Fechar" className="rounded-lg p-1 transition-colors hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button></div><form onSubmit={handleStoreSubmit} className="space-y-4 p-6"><div><label className="mb-1 block text-sm font-medium text-foreground">Nome da loja <span className="text-red-500">*</span></label><input type="text" value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Ex: Loja Centro" className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" /></div>{storeError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{storeError}</p>}<div className="flex gap-3 pt-2"><button type="button" onClick={closeStoreModal} className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button><button type="submit" disabled={createStore.isPending} className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-black transition-colors hover:bg-primary/90 disabled:opacity-60">{createStore.isPending ? 'Salvando...' : 'Salvar loja'}</button></div></form></div></div>}

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"><div className="w-full max-w-md rounded-2xl bg-card shadow-xl"><div className="flex items-center justify-between border-b border-border px-6 py-4"><h3 className="text-lg font-semibold text-foreground">{editingAgentId ? 'Editar Atendente' : 'Novo Atendente'}</h3><button type="button" onClick={closeModal} aria-label="Fechar" className="rounded-lg p-1 transition-colors hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button></div><form onSubmit={handleSubmit} className="space-y-4 p-6"><div><label className="mb-1 block text-sm font-medium text-foreground">Nome <span className="text-red-500">*</span></label><input type="text" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex: Ana Lima" className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" /></div><div><label className="mb-1 block text-sm font-medium text-foreground">Email</label><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="ana@empresa.com" className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" /></div><div><label className="mb-1 block text-sm font-medium text-foreground">Senha de acesso<span className="ml-1 text-xs font-normal text-muted-foreground">{editingAgentId ? '(Deixe em branco para manter a atual)' : '(Obrigatória junto com e-mail)'}</span></label><input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={editingAgentId ? "Nova senha forte" : "Senha do vendedor"} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" /></div><div><label className="mb-1 block text-sm font-medium text-foreground">Telefone</label><input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="5511999999999" className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35" /></div><div><div className="mb-1 flex items-center justify-between gap-2"><label className="block text-sm font-medium text-foreground">Loja <span className="text-red-500">*</span></label><button type="button" onClick={() => setShowStoreModal(true)} className="text-xs font-semibold text-primary hover:underline">Cadastrar loja</button></div><select value={form.storeId} onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))} className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"><option value="">Selecione a loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div><div><label className="mb-1 block text-sm font-medium text-foreground">ID Externo<span className="ml-1 text-xs font-normal text-muted-foreground">{editingAgentId ? '(não pode ser alterado depois de criado)' : '(deixe em branco para gerar automaticamente)'}</span></label><input type="text" value={form.external_id} onChange={(event) => setForm((current) => ({ ...current, external_id: event.target.value }))} placeholder="ag01, ag02... ou UUID" disabled={!!editingAgentId} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" /><p className="mt-1 text-xs text-muted-foreground">Usado para identificar este atendente nos webhooks do UazAPI.</p></div>{formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}<div className="flex gap-3 pt-2"><button type="button" onClick={closeModal} className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancelar</button><button type="submit" disabled={createAgent.isPending || updateAgent.isPending} className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-black transition-colors hover:bg-primary/90 disabled:opacity-60">{editingAgentId ? (updateAgent.isPending ? 'Salvando...' : 'Salvar alterações') : (createAgent.isPending ? 'Criando...' : 'Criar Atendente')}</button></div></form></div></div>}
    </div>
  );
}

function SummaryCard({ icon, tone, label, value }: { icon: React.ReactNode; tone: 'primary' | 'sky' | 'amber' | 'rose'; label: string; value: string }) {
  const toneMap = {
    primary: 'bg-primary/15 text-foreground',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
  } as const;
  return <div className="rounded-[24px] border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur"><div className="flex items-center gap-3"><div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', toneMap[tone])}>{icon}</div><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-foreground">{value}</p></div></div></div>;
}

function MetricMini({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return <div className="rounded-2xl bg-muted/35 px-3 py-3"><div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</p></div><p className={cn('mt-2 text-lg font-bold text-foreground', valueClass)}>{value}</p></div>;
}
