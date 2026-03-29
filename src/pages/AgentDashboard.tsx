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
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { BadgePill } from '../components/gamification/BadgePill';
import { cn } from '../lib/utils';
import type { AIConversationAnalysis, AgentBadge, StructuredAnalysis } from '../types';
import gsap from 'gsap';

// Types

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

// Component

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

  // Queries

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

  // Animations

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

  // Computed

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
        label: 'Vendas (mÃƒÂªs)',
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
      <section className="reveal-item px-4 pt-6 md:px-0">
        <div className="relative overflow-hidden rounded-[34px] border border-border bg-card p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] md:p-8">
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_center,rgba(89,83,251,0.16),transparent_68%)]" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(220,254,27,0.22),transparent_70%)]" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-secondary/10 bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-secondary">
                  Painel do atendente
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em]',
                    hasPriorityRisk ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600',
                  )}
                >
                  {hasPriorityRisk ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                  {hasPriorityRisk ? 'Atencao imediata' : 'Operacao estavel'}
                </span>
                {priorityLabel && (
                  <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                    Foco: {priorityLabel}
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-[34px] font-bold leading-none tracking-[-0.05em] text-foreground md:text-[44px]">
                {firstName}, sua operacao esta em foco
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Use este painel para atacar a fila certa, manter o SLA em dia e conduzir as conversas com maior chance de avancar.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{todayLabel}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/conversations"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.01] hover:bg-primary/90"
                >
                  Abrir fila agora
                  <ArrowUpRight size={16} />
                </Link>
                <Link
                  to="/ai-insights"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-secondary"
                >
                  Ver analises
                </Link>
              </div>

              {myBadges.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {myBadges.slice(0, 3).map((badge) => (
                    <BadgePill key={badge.badge_key} badge={badge} />
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {heroHighlights.map((item) => (
                <HeroHighlight
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                  tone={item.tone}
                />
              ))}
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-border/60 pt-6 md:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Receita no mes</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{fmtCurrency(metrics.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">margem acumulada nas suas vendas</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Vendas hoje</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{metrics.won}</p>
              <p className="mt-1 text-xs text-muted-foreground">fechamentos registrados no dia</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Posicao no time</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-2xl font-bold tracking-[-0.04em] text-amber-500">{myRank != null ? `#${myRank}` : '--'}</p>
                {myRank != null && myRank <= 3 && <Trophy size={18} className="fill-amber-500 text-amber-500" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {allRankings.length > 0 ? `${allRankings.length} pessoas no ranking atual` : 'ranking ainda sem dados'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Qualidade IA</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-secondary">{aiScoreRounded > 0 ? `${aiScoreRounded}/100` : '--'}</p>
              <p className="mt-1 text-xs text-muted-foreground">media das conversas analisadas</p>
            </div>
          </div>
        </div>
      </section>
      {/* 2. Grid de Operacao */}
      <div className="grid grid-cols-1 gap-4 px-4 md:px-0 lg:grid-cols-4">
        {[
          {
            label: 'Leads de hoje',
            value: metrics.leadsReceived,
            detail: metrics.leadsReceived > 0 ? 'novas conversas na fila' : 'nenhuma nova entrada hoje',
            icon: UserPlus,
            bg: 'bg-sky-500/10',
            color: 'text-sky-600',
          },
          {
            label: 'Negociacoes ativas',
            value: metrics.started,
            detail: metrics.started > 0 ? 'clientes com potencial em curso' : 'sem negociacoes abertas',
            icon: MessageSquare,
            bg: 'bg-secondary/10',
            color: 'text-secondary',
          },
          {
            label: 'Risco de perda',
            value: metrics.noResponse,
            detail: metrics.noResponse > 0 ? 'conversas pedindo acao imediata' : 'operacao sob controle agora',
            icon: Clock,
            bg: 'bg-red-500/10',
            color: 'text-red-500',
          },
          {
            label: 'Retornos pendentes',
            value: metrics.followUps,
            detail: metrics.followUps > 0 ? 'follow-ups para destravar' : 'sem retornos pendentes',
            icon: AlertCircle,
            bg: 'bg-amber-500/10',
            color: 'text-amber-500',
          },
        ].map((item) => (
          <AgentPanelCard key={item.label} className="reveal-item p-5">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', item.bg)}>
              <item.icon size={20} className={item.color} />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">{item.value}</p>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">{item.detail}</p>
          </AgentPanelCard>
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

      {/* 3. Metas e Progressao */}
      <section className="reveal-item px-4 md:px-0">
        <AgentPanelCard>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                  <Target size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Ritmo do dia</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-foreground">Sua cadencia de atendimento</h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Uma leitura direta das metas operacionais e das conversas que pedem intervencao antes de esfriarem.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[320px]">
              <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Ranking</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{myRank != null ? `#${myRank}` : '--'}</p>
                <p className="mt-1 text-xs text-muted-foreground">sua posicao atual</p>
              </div>
              <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">SLA</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{slaScore}%</p>
                <p className="mt-1 text-xs text-muted-foreground">ritmo da 1a resposta</p>
              </div>
              <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Coaching</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{coachingPending}</p>
                <p className="mt-1 text-xs text-muted-foreground">conversas com ajuste</p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              {goals.map((goal) => {
                const progress = goal.target > 0 ? Math.min(100, (goal.cur / goal.target) * 100) : 0;
                return (
                  <div key={goal.label} className="rounded-[26px] border border-border/70 bg-white/70 p-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{goal.label}</p>
                        <p className="mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">
                          {goal.cur}
                          <span className="ml-2 text-base font-medium text-muted-foreground">/ {goal.target}</span>
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        faltam {Math.max(0, goal.target - goal.cur)}
                      </span>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted/80">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700', goal.col)}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[28px] border border-border/70 bg-muted/20 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                  <ListTodo size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Fila que pede acao</p>
                  <p className="text-lg font-bold tracking-[-0.03em] text-foreground">Prioridades imediatas</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {actionPreview.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                    Nenhuma conversa critica por agora. Seu painel volta a destacar risco assim que surgir algo fora do eixo.
                  </div>
                )}

                {actionPreview.map((task) => (
                  <Link
                    key={task.conversationId}
                    to={`/conversations/${task.conversationId}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-4 transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{task.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{task.action}</p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-primary" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </AgentPanelCard>
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
                      {fallbackTags.join(' | ')}
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

      {/* 5. Performance pessoal */}
      <div className="grid grid-cols-1 gap-6 px-4 md:px-0 xl:grid-cols-12">
        <AgentPanelCard className="reveal-item xl:col-span-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Performance pessoal</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">Sua leitura de performance</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Ranking, qualidade e disciplina de resposta organizados no mesmo bloco, do jeito que o gestor enxerga o time.
              </p>
            </div>

            <div className="rounded-[24px] border border-primary/20 bg-primary/10 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Posicao atual</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-bold tracking-[-0.05em] text-foreground">{myRank != null ? `#${myRank}` : '--'}</span>
                <Medal className="text-amber-500" size={22} />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-border/70 bg-muted/20 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Receita no mes</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{fmtCurrency(metrics.revenue)}</p>
              <p className="mt-2 text-sm text-muted-foreground">resultado financeiro acumulado</p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-muted/20 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Vendas no dia</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{metrics.won}</p>
              <p className="mt-2 text-sm text-muted-foreground">conversoes registradas hoje</p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-muted/20 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Coaching pendente</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">{coachingPending}</p>
              <p className="mt-2 text-sm text-muted-foreground">conversas com ajuste apontado</p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-[24px] border border-border/70 bg-white/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">SLA da 1a resposta</p>
                <span className={cn('text-sm font-bold', slaScore >= 85 ? 'text-emerald-500' : 'text-amber-500')}>{slaScore}%</span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(100, slaScore)}%` }} />
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-white/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Qualidade IA</p>
                <span className="text-sm font-bold text-secondary">{aiScoreRounded > 0 ? `${aiScoreRounded}/100` : '--'}</span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary/10">
                <div className="h-full rounded-full bg-secondary transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, aiScoreRounded))}%` }} />
              </div>
            </div>
          </div>
        </AgentPanelCard>
      </div>

      {/* 6. Acoes prioritarias */}
      <section className="reveal-item px-4 md:px-0">
        <AgentPanelCard>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Execucao</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">Acoes prioritarias</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A parte mais operacional do painel agora fecha a leitura do jeito certo: depois do contexto, vem a fila exata para agir.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              {nextActions.length} urgente{nextActions.length !== 1 ? 's' : ''}
            </span>
          </div>

          {nextActions.length === 0 ? (
            <div className="mt-8 rounded-[26px] border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-foreground">Nenhuma acao urgente no momento.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Continue nessa linha. Quando surgir risco real, a conversa sobe para este bloco automaticamente.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {nextActions.map((task) => (
                <Link
                  key={task.conversationId}
                  to={`/conversations/${task.conversationId}`}
                  className="group flex items-center justify-between gap-4 rounded-[24px] border border-border/80 bg-muted/20 px-5 py-5 transition-all hover:border-primary/40 hover:bg-white"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                        task.urgent ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-600',
                      )}
                    >
                      {task.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold tracking-[-0.02em] text-foreground">{task.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{task.action}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {task.urgent && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">Urgente</span>
                    )}
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-primary transition-colors group-hover:border-primary/30">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {dealSignals.length > nextActions.length && (
            <Link to="/conversations">
              <Button
                variant="ghost"
                className="mt-8 w-full rounded-full border border-dashed border-border py-6 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground hover:border-primary/30 hover:text-primary"
              >
                Ver toda a fila de conversas
              </Button>
            </Link>
          )}
        </AgentPanelCard>
      </section>
    </div>
  );
}

