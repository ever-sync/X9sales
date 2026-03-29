import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
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
  Medal,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { BadgePill } from '../components/gamification/BadgePill';
import { cn } from '../lib/utils';
import type { AIConversationAnalysis, AgentBadge, StructuredAnalysis } from '../types';
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

type CoachingAnalysis = Pick<
  AIConversationAnalysis,
  | 'conversation_id'
  | 'quality_score'
  | 'needs_coaching'
  | 'coaching_tips'
  | 'training_tags'
  | 'analyzed_at'
  | 'score_investigation'
  | 'score_commercial_steering'
  | 'score_objection_handling'
  | 'score_empathy'
  | 'score_clarity'
> & {
  structured_analysis: StructuredAnalysis | null;
};

type CoachingPillarKey =
  | 'score_investigation'
  | 'score_commercial_steering'
  | 'score_objection_handling'
  | 'score_empathy'
  | 'score_clarity';

type CoachingExample = {
  conversation_id: string;
  quality_score: number | null;
  agent_id: string | null;
  conversations: { customer_name: string | null } | null;
} & Partial<Record<CoachingPillarKey, number | null>>;

type CoachingActionMeta = {
  headline?: string;
  playbook_label?: string;
  exercise?: string;
  quick_tip?: string;
  primary_pillar_label?: string;
  primary_score?: number | null;
  strengths?: string[];
  improvements?: string[];
  failure_tags?: string[];
  example?: {
    conversation_id?: string;
    customer_name?: string;
    agent_name?: string;
    pillar_score?: number | null;
    quality_score?: number | null;
  } | null;
} | null;

type CoachingActionRow = {
  id: string;
  conversation_id: string;
  created_at: string;
  meta: CoachingActionMeta;
};

const COACHING_PILLARS: Array<{
  key: CoachingPillarKey;
  label: string;
  playbookLabel: string;
  exercise: string;
  quickTip: string;
}> = [
  {
    key: 'score_investigation',
    label: 'Investigacao',
    playbookLabel: 'Playbook de investigacao',
    exercise: 'Antes de ofertar, valide dor, urgencia e criterio de decisao com 3 perguntas abertas.',
    quickTip: 'Use a sequencia: contexto, impacto e urgencia antes de apresentar proposta.',
  },
  {
    key: 'score_commercial_steering',
    label: 'Conducao comercial',
    playbookLabel: 'Playbook de conducao comercial',
    exercise: 'Feche cada conversa com um proximo passo combinado e horario definido com o cliente.',
    quickTip: 'Troque mensagens abertas por convites concretos: call, proposta ou fechamento.',
  },
  {
    key: 'score_objection_handling',
    label: 'Tratamento de objecoes',
    playbookLabel: 'Playbook de objecoes',
    exercise: 'Responda a objecao em 3 etapas: reconheca, aprofunde e reposicione valor.',
    quickTip: 'Nao rebata preco de imediato. Descubra o que esta por tras da resistencia.',
  },
  {
    key: 'score_empathy',
    label: 'Empatia',
    playbookLabel: 'Playbook de empatia',
    exercise: 'Espelhe o contexto do cliente antes de sugerir qualquer acao comercial.',
    quickTip: 'Mostre que entendeu a situacao com uma frase de validacao antes de conduzir.',
  },
  {
    key: 'score_clarity',
    label: 'Clareza',
    playbookLabel: 'Playbook de clareza',
    exercise: 'Envie mensagens curtas com um unico objetivo e CTA explicito por vez.',
    quickTip: 'Troque blocos longos por passos simples e linguagem direta.',
  },
];

function average(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter((value): value is number => value != null);
  if (validValues.length === 0) return null;
  return +(validValues.reduce((sum, value) => sum + value, 0) / validValues.length).toFixed(1);
}

function topEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

// ── Component ─────────────────────────────────────────────────────────────────

function AgentPanelCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[30px] border border-border bg-card p-6 shadow-[0_12px_40px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.07)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

function HeroHighlight({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'purple' | 'lime';
}) {
  const toneClass =
    tone === 'purple'
      ? 'border-secondary/10 bg-secondary/5'
      : tone === 'lime'
        ? 'border-primary/30 bg-primary/10'
        : 'border-border/70 bg-white/80';

  return (
    <div className={cn('rounded-[24px] border p-4 shadow-sm backdrop-blur', toneClass)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <span className="text-3xl font-bold tracking-[-0.04em] text-foreground">{value}</span>
        <span className="text-right text-[11px] font-medium leading-4 text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

export default function AgentDashboard() {
  const { company } = useCompany();
  const { blockedConversationIds, isBlockedConversationId } = useBlockedPhones();
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

  const coachingWindowStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }, []);

  const { data: recentAnalyses = [] } = useQuery<CoachingAnalysis[]>({
    queryKey: ['agent-weekly-coaching', myAgent?.id, coachingWindowStart],
    queryFn: async () => {
      if (!myAgent?.id) return [];
      const { data } = await supabase
        .from('ai_conversation_analysis')
        .select('conversation_id, quality_score, needs_coaching, coaching_tips, training_tags, analyzed_at, score_investigation, score_commercial_steering, score_objection_handling, score_empathy, score_clarity, structured_analysis')
        .eq('agent_id', myAgent.id)
        .gte('analyzed_at', coachingWindowStart)
        .order('analyzed_at', { ascending: false })
        .limit(12);
      return ((data ?? []) as CoachingAnalysis[]).filter((analysis) => !isBlockedConversationId(analysis.conversation_id));
    },
    enabled: !!myAgent?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: latestCoachingAction } = useQuery<CoachingActionRow | null>({
    queryKey: ['agent-latest-coaching-action', company?.id, myAgent?.id],
    queryFn: async () => {
      if (!company?.id || !myAgent?.id) return null;
      const { data } = await supabase
        .from('coaching_actions')
        .select('id, conversation_id, created_at, meta')
        .eq('company_id', company.id)
        .eq('agent_id', myAgent.id)
        .eq('action_type', 'auto_post_analysis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as CoachingActionRow | null;
    },
    enabled: !!company?.id && !!myAgent?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: myBadges = [] } = useQuery<AgentBadge[]>({
    queryKey: ['agent-badges', company?.id, myAgent?.id],
    queryFn: async () => {
      if (!company?.id || !myAgent?.id) return [];
      const { data, error } = await supabase.rpc('get_agent_badges', {
        p_company_id: company.id,
        p_agent_id: myAgent.id,
      });
      if (error) throw error;
      return (data ?? []) as AgentBadge[];
    },
    enabled: !!company?.id && !!myAgent?.id,
    staleTime: 1000 * 60 * 10,
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

  const weeklyCoaching = useMemo(() => {
    const scoredAnalyses = recentAnalyses.filter((analysis) => analysis.quality_score != null);
    const pillarAverages = COACHING_PILLARS
      .map((pillar) => ({
        ...pillar,
        average: average(scoredAnalyses.map((analysis) => analysis[pillar.key])),
      }))
      .filter((pillar) => pillar.average != null)
      .sort((a, b) => (a.average ?? 0) - (b.average ?? 0));

    const weakestPillar = pillarAverages[0] ?? null;
    const strengthCounts = new Map<string, number>();
    const improvementCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const tipCounts = new Map<string, number>();

    for (const analysis of recentAnalyses) {
      for (const tip of analysis.coaching_tips ?? []) {
        tipCounts.set(tip, (tipCounts.get(tip) ?? 0) + 1);
      }
      for (const tag of analysis.training_tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      for (const item of analysis.structured_analysis?.strengths ?? []) {
        strengthCounts.set(item, (strengthCounts.get(item) ?? 0) + 1);
      }
      for (const item of analysis.structured_analysis?.improvements ?? []) {
        improvementCounts.set(item, (improvementCounts.get(item) ?? 0) + 1);
      }
      for (const item of analysis.structured_analysis?.failure_tags ?? []) {
        tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1);
      }
    }

    const coachingCount = recentAnalyses.filter((analysis) => analysis.needs_coaching).length;

    return {
      totalAnalyses: recentAnalyses.length,
      coachingCount,
      coachingRate: recentAnalyses.length > 0 ? Math.round((coachingCount / recentAnalyses.length) * 100) : 0,
      latestAnalysisAt: recentAnalyses[0]?.analyzed_at ?? null,
      weakestPillar,
      primaryTip: topEntries(tipCounts, 1)[0]?.label ?? null,
      topStrengths: topEntries(strengthCounts, 2),
      topImprovements: topEntries(improvementCounts, 3),
      topTags: topEntries(tagCounts, 3),
    };
  }, [recentAnalyses]);

  const { data: coachingExample } = useQuery<CoachingExample | null>({
    queryKey: ['agent-coaching-example', company?.id, myAgent?.id, weeklyCoaching.weakestPillar?.key],
    queryFn: async () => {
      if (!company?.id || !weeklyCoaching.weakestPillar?.key) return null;
      const pillarKey = weeklyCoaching.weakestPillar.key;
      let query = supabase
        .from('ai_conversation_analysis')
        .select(`conversation_id, quality_score, agent_id, ${pillarKey}, conversations(customer_name)`)
        .eq('company_id', company.id)
        .not('conversation_id', 'is', null)
        .gte(pillarKey, 90)
        .order(pillarKey, { ascending: false })
        .order('quality_score', { ascending: false })
        .limit(1);

      if (myAgent?.id) {
        query = query.neq('agent_id', myAgent.id);
      }

      const { data } = await query.maybeSingle();
      const example = (data ?? null) as unknown as CoachingExample | null;
      if (example?.conversation_id && blockedConversationIds.has(example.conversation_id)) return null;
      return example;
    },
    enabled: !!company?.id && !!weeklyCoaching.weakestPillar?.key,
    staleTime: 1000 * 60 * 10,
  });

  const backendCoaching = useMemo(() => {
    const meta = latestCoachingAction?.meta;
    if (!meta) return null;

    return {
      headline: meta.headline ?? null,
      playbookLabel: meta.playbook_label ?? null,
      exercise: meta.exercise ?? null,
      quickTip: meta.quick_tip ?? null,
      primaryPillarLabel: meta.primary_pillar_label ?? null,
      primaryScore: meta.primary_score ?? null,
      strengths: meta.strengths ?? [],
      improvements: meta.improvements ?? [],
      failureTags: meta.failure_tags ?? [],
      example: meta.example?.conversation_id ? meta.example : null,
      conversationId: latestCoachingAction.conversation_id,
      createdAt: latestCoachingAction.created_at,
    };
  }, [latestCoachingAction]);

  const {
    metrics,
    goals,
    nextActions,
    myRank,
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

    return { metrics, goals, nextActions, myRank };
  }, [dailyMetrics, dealSignals, monthlySales, allRankings, myAgent?.id]);

  const aiScore = myRanking?.avg_ai_quality_score ?? 0;
  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const coachingHeadline = backendCoaching?.headline
    ?? weeklyCoaching.primaryTip
    ?? (weeklyCoaching.weakestPillar
      ? `Seu foco desta semana esta em ${weeklyCoaching.weakestPillar.label.toLowerCase()}.`
      : 'Nenhuma analise recente ainda. Assim que novas conversas forem avaliadas, seu coaching aparece aqui.');
  const missionExercise = backendCoaching?.exercise
    ?? weeklyCoaching.weakestPillar?.exercise
    ?? 'Analise uma conversa desta semana e identifique onde faltou proximo passo claro para o cliente.';
  const missionQuickTip = backendCoaching?.quickTip
    ?? weeklyCoaching.weakestPillar?.quickTip
    ?? 'Quanto mais conversas analisadas, mais preciso fica o seu plano de melhoria.';
  const priorityLabel = backendCoaching?.primaryPillarLabel
    ?? weeklyCoaching.weakestPillar?.label
    ?? null;
  const priorityScore = backendCoaching?.primaryScore
    ?? weeklyCoaching.weakestPillar?.average
    ?? null;
  const focusItems = backendCoaching?.improvements?.slice(0, 2) ?? weeklyCoaching.topImprovements.slice(0, 2).map((item) => item.label);
  const strengthItems = backendCoaching?.strengths?.slice(0, 2) ?? weeklyCoaching.topStrengths.slice(0, 2).map((item) => item.label);
  const fallbackTags = backendCoaching?.failureTags?.length ? backendCoaching.failureTags : weeklyCoaching.topTags.map((item) => item.label);
  const exampleConversationId = backendCoaching?.example?.conversation_id ?? coachingExample?.conversation_id ?? null;
  const exampleCustomerName = backendCoaching?.example?.customer_name
    ?? coachingExample?.conversations?.customer_name
    ?? 'Conversa de referencia';
  const exampleScore = backendCoaching?.example?.pillar_score
    ?? coachingExample?.[weeklyCoaching.weakestPillar?.key ?? 'score_investigation']
    ?? 90;
  const coachingSourceDate = backendCoaching?.createdAt ?? weeklyCoaching.latestAnalysisAt;
  const firstName = myAgent?.name?.split(' ')[0] ?? 'Atendente';
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const slaScore = Math.round(dailyMetrics?.sla_first_response_pct ?? myRanking?.avg_sla_first_response_pct ?? 0);
  const aiScoreRounded = Math.round(aiScore);
  const coachingPending = myRanking?.coaching_needed_count ?? 0;
  const hasPriorityRisk = nextActions.length > 0 || metrics.noResponse > 0;
  const heroHighlights = [
    {
      label: 'Conversas em andamento',
      value: String(metrics.started),
      hint: metrics.started > 0 ? 'carteira ativa agora' : 'sem conversas abertas',
      tone: metrics.started > 0 ? 'lime' : 'neutral',
    },
    {
      label: 'SLA da 1a resposta',
      value: `${slaScore}%`,
      hint: slaScore >= 85 ? 'ritmo forte no atendimento' : 'vale acelerar retornos',
      tone: slaScore >= 85 ? 'purple' : 'neutral',
    },
    {
      label: 'Coaching pendente',
      value: String(coachingPending),
      hint: coachingPending > 0 ? 'ajustes para revisar' : 'sem pendencias abertas',
      tone: coachingPending > 0 ? 'neutral' : 'lime',
    },
  ] as const;
  const actionPreview = nextActions.slice(0, 2);

  return (
    <div ref={containerRef} className="space-y-6 pb-24 overflow-hidden">

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
                {myBadges.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {myBadges.map((badge) => (
                      <BadgePill key={badge.badge_key} badge={badge} />
                    ))}
                  </div>
                )}
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

      {myBadges.length > 0 && (
        <section className="reveal-item px-4 md:px-0">
          <div className="rounded-[2.5rem] border border-amber-200 bg-linear-to-r from-amber-50 to-white p-6 shadow-sm dark:border-amber-500/20 dark:from-amber-950/20 dark:to-slate-950">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Reconhecimentos da semana</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Seu quadro de badges</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {myBadges.map((badge) => (
                  <BadgePill key={`${badge.badge_key}-header`} badge={badge} />
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {myBadges.map((badge) => (
                <div key={`${badge.badge_key}-detail`} className="rounded-2xl border border-white/60 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{badge.badge_label}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{badge.badge_description}</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{badge.award_reason}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
                <h3 className="text-lg font-black uppercase tracking-tight">Seu Coaching da Semana</h3>
                <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Analise automatica dos ultimos 7 dias</span>
              </div>
            </div>

            <div className="flex-1">
              <p className="text-lg font-medium leading-tight mb-6 italic text-indigo-50">
                "{coachingHeadline}"
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">PILAR PRIORITARIO</p>
                  <p className="text-base font-black">
                    {priorityLabel
                      ? `${priorityLabel}${priorityScore != null ? ` (${priorityScore}/100)` : ''}`
                      : 'Aguardando analises'}
                  </p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">COACHING PENDENTE</p>
                  <p className="text-base font-black">
                    {myRanking?.coaching_needed_count ?? 0} conversa{(myRanking?.coaching_needed_count ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {(focusItems.length > 0 || strengthItems.length > 0) && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="bg-slate-950/20 p-4 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Onde atacar agora</p>
                    <div className="space-y-2">
                      {focusItems.map((item) => (
                        <p key={item} className="text-sm font-semibold text-indigo-50">
                          {item}
                        </p>
                      ))}
                      {focusItems.length === 0 && (
                        <p className="text-sm text-indigo-100/80">Sem repeticao suficiente para sugerir foco adicional.</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-950/20 p-4 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Forcas para manter</p>
                    <div className="space-y-2">
                      {strengthItems.map((item) => (
                        <p key={item} className="text-sm font-semibold text-indigo-50">
                          {item}
                        </p>
                      ))}
                      {strengthItems.length === 0 && (
                        <p className="text-sm text-indigo-100/80">As proximas analises vao mostrar seus padroes fortes.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.18em] text-indigo-100/85">
                <span>{weeklyCoaching.totalAnalyses} analise{weeklyCoaching.totalAnalyses !== 1 ? 's' : ''} na semana</span>
                <span>{weeklyCoaching.coachingRate}% com coaching</span>
                {coachingSourceDate && (
                  <span>ultima leitura {new Date(coachingSourceDate).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/ai-insights">
                  <Button variant="secondary" className="rounded-2xl border-0 bg-white text-indigo-700 hover:bg-indigo-50">
                    Ver minhas analises
                  </Button>
                </Link>
                <Link to="/playbooks">
                  <Button variant="ghost" className="rounded-2xl border border-white/20 text-white hover:bg-white/10 hover:text-white">
                    {backendCoaching?.playbookLabel ?? weeklyCoaching.weakestPillar?.playbookLabel ?? 'Abrir playbooks'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-500/20 p-8 rounded-[2.5rem] relative group border-dashed">
          <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-tight mb-6 flex items-center gap-2">
            <Award className="text-emerald-500" />
            Missao de Coaching
          </h3>
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-emerald-500/10 shadow-sm">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Exercicio pratico</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {missionExercise}
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 bg-white/50 dark:bg-white/5 p-4 rounded-2xl space-y-3">
                <div>
                  <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 italic">Dica rapida</p>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {missionQuickTip}
                  </p>
                </div>
                {exampleConversationId && priorityLabel && (
                  <div className="rounded-2xl border border-emerald-500/15 bg-white dark:bg-slate-900 p-3">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Exemplo forte do time</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {exampleCustomerName} atingiu {exampleScore}/100 em {priorityLabel.toLowerCase()}.
                    </p>
                    <Link
                      to={`/conversations/${exampleConversationId}`}
                      className="mt-2 inline-flex text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-500"
                    >
                      Abrir conversa-modelo
                    </Link>
                  </div>
                )}
                {!exampleConversationId && fallbackTags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 italic">Padroes recorrentes</p>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {fallbackTags.join(' • ')}
                    </p>
                  </div>
                )}
              </div>
              <div className="h-16 w-16 bg-emerald-500 text-white flex items-center justify-center rounded-2xl shadow-lg shadow-emerald-500/20">
                <Zap size={32} fill="currentColor" />
              </div>
            </div>
            {weeklyCoaching.totalAnalyses > 0 && (
              <div className="rounded-2xl border border-emerald-500/15 bg-white/70 dark:bg-slate-900/40 p-4">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Regra automatica ativa</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Quando seu pilar principal cai, o painel prioriza o proximo treino com base nas ultimas conversas analisadas e nas referencias mais fortes do time.
                </p>
              </div>
            )}
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
