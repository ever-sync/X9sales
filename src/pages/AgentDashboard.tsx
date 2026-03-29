import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  Clock,
  CheckCircle2,
  ShieldAlert,
  BookOpen,
  ChevronRight,
  Target,
  Medal,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { useAuth } from '../hooks/useAuth';

const COLORS = {
  lime: '#D3FE18',
  purple: '#5945FD',
  card: '#FFFFFF',
  line: '#E2E8F0',
  text: '#0F172A',
  soft: '#64748B',
  danger: '#EF4444',
  warning: '#F59E0B',
};

export default function AgentDashboard() {
  const { company, isLoading: companyLoading } = useCompany();
  const { user } = useAuth();

  // Buscar qual é o agent ID deste usuário na empresa atual
  const { data: myAgent, isLoading: agentLoading } = useQuery({
    queryKey: ['my-agent-profile', company?.id, user?.id],
    queryFn: async () => {
      if (!company?.id || !user?.id) return null;
      // Procura com base no email (comum em SaaS B2B) ou vinculação
      if (!user.email) return null;
      
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, avatar_url')
        .eq('company_id', company.id)
        .eq('email', user.email)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!company?.id && !!user?.id,
    staleTime: CACHE.STALE_TIME,
  });

  const agentId = myAgent?.id;

  // Buscar métricas SLA do mês deste agente
  const slaMetricsQuery = useQuery({
    queryKey: ['agent-dashboard-sla', company?.id, agentId],
    queryFn: async () => {
      if (!company?.id || !agentId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('metrics_conversation')
        .select('sla_first_response_met')
        .eq('company_id', company.id)
        .eq('agent_id', agentId)
        .gte('conversation_date', since.toISOString());
      
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!company?.id && !!agentId,
    staleTime: CACHE.STALE_TIME,
  });

  // Buscar notas IA do agente no mês
  const scoreMetricsQuery = useQuery({
    queryKey: ['agent-dashboard-score', company?.id, agentId],
    queryFn: async () => {
      if (!company?.id || !agentId) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('quality_score, needs_coaching')
        .eq('company_id', company.id)
        .eq('agent_id', agentId)
        .gte('analyzed_at', since.toISOString())
        .not('quality_score', 'is', null);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!company?.id && !!agentId,
    staleTime: CACHE.STALE_TIME,
  });

  // Buscar alertas abertos do agente
  const alertsQuery = useQuery({
    queryKey: ['agent-dashboard-alerts', company?.id, agentId],
    queryFn: async () => {
      if (!company?.id || !agentId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('company_id', company.id)
        .eq('agent_id', agentId)
        .eq('status', 'open')
        .order('severity', { ascending: true })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!company?.id && !!agentId,
    staleTime: CACHE.STALE_TIME,
  });

  const isLoading = companyLoading || agentLoading || slaMetricsQuery.isLoading || scoreMetricsQuery.isLoading || alertsQuery.isLoading;

  const slaPct = useMemo(() => {
    const data = slaMetricsQuery.data ?? [];
    if (data.length === 0) return 0;
    const met = data.filter(r => r.sla_first_response_met).length;
    return Math.round((met / data.length) * 100);
  }, [slaMetricsQuery.data]);

  const avgScore = useMemo(() => {
    const data = scoreMetricsQuery.data ?? [];
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, r) => acc + (r.quality_score ?? 0), 0);
    return Math.round(sum / data.length);
  }, [scoreMetricsQuery.data]);

  const coachingNeededCount = useMemo(() => {
    const data = scoreMetricsQuery.data ?? [];
    return data.filter(r => r.needs_coaching).length;
  }, [scoreMetricsQuery.data]);

  const pieDataSLA = [
    { name: 'Dentro', value: slaPct, color: COLORS.lime },
    { name: 'Fora', value: 100 - slaPct, color: COLORS.purple },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
          <h2 className="text-lg font-bold">Perfil de Vendedor não localizado</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Não encontramos um perfil de Atendente (Agent) associado ao seu e-mail ({user?.email}) nesta empresa. 
            Contate o administrador para vincular seu perfil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.03em] text-foreground">
          Olá, {myAgent?.name?.split(' ')[0] ?? 'Vendedor'}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe o desempenho dos seus atendimentos e metas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Card de Score de Qualidade */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground">Nota de Qualidade IA</h3>
            <div className="p-1.5 bg-muted rounded-full">
              <Medal size={16} className="text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-5xl font-black tracking-tighter ${avgScore >= 80 ? 'text-green-500' : avgScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
              {avgScore}
            </span>
            <span className="pb-1 text-sm font-semibold text-muted-foreground">/ 100</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            Média de qualidade das suas conversas avaliadas nos últimos 30 dias.
          </p>
        </section>

        {/* Card de SLA */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-foreground">SLA Cumprido (Mês)</h3>
            <div className="p-1.5 bg-muted rounded-full">
              <Clock size={16} className="text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="h-24 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieDataSLA}
                    innerRadius={30}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieDataSLA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <span className="text-4xl font-black tracking-tight text-foreground">{slaPct}%</span>
              <p className="text-sm font-medium text-muted-foreground mt-1">no tempo estipulado</p>
            </div>
          </div>
        </section>

        {/* Card de Atenção */}
        <section className="rounded-3xl border p-6 shadow-sm flex flex-col justify-between bg-red-50/20 dark:bg-red-950/20 border-red-500/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Pontos de Atenção</h3>
            <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-full">
              <Target size={16} className="text-red-600 dark:text-red-400" />
            </div>
          </div>
          
          <div className="mt-4">
            <span className="text-4xl font-black tracking-tight text-foreground">{coachingNeededCount}</span>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              conversas precisam de revisão
            </p>
          </div>
          
          <Link to="/conversations" className="mt-4 text-sm font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1">
            Ver minhas conversas <ChevronRight size={14} />
          </Link>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        {/* Alertas Recentes */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">Meus Alertas Abertos</h3>
            <Link to="/alerts" className="text-sm rounded-full bg-muted/50 px-3 py-1 font-semibold text-muted-foreground inline-flex items-center hover:bg-muted transition-colors">
              Gerenciar
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {alertsQuery.data?.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto h-8 w-8 text-green-500 opacity-60 mb-2" />
                Nenhum alerta pendente. Excelente trabalho!
              </div>
            ) : (
              alertsQuery.data?.map((alert) => (
                <div key={alert.id} className="py-4 flex gap-3 items-start">
                  <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 shrink-0">
                    <ShieldAlert size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {alert.alert_type === 'SLA_BREACH' ? 'Quebra de SLA' : alert.alert_type === 'LOW_QUALITY_AGENT' ? 'Atendimento abaixo da média' : 'Verificação pendente'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{alert.description || 'Favor verificar a situação no painel de alertas.'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        
        {/* Playbooks Section */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">Central de Conhecimento</h3>
            <div className="p-1.5 bg-muted rounded-full">
              <BookOpen size={16} className="text-muted-foreground" />
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-center text-center p-8 bg-muted/20 border border-border/50 border-dashed rounded-2xl">
            <BookOpen className="mx-auto h-10 w-10 text-primary opacity-80 mb-3" />
            <h4 className="text-sm font-bold text-foreground">Guias de Venda e Playbooks</h4>
            <p className="text-xs text-muted-foreground mt-2 max-w-[250px] mx-auto">
              Sempre que tiver dúvidas sobre como conduzir o cliente ou contornar objeções, consulte os Playbooks da empresa.
            </p>
            <Link to="/playbooks" className="mt-4 mx-auto w-fit rounded-xl bg-foreground px-4 py-2 font-semibold text-background text-sm transition-opacity hover:opacity-90">
              Acessar Guias
            </Link>
          </div>
        </section>
      </div>

    </div>
  );
}
