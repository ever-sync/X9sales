import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock,
  Target,
  MessageSquare,
  UserPlus,
  AlertCircle,
  Zap,
  ChevronRight,
  Trophy,
  BrainCircuit,
  ListTodo,
  Award,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { cn } from '../lib/utils';
import gsap from 'gsap';

// ── Types ─────────────────────────────────────────────────────────────────────

type DailyMetrics = {
  conversations_total: number;
  deals_won: number;
  revenue: number;
  sla_first_response_pct: number | null;
};

type RankingRow = {
  agent_id: string;
  total_conversations: number;
  total_deals_won: number;
  total_revenue: number;
  avg_ai_quality_score: number | null;
  avg_sla_first_response_pct: number | null;
  coaching_needed_count: number;
};

type DealSignal = {
  stage: string;
  loss_risk_level: string;
  intent_level: string;
  estimated_value: number | null;
  next_best_action: string | null;
  conversation_id: string;
  conversations: { customer_name: string | null } | null;
};

type SaleRecord = { quantity: number; margin_amount: string; };

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentDashboard() {
  const { company } = useCompany();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: myAgent } = useQuery({
    queryKey: ['my-agent-profile', company?.id, user?.id],
    queryFn: async () => {
      if (!company?.id || !user?.id || !user.email) return null;
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('company_id', company.id)
        .eq('email', user.email)
        .maybeSingle();
      return data;
    },
    enabled: !!company?.id && !!user?.id,
  });

  const today = new Date().toISOString().split('T')[0];

  const { data: dailyMetrics } = useQuery<DailyMetrics | null>({
    queryKey: ['agent-daily-metrics', myAgent?.id, today],
    queryFn: async () => {
      if (!myAgent?.id) return null;
      const { data } = await supabase
        .from('metrics_agent_daily')
        .select('conversations_total, deals_won, revenue, sla_first_response_pct')
        .eq('agent_id', myAgent.id)
        .eq('metric_date', today)
        .maybeSingle();
      return data as DailyMetrics | null;
    },
    enabled: !!myAgent?.id,
    staleTime: 1000 * 60 * 3,
  });

  const { data: myRanking } = useQuery<RankingRow | null>({
    queryKey: ['my-ranking-row', company?.id, myAgent?.id],
    queryFn: async () => {
      if (!company?.id || !myAgent?.id) return null;
      const { data } = await supabase
        .from('mv_agent_ranking')
        .select('agent_id, total_conversations, total_deals_won, total_revenue, avg_ai_quality_score, avg_sla_first_response_pct, coaching_needed_count')
        .eq('company_id', company.id)
        .eq('agent_id', myAgent.id)
        .maybeSingle();
      return data as RankingRow | null;
    },
    enabled: !!company?.id && !!myAgent?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: allRankings = [] } = useQuery<Pick<RankingRow, 'agent_id' | 'total_revenue'>[]>({
    queryKey: ['company-rankings', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase
        .from('mv_agent_ranking')
        .select('agent_id, total_revenue')
        .eq('company_id', company.id)
        .order('total_revenue', { ascending: false });
      return (data ?? []) as Pick<RankingRow, 'agent_id' | 'total_revenue'>[];
    },
    enabled: !!company?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: dealSignals = [] } = useQuery<DealSignal[]>({
    queryKey: ['my-deal-signals', company?.id, myAgent?.id],
    queryFn: async () => {
      if (!company?.id || !myAgent?.id) return [];
      const { data } = await supabase
        .from('deal_signals')
        .select('stage, loss_risk_level, intent_level, estimated_value, next_best_action, conversation_id, conversations(customer_name)')
        .eq('company_id', company.id)
        .eq('agent_id', myAgent.id)
        .order('estimated_value', { ascending: false });
      return (data ?? []) as unknown as DealSignal[];
    },
    enabled: !!company?.id && !!myAgent?.id,
    staleTime: 1000 * 60 * 3,
  });

  const { data: monthlySales = [] } = useQuery<SaleRecord[]>({
    queryKey: ['my-monthly-sales', company?.id, myAgent?.id],
    queryFn: async () => {
      if (!company?.id || !myAgent?.id) return [];
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('sales_records')
        .select('quantity, margin_amount')
        .eq('company_id', company.id)
        .eq('seller_agent_id', myAgent.id)
        .gte('sold_at', start.toISOString());
      return (data ?? []) as SaleRecord[];
    },
    enabled: !!company?.id && !!myAgent?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: lastAnalysis } = useQuery({
    queryKey: ['last-ai-analysis', myAgent?.id],
    queryFn: async () => {
      if (!myAgent?.id) return null;
      const { data } = await supabase
        .from('ai_conversation_analysis')
        .select('quality_score, coaching_tips, needs_coaching, analyzed_at')
        .eq('agent_id', myAgent.id)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!myAgent?.id,
    staleTime: 1000 * 60 * 5,
  });

  // ── Animations ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.from('.reveal-item', {
          y: 30,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
        });
      }, containerRef.current);
      return () => ctx.revert();
    }
  }, [myAgent]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const {
    metrics,
    goals,
    highRiskDeals,
    nextActions,
    myRank,
    totalRevenue,
  } = useMemo(() => {
    const totalSalesQty = monthlySales.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const totalRevenue = monthlySales.reduce((s, r) => s + Number(r.margin_amount ?? 0), 0);
    const highRiskDeals = dealSignals.filter(d => d.loss_risk_level === 'alto');
    const advancedDeals = dealSignals.filter(d => d.stage !== 'descoberta');

    const metrics = {
      leadsReceived: dailyMetrics?.conversations_total ?? 0,
      started: dealSignals.length,
      noResponse: highRiskDeals.length,
      followUps: dealSignals.filter(d => d.next_best_action).length,
      won: dailyMetrics?.deals_won ?? 0,
      revenue: totalRevenue > 0 ? totalRevenue : (dailyMetrics?.revenue ?? 0),
    };

    const goals = [
      {
        label: 'Contatos',
        cur: dailyMetrics?.conversations_total ?? 0,
        target: 40,
        col: 'bg-primary',
      },
      {
        label: 'Propostas',
        cur: advancedDeals.length,
        target: 15,
        col: 'bg-indigo-500',
      },
      {
        label: 'Vendas (mês)',
        cur: totalSalesQty,
        target: 5,
        col: 'bg-emerald-500',
      },
    ];

    const nextActions = highRiskDeals.slice(0, 4).map(d => ({
      name: d.conversations?.customer_name ?? 'Cliente',
      action: d.next_best_action ?? 'Follow-up urgente',
      conversationId: d.conversation_id,
      urgent: true,
    }));

    const myRankIndex = allRankings.findIndex(r => r.agent_id === myAgent?.id);
    const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

    return { metrics, goals, highRiskDeals, nextActions, myRank, totalRevenue };
  }, [dailyMetrics, dealSignals, monthlySales, allRankings, myAgent?.id]);

  const aiScore = myRanking?.avg_ai_quality_score ?? 0;
  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div ref={containerRef} className="space-y-8 pb-32 overflow-hidden">

      {/* 1. Header Hero */}
      <div className="reveal-item px-4 md:px-0 pt-6">
        <div className="relative group">
          <div className="absolute -inset-1 bg-linear-to-r from-primary/50 to-secondary/50 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-8 rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full border border-primary/20">
                    Modo Alta Performance
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground mb-1 italic">
                  Olá, {myAgent?.name?.split(' ')[0] ?? 'Vendedor'}! 🚀
                </h1>
                <p className="text-muted-foreground font-bold flex items-center gap-2">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div className="flex shrink-0">
                <Link to="/sales" className="group rounded-2xl p-[2px] bg-gradient-to-br from-primary to-emerald-400 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20">
                  <div className="bg-primary hover:bg-transparent text-primary-foreground px-8 py-5 rounded-[calc(1rem-2px)] flex items-center justify-center gap-3 font-black text-sm uppercase tracking-tighter transition-all">
                    <Zap size={20} fill="currentColor" strokeWidth={0} />
                    LANÇAR VENDA AGORA
                  </div>
                </Link>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-t border-slate-100 dark:border-slate-800/50">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Receita (mês)</p>
                <p className="text-2xl font-black text-foreground">{fmtCurrency(metrics.revenue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Vendas Hoje</p>
                <p className="text-2xl font-black text-foreground">{metrics.won}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Ranking no Time</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black text-amber-500">{myRank != null ? `${myRank}º` : '—'}</p>
                  {myRank != null && myRank <= 3 && <Trophy size={18} className="text-amber-500 fill-amber-500" />}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Qualidade IA</p>
                <p className="text-2xl font-black text-indigo-500">{aiScore > 0 ? `${aiScore}/100` : '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid de Operação */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 md:px-0">
        {[
          { label: 'Leads Hoje', val: metrics.leadsReceived, icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Deals Ativos', val: metrics.started, icon: MessageSquare, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
          { label: 'Alto Risco', val: metrics.noResponse, icon: Clock, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Follow-ups', val: metrics.followUps, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map((item, i) => (
          <div key={i} className="reveal-item bg-card border border-slate-200/60 dark:border-slate-800/60 p-5 rounded-3xl shadow-sm hover:border-primary/40 transition-colors">
            <div className={`${item.bg} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
              <item.icon size={20} className={item.color} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
            <h3 className="text-3xl font-black mt-1 tracking-tight">{item.val}</h3>
          </div>
        ))}
      </div>

      {/* 3. Metas e Progressão */}
      <section className="reveal-item px-4 md:px-0">
        <div className="bg-slate-950 border border-slate-800/60 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
            <Target size={200} />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black flex items-center gap-3 tracking-tighter">
                <Target className="text-primary h-6 w-6" />
                OBJETIVOS DO DIA
              </h3>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full">
                <Trophy size={14} className="text-amber-500" />
                <span className="text-[10px] font-black text-amber-500 uppercase">
                  {allRankings.length > 0 && myRank ? `${myRank}º de ${allRankings.length}` : 'Ranking'}
                </span>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {goals.map((goal, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{goal.label}</span>
                    <span className="text-xl font-black">
                      {goal.cur}<span className="text-slate-600 text-sm italic"> / {goal.target}</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                    <div
                      className={cn('h-full transition-all duration-1000', goal.col)}
                      style={{ width: `${Math.min(100, (goal.cur / goal.target) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                    Faltam {Math.max(0, goal.target - goal.cur)} para a meta
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. IA Insights & Coaching */}
      <div className="reveal-item grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0">
        <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
          <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:rotate-12 transition-transform">
            <BrainCircuit size={200} />
          </div>

          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-md border border-white/10">
                <BrainCircuit size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Cérebro MonitoraIA</h3>
                <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Análise de conversas</span>
              </div>
            </div>

            <div className="flex-1">
              <p className="text-lg font-medium leading-tight mb-6 italic text-indigo-50">
                "{lastAnalysis?.coaching_tips?.[0] ?? 'Nenhuma análise disponível ainda. Execute a análise em uma conversa para receber coaching personalizado.'}"
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">SCORE IA (30d)</p>
                  <p className="text-base font-black">{aiScore > 0 ? `${aiScore}/100` : '— sem dados'}</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">COACHING PENDENTE</p>
                  <p className="text-base font-black">
                    {myRanking?.coaching_needed_count ?? 0} conversa{(myRanking?.coaching_needed_count ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-500/20 p-8 rounded-[2.5rem] relative group border-dashed">
          <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-tight mb-6 flex items-center gap-2">
            <Award className="text-emerald-500" />
            MISSÃO DO DIA
          </h3>
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-emerald-500/10 shadow-sm">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Desafio Prático</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 leading-tight">
                Obter 3 "Sim" do cliente antes de enviar o link de pagamento.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 bg-white/50 dark:bg-white/5 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 italic">Dica Rápida</p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Pergunte: "Faz sentido para você?" ou "Isso resolve seu problema?"
                </p>
              </div>
              <div className="h-16 w-16 bg-emerald-500 text-white flex items-center justify-center rounded-2xl shadow-lg shadow-emerald-500/20">
                <Zap size={32} fill="currentColor" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Ranking Pessoal */}
      <section className="reveal-item px-4 md:px-0">
        <div className="bg-card border border-slate-200 dark:border-slate-800 p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
          <div className="absolute -bottom-6 -right-6 opacity-5 group-hover:rotate-12 transition-transform">
            <Trophy size={160} />
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-10 relative z-10">
            <div className="text-center md:text-left">
              <div className="text-6xl font-black text-primary tracking-tighter italic">
                {myRank != null ? `${myRank}º` : '—'}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                Sua Posição no Time
                {allRankings.length > 0 && <span className="ml-1 text-muted-foreground/60">/ {allRankings.length}</span>}
              </p>
            </div>

            <div className="flex-1 grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[#7A7972]">
                  <span className="text-muted-foreground">SLA 1ª Resposta</span>
                  <span className={(myRanking?.avg_sla_first_response_pct ?? 0) >= 85 ? 'text-emerald-500' : 'text-amber-500'}>
                    {myRanking?.avg_sla_first_response_pct ?? 0}%
                  </span>
                </div>
                <Progress value={myRanking?.avg_sla_first_response_pct ?? 0} className="h-1.5" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[#7A7972]">
                  <span className="text-muted-foreground">Qualidade IA</span>
                  <span className="text-indigo-500">{aiScore > 0 ? `${aiScore}/100` : '—'}</span>
                </div>
                <Progress value={aiScore} className="h-1.5 bg-indigo-500/10" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Próximas Ações */}
      <section className="reveal-item px-4 md:px-0">
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 p-8 rounded-[2.5rem] shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
              <ListTodo className="text-primary h-6 w-6" />
              AÇÕES PRIORITÁRIAS
            </h3>
            <span className="text-xs font-black bg-primary/10 text-primary px-3 py-1.5 rounded-full uppercase tracking-tighter">
              {nextActions.length} URGENTE{nextActions.length !== 1 ? 'S' : ''}
            </span>
          </div>

          {nextActions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma ação urgente no momento. Continue assim! 🎉
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
              {nextActions.map((task, i) => (
                <Link
                  key={i}
                  to={`/conversations/${task.conversationId}`}
                  className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/50 group hover:border-primary transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'h-11 w-11 rounded-full flex items-center justify-center font-black text-lg',
                      task.urgent ? 'bg-red-100 text-red-600 dark:bg-red-900/20' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/20',
                    )}>
                      {task.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-base font-black tracking-tight">{task.name}</h4>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{task.action}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {task.urgent && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500 animate-pulse">Urgente</span>
                    )}
                    <div className="h-8 w-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-slate-100 dark:border-slate-700">
                      <ChevronRight size={18} className="text-primary" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {dealSignals.length > nextActions.length && (
            <Link to="/conversations">
              <Button variant="ghost" className="w-full mt-8 rounded-2xl font-black text-muted-foreground text-xs uppercase tracking-[0.2em] py-6 border-2 border-dashed border-slate-100 dark:border-slate-800 hover:border-primary/20">
                VER TODAS AS CONVERSAS
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
