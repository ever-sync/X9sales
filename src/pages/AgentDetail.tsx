import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import type { Agent, AgentBadge, AgentDailyMetrics, AIConversationAnalysis } from '../types';
import { useConversations } from '../hooks/useConversations';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { getPercentDelta, usePeriodComparison } from '../hooks/usePeriodComparison';
import { CACHE } from '../config/constants';
import { MetricCard } from '../components/dashboard/MetricCard';
import { BadgePill } from '../components/gamification/BadgePill';
import { invokeSyncAgentAvatars } from '../lib/agentAvatarSync';
import { formatSeconds, formatPercent, formatCurrency, formatDateTime, channelLabel, cn, stripAgentPrefix } from '../lib/utils';
import { ArrowLeft, User, Clock, CheckCircle, MessageSquare, TrendingUp, Brain, BookOpen, Copy, Check, Link2, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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

function avgNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null);
  if (valid.length === 0) return null;
  return +(valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, +value.toFixed(1)));
}

function levelFromScore(score: number) {
  if (score < 4) return 'Crítico';
  if (score < 6) return 'Fraco';
  if (score < 7.5) return 'Regular';
  if (score < 9) return 'Bom';
  return 'Elite';
}

function alertLevelFromScore(score: number) {
  if (score >= 8) return { label: 'Verde', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  if (score >= 6.5) return { label: 'Amarelo', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (score >= 4.5) return { label: 'Laranja', className: 'border-orange-200 bg-orange-50 text-orange-700' };
  return { label: 'Vermelho', className: 'border-red-200 bg-red-50 text-red-700' };
}

function ManagerStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'purple' | 'danger' | 'lime' }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-2 text-2xl font-bold tracking-[-0.04em]',
        tone === 'purple' && 'text-secondary',
        tone === 'danger' && 'text-red-600',
        tone === 'lime' && 'text-foreground',
        tone === 'neutral' && 'text-foreground',
      )}>
        {value}
      </p>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { isBlockedPhone } = useBlockedPhones();
  const canManageAgents = can('agents.view_all');
  const avatarAutoSyncTriggered = useRef(false);
  const periodEnd = new Date().toISOString().split('T')[0];
  const periodStart = (() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().split('T')[0];
  })();

  const { data: agent } = useQuery<Agent | null>({
    queryKey: ['agent', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('agents')
        .select('*, store:stores(id, company_id, name, is_active, created_at, updated_at)')
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

  const periodComparison = usePeriodComparison<AgentDailyMetrics[]>({
    enabled: !!id && !!companyId,
    queryKey: ['agent-daily-metrics-period-comparison', id, companyId],
    start: periodStart,
    end: periodEnd,
    load: async ({ start, end }) => {
      if (!id || !companyId) return [];
      const { data, error } = await supabase
        .from('metrics_agent_daily')
        .select('*')
        .eq('agent_id', id)
        .eq('company_id', companyId)
        .gte('metric_date', start)
        .lte('metric_date', end)
        .order('metric_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentDailyMetrics[];
    },
  });

  const { data: aiAnalyses } = useQuery<AIConversationAnalysis[]>({
    queryKey: ['agent-ai-analyses', id, periodStart, periodEnd],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('*, conversation:conversations(started_at, channel, customer:customers(name, phone))')
        .eq('agent_id', id)
        .gte('analyzed_at', `${periodStart}T00:00:00.000Z`)
        .lte('analyzed_at', `${periodEnd}T23:59:59.999Z`)
        .order('analyzed_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return ((data ?? []) as AIConversationAnalysis[]).filter((analysis) => !isBlockedPhone((analysis.conversation as any)?.customer?.phone));
    },
    enabled: !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: badges = [] } = useQuery<AgentBadge[]>({
    queryKey: ['agent-badges', companyId, id],
    queryFn: async () => {
      if (!companyId || !id) return [];
      const { data, error } = await supabase.rpc('get_agent_badges', {
        p_company_id: companyId,
        p_agent_id: id,
      });
      if (error) throw error;
      return (data ?? []) as AgentBadge[];
    },
    enabled: !!companyId && !!id,
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
  const previousMetrics = periodComparison.previous ?? [];
  const previousTotalConv = previousMetrics.reduce((s, m) => s + m.conversations_total, 0);
  const previousAvgFrt = previousMetrics.length > 0
    ? Math.floor(previousMetrics.filter(m => m.avg_first_response_sec != null)
        .reduce((s, m) => s + (m.avg_first_response_sec ?? 0), 0) /
        Math.max(previousMetrics.filter(m => m.avg_first_response_sec != null).length, 1))
    : null;
  const previousAvgSla = previousMetrics.length > 0
    ? previousMetrics.filter(m => m.sla_first_response_pct != null)
        .reduce((s, m) => s + (m.sla_first_response_pct ?? 0), 0) /
        Math.max(previousMetrics.filter(m => m.sla_first_response_pct != null).length, 1)
    : null;
  const previousTotalRevenue = previousMetrics.reduce((s, m) => s + m.revenue, 0);

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
  const avgRapport = avgNullable(scoredAnalyses.map((analysis) => analysis.score_rapport));
  const avgUrgency = avgNullable(scoredAnalyses.map((analysis) => analysis.score_urgency));
  const avgValueProposition = avgNullable(scoredAnalyses.map((analysis) => analysis.score_value_proposition));
  const avgInvestigation = scoredAnalyses.length > 0
    ? +(scoredAnalyses.filter(a => a.score_investigation != null).reduce((s, a) => s + (a.score_investigation ?? 0), 0) / Math.max(scoredAnalyses.filter(a => a.score_investigation != null).length, 1)).toFixed(1)
    : null;
  const avgSteering = scoredAnalyses.length > 0
    ? +(scoredAnalyses.filter(a => a.score_commercial_steering != null).reduce((s, a) => s + (a.score_commercial_steering ?? 0), 0) / Math.max(scoredAnalyses.filter(a => a.score_commercial_steering != null).length, 1)).toFixed(1)
    : null;
  const avgObjHandling = scoredAnalyses.length > 0
    ? +(scoredAnalyses.filter(a => a.score_objection_handling != null).reduce((s, a) => s + (a.score_objection_handling ?? 0), 0) / Math.max(scoredAnalyses.filter(a => a.score_objection_handling != null).length, 1)).toFixed(1)
    : null;

  // Aggregate top strengths & improvements from structured_analysis
  const strengthCounts = new Map<string, number>();
  const improvementCounts = new Map<string, number>();
  for (const a of scoredAnalyses) {
    if (!a.structured_analysis) continue;
    for (const s of a.structured_analysis.strengths ?? []) {
      strengthCounts.set(s, (strengthCounts.get(s) ?? 0) + 1);
    }
    for (const s of a.structured_analysis.improvements ?? []) {
      improvementCounts.set(s, (improvementCounts.get(s) ?? 0) + 1);
    }
  }
  const topStrengths = [...strengthCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topImprovements = [...improvementCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const needsCoachingList = aiAnalyses?.filter(a => a.needs_coaching) ?? [];
  const managerDiagnostics = useMemo(() => {
    const total = scoredAnalyses.length;
    const qualityValues = scoredAnalyses.map((analysis) => analysis.quality_score ?? 0);
    const minQuality = qualityValues.length ? Math.min(...qualityValues) : 0;
    const maxQuality = qualityValues.length ? Math.max(...qualityValues) : 0;
    const coachingRate = total > 0 ? (needsCoachingList.length / total) * 100 : 0;
    const closeAttemptRate = total > 0
      ? (scoredAnalyses.filter((analysis) => (analysis.score_commercial_steering ?? 0) >= 7).length / total) * 100
      : 0;
    const followUpRate = total > 0
      ? (scoredAnalyses.filter((analysis) => analysis.used_urgency || (analysis.score_urgency ?? 0) >= 7).length / total) * 100
      : 0;
    const diagnosisRate = total > 0
      ? (scoredAnalyses.filter((analysis) => (analysis.score_investigation ?? 0) >= 7).length / total) * 100
      : 0;
    const abandonmentRate = total > 0
      ? (scoredAnalyses.filter((analysis) => analysis.needs_coaching && (analysis.score_commercial_steering ?? 0) < 6).length / total) * 100
      : 0;
    const passiveResponseRate = total > 0
      ? (scoredAnalyses.filter((analysis) => (analysis.score_commercial_steering ?? 0) < 6).length / total) * 100
      : 0;
    const objectionBase = scoredAnalyses.filter((analysis) => analysis.score_objection_handling != null);
    const weakObjectionRate = objectionBase.length > 0
      ? (objectionBase.filter((analysis) => (analysis.score_objection_handling ?? 0) < 6).length / objectionBase.length) * 100
      : 0;
    const consistencyScore = clampScore(10 - ((maxQuality - minQuality) / 18) - (coachingRate / 18));

    const scorecard = [
      { label: 'Abertura', value: avgRapport ?? avgEmpathy ?? 0 },
      { label: 'Agilidade', value: avgSla != null ? clampScore(avgSla / 10) : 0 },
      { label: 'Diagnóstico', value: avgInvestigation ?? 0 },
      { label: 'Condução', value: avgSteering ?? 0 },
      { label: 'Construção de valor', value: avgValueProposition ?? 0 },
      { label: 'Objeções', value: avgObjHandling ?? 0 },
      { label: 'Fechamento', value: avgUrgency != null && avgSteering != null ? avgNullable([avgUrgency, avgSteering]) ?? 0 : (avgUrgency ?? avgSteering ?? 0) },
      { label: 'Follow-up', value: clampScore(followUpRate / 10) },
      { label: 'Comunicação', value: avgNullable([avgClarity, avgProfessionalism, avgEmpathy]) ?? 0 },
      { label: 'Consistência', value: consistencyScore },
    ];

    const finalScore = clampScore(scorecard.reduce((sum, item) => sum + item.value, 0) / scorecard.length);
    const alertLevel = alertLevelFromScore(finalScore);

    const mainErrors: string[] = [];
    if ((avgSteering ?? 0) < 6) mainErrors.push('Nao conduz a conversa com firmeza e deixa o lead ditar o ritmo.');
    if ((avgInvestigation ?? 0) < 6) mainErrors.push('Faz diagnostico raso e entra cedo demais em resposta ou informacao.');
    if ((avgValueProposition ?? 0) < 6) mainErrors.push('Entrega informacao sem sustentar valor percebido.');
    if ((avgObjHandling ?? 0) < 6) mainErrors.push('Recua diante de objecao em vez de explorar, tensionar e reposicionar valor.');
    if (followUpRate < 45) mainErrors.push('Retoma pouco e abandona oportunidade que ainda poderia ser recuperada.');
    if (closeAttemptRate < 45) mainErrors.push('Chega pouco em tentativa clara de fechamento ou proximo passo firme.');
    if (mainErrors.length === 0) mainErrors.push('Nao existe uma falha dominante grave, mas ha margem de evolucao em consistencia e pressao comercial.');

    const operationalImpact: string[] = [];
    if ((avgSteering ?? 0) < 6) operationalImpact.push('Reduz taxa de avanço porque o lead sai sem direção clara.');
    if ((avgInvestigation ?? 0) < 6) operationalImpact.push('Enfraquece a conversão ao tratar interesse sem aprofundar dor, contexto e urgência.');
    if ((avgValueProposition ?? 0) < 6) operationalImpact.push('Comprime valor percebido e empurra a conversa para preço ou comparação rasa.');
    if (coachingRate >= 40) operationalImpact.push('Aumenta desperdicio de lead porque o padrão de execução ruim se repete em volume.');
    if (passiveResponseRate >= 45) operationalImpact.push('Transforma oportunidade em atendimento passivo, não em condução comercial.');

    let behaviorProfile = 'Atendente com funcao de vendedor';
    if ((avgSteering ?? 0) >= 7 && (avgInvestigation ?? 0) >= 7 && (avgValueProposition ?? 0) >= 7) {
      behaviorProfile = 'Vendedor consultivo e estruturado';
    } else if ((avgRapport ?? 0) >= 7 && (avgSteering ?? 0) < 6) {
      behaviorProfile = 'Educado, rapido e passivo';
    } else if ((avgInvestigation ?? 0) < 6 && (avgSteering ?? 0) < 6) {
      behaviorProfile = 'Operador de resposta com baixa inteligencia comercial';
    } else if ((avgValueProposition ?? 0) < 6 && (avgObjHandling ?? 0) < 6) {
      behaviorProfile = 'Vendedor fraco em valor e muito vulneravel em objecao';
    } else if ((avgSteering ?? 0) >= 7 && (avgUrgency ?? 0) < 6) {
      behaviorProfile = 'Consultivo, mas pouco incisivo no fechamento';
    }

    const failureTags = new Map<string, number>();
    const missedOpportunities = scoredAnalyses.flatMap((analysis) =>
      (analysis.structured_analysis?.missed_opportunities ?? []).map((opportunity) => ({
        ...opportunity,
        conversationId: analysis.conversation_id,
        analyzedAt: analysis.analyzed_at,
      })),
    );

    for (const analysis of scoredAnalyses) {
      for (const tag of analysis.structured_analysis?.failure_tags ?? []) {
        failureTags.set(tag, (failureTags.get(tag) ?? 0) + 1);
      }
    }

    const criticalFailures = [
      ...(passiveResponseRate >= 55 ? ['Passividade recorrente em momentos que exigem controle comercial.'] : []),
      ...(closeAttemptRate < 35 ? ['Baixissima taxa estimada de tentativa de fechamento ou proximo passo.'] : []),
      ...(coachingRate >= 55 ? ['Volume alto de conversas com coaching necessario, sinal de falha estrutural.'] : []),
      ...(missedOpportunities.filter((item) => item.impact === 'high').length >= 3 ? ['Perde oportunidades de alto impacto em volume que ja virou padrao.'] : []),
    ];
    const highFailures = [
      ...((avgInvestigation ?? 0) < 6 ? ['Diagnostico insuficiente para venda consultiva.'] : []),
      ...((avgValueProposition ?? 0) < 6 ? ['Baixa capacidade de sustentar valor na conversa.'] : []),
      ...(weakObjectionRate >= 45 ? ['Objeções mal tratadas com frequência relevante.'] : []),
      ...(followUpRate < 45 ? ['Follow-up abaixo do necessário para proteger lead morno.'] : []),
    ];
    const mediumFailures = [
      ...((avgClarity ?? 0) < 7 ? ['Comunicação perde força por clareza mediana.'] : []),
      ...((avgEmpathy ?? 0) < 7 ? ['Conexao com o lead existe, mas nao sustenta confiança forte.'] : []),
      ...((avgUrgency ?? 0) < 6.5 ? ['Baixa pressão comercial para gerar decisão ou avanço.'] : []),
    ];
    const lowFailures = [
      ...(total < 8 ? ['Base de conversas analisadas ainda pequena para cravar padrão absoluto.'] : []),
      ...(consistencyScore < 7 ? ['Oscilação de execução entre conversas ainda perceptível.'] : []),
    ];

    const managerActions = [
      ...(criticalFailures.length > 0 ? ['Colocar sob monitoramento de conversa com revisão semanal.'] : []),
      ...((avgObjHandling ?? 0) < 6 ? ['Treinar objeção e reação a preço com roleplay prático.'] : []),
      ...((avgSteering ?? 0) < 6 ? ['Cobrar próximo passo claro em toda conversa relevante.'] : []),
      ...(followUpRate < 45 ? ['Criar meta de retomada e follow-up, não só meta de resposta.'] : []),
      ...(closeAttemptRate < 45 ? ['Exigir CTA explícito e fechamento de etapa em mais conversas.'] : []),
    ];

    const trainableAssessment =
      finalScore < 4.5
        ? 'Hoje o quadro indica problema de postura e execução. É treinável, mas exige acompanhamento intenso e cobrança diária.'
        : finalScore < 6.5
          ? 'É treinável, mas o problema já está afetando resultado e precisa de intervenção firme de gestão.'
          : 'Há base para evoluir com treino direcionado, desde que a gestão não alivie falhas de condução e fechamento.';

    const unfilteredManagerNote =
      finalScore < 4.5
        ? 'Hoje este vendedor opera abaixo do que a função exige. Existe atendimento, mas falta peso comercial para sustentar avanço e conversão.'
        : finalScore < 6.5
          ? 'O vendedor ainda não extrai o máximo das oportunidades que recebe. A operação entrega lead, mas a execução devolve perda evitável.'
          : 'O vendedor ajuda a operação, mas ainda deixa dinheiro na mesa quando precisa conduzir melhor, aprofundar necessidade e pedir avanço.';

    const interventionPlan = {
      stopNow: [
        ...(avgSteering != null && avgSteering < 6 ? ['Parar de encerrar conversa sem próximo passo definido.'] : []),
        ...(avgInvestigation != null && avgInvestigation < 6 ? ['Parar de responder superficialmente sem diagnosticar dor e contexto.'] : []),
        ...(avgValueProposition != null && avgValueProposition < 6 ? ['Parar de entregar informação e preço sem construir valor antes.'] : []),
      ].slice(0, 3),
      startNow: [
        'Aplicar CTA claro em todas as conversas com intenção comercial.',
        'Fazer pelo menos 3 perguntas de diagnóstico antes de proposta.',
        'Retomar lead morno com contexto e objetivo, não só com cobrança de resposta.',
      ].slice(0, 3),
      trainNext30Days: [
        'Diagnóstico comercial e aprofundamento de dor.',
        'Condução para próximo passo e fechamento de etapa.',
        'Tratamento de objeção com reposicionamento de valor.',
      ],
    };

    const lostOpportunities = missedOpportunities
      .sort((a, b) => {
        const impactWeight = { high: 3, medium: 2, low: 1 };
        return impactWeight[b.impact] - impactWeight[a.impact];
      })
      .slice(0, 4);

    return {
      scorecard,
      finalScore,
      level: levelFromScore(finalScore),
      alertLevel,
      closeAttemptRate,
      followUpRate,
      diagnosisRate,
      abandonmentRate,
      weakObjectionRate,
      passiveResponseRate,
      mainErrors,
      operationalImpact,
      behaviorProfile,
      criticalFailures,
      highFailures,
      mediumFailures,
      lowFailures,
      unfilteredManagerNote,
      trainableAssessment,
      managerActions,
      interventionPlan,
      lostOpportunities,
      opportunityLossCount: missedOpportunities.length,
      topFailureTags: [...failureTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [
    avgClarity,
    avgEmpathy,
    avgInvestigation,
    avgObjHandling,
    avgProfessionalism,
    avgQuality,
    avgRapport,
    avgSla,
    avgSteering,
    avgUrgency,
    avgValueProposition,
    needsCoachingList.length,
    scoredAnalyses,
  ]);
  const syncAgentAvatars = useMutation({
    mutationFn: async (_options?: { silent?: boolean }) => {
      if (!companyId) throw new Error('Empresa nao encontrada');
      return invokeSyncAgentAvatars(companyId);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents', companyId] });
      queryClient.invalidateQueries({ queryKey: ['agent', id] });
      if (!variables?.silent) {
        toast.success(
          result.stats?.updated
            ? `${result.stats.updated} foto(s) sincronizada(s) da UazAPI.`
            : 'A foto deste vendedor ja estava atualizada.',
        );
      }
    },
    onError: (error: Error, variables) => {
      if (!variables?.silent) {
        toast.error(error.message);
      } else {
        console.error('[AgentDetail] avatar sync failed:', error.message);
      }
    },
  });
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [agent?.avatar_url]);

  useEffect(() => {
    avatarAutoSyncTriggered.current = false;
  }, [companyId, id]);

  useEffect(() => {
    if (!canManageAgents || !companyId || !agent || agent.avatar_url || syncAgentAvatars.isPending || avatarAutoSyncTriggered.current) {
      return;
    }

    avatarAutoSyncTriggered.current = true;
    syncAgentAvatars.mutate({ silent: true });
  }, [agent, canManageAgents, companyId, syncAgentAvatars]);

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
          {agent.avatar_url && !avatarError ? (
            <img src={agent.avatar_url} alt={agent.name} className="h-12 w-12 rounded-full object-cover" onError={() => setAvatarError(true)} />
          ) : (
            <div className="h-12 w-12 bg-accent rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-foreground">{agent.name}</h2>
            {agent.email && <p className="text-muted-foreground">{agent.email}</p>}
            {agent.store?.name && <p className="text-sm text-muted-foreground mt-1">Loja: {agent.store.name}</p>}
            {canManageAgents && (
              <button
                type="button"
                onClick={() => syncAgentAvatars.mutate(undefined)}
                disabled={syncAgentAvatars.isPending}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncAgentAvatars.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {agent.avatar_url ? 'Atualizar foto pela UazAPI' : 'Buscar foto na UazAPI'}
              </button>
            )}
            {badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <BadgePill key={badge.badge_key} badge={badge} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-500/20 dark:bg-amber-950/10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Badges da semana</h3>
              <p className="text-sm text-muted-foreground">Reconhecimentos automáticos calculados a partir da operação recente.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <BadgePill key={`${badge.badge_key}-summary`} badge={badge} />
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {badges.map((badge) => (
              <div key={`${badge.badge_key}-card`} className="rounded-xl border border-white/60 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-semibold text-foreground">{badge.badge_label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{badge.badge_description}</p>
                <p className="mt-2 text-sm text-foreground">{badge.award_reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
          trend={getPercentDelta(totalConv, previousTotalConv)}
          trendLabel="vs. 30 dias anteriores"
        />
        <MetricCard
          title="Tempo Primeira Resp."
          value={formatSeconds(avgFrt)}
          icon={<Clock className="h-5 w-5 text-primary" />}
          trend={(() => {
            const delta = getPercentDelta(avgFrt, previousAvgFrt);
            return delta == null ? null : delta * -1;
          })()}
          trendLabel="mais rapido que o periodo anterior"
        />
        <MetricCard
          title="SLA %"
          value={formatPercent(avgSla)}
          icon={<CheckCircle className="h-5 w-5 text-primary" />}
          trend={getPercentDelta(avgSla, previousAvgSla)}
          trendLabel="vs. 30 dias anteriores"
        />
        <MetricCard
          title="Receita (30d)"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          trend={getPercentDelta(totalRevenue, previousTotalRevenue)}
          trendLabel="vs. 30 dias anteriores"
        />
      </div>

      {scoredAnalyses.length > 0 && (
        <div className="rounded-[30px] border border-border bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-secondary/10 bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-secondary">
                  Diagnostico de Gestao
                </div>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-foreground">Leitura critica da performance comercial deste vendedor</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Relatorio construido a partir das analises do periodo, com foco em impacto operacional, risco de perda e necessidade de intervencao da gestao.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn('rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]', managerDiagnostics.alertLevel.className)}>
                  Alerta {managerDiagnostics.alertLevel.label}
                </span>
                <div className="rounded-2xl border border-border bg-card px-4 py-3 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nota final</p>
                  <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-foreground">{managerDiagnostics.finalScore}/10</p>
                  <p className="text-xs font-medium text-muted-foreground">{managerDiagnostics.level}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-border px-6 py-5 md:grid-cols-2 xl:grid-cols-6">
            <ManagerStat label="Tentativa de fechamento" value={`${Math.round(managerDiagnostics.closeAttemptRate)}%`} tone="lime" />
            <ManagerStat label="Follow-up estimado" value={`${Math.round(managerDiagnostics.followUpRate)}%`} tone="purple" />
            <ManagerStat label="Diagnostico real" value={`${Math.round(managerDiagnostics.diagnosisRate)}%`} />
            <ManagerStat label="Abandono estimado" value={`${Math.round(managerDiagnostics.abandonmentRate)}%`} tone="danger" />
            <ManagerStat label="Objecao mal tratada" value={`${Math.round(managerDiagnostics.weakObjectionRate)}%`} tone="danger" />
            <ManagerStat label="Resposta passiva" value={`${Math.round(managerDiagnostics.passiveResponseRate)}%`} tone="danger" />
          </div>

          <div className="grid gap-6 border-b border-border px-6 py-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Veredito executivo</p>
                <p className="mt-3 text-base font-semibold leading-7 text-foreground">{managerDiagnostics.unfilteredManagerNote}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Padrao real de comportamento</p>
                <p className="mt-3 text-base font-semibold text-foreground">{managerDiagnostics.behaviorProfile}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{managerDiagnostics.trainableAssessment}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">O gestor precisa saber sem filtro</p>
              <ul className="mt-3 space-y-2">
                {managerDiagnostics.mainErrors.slice(0, 4).map((item) => (
                  <li key={item} className="text-sm font-medium leading-6 text-red-700">{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6 border-b border-border px-6 py-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placar por competencia</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {managerDiagnostics.scorecard.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className="text-sm font-bold text-foreground">{item.value}/10</span>
                    </div>
                    <div className="mt-2">
                      <ScoreBar value={item.value} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Como ele prejudica a operacao</p>
                <ul className="mt-4 space-y-2">
                  {managerDiagnostics.operationalImpact.map((item) => (
                    <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pontos fortes ainda relevantes</p>
                <ul className="mt-4 space-y-2">
                  {topStrengths.length > 0 ? topStrengths.slice(0, 3).map(([text, count]) => (
                    <li key={text} className="text-sm leading-6 text-foreground">{text} <span className="text-xs text-muted-foreground">({count}x)</span></li>
                  )) : (
                    <li className="text-sm leading-6 text-muted-foreground">Nao ha ponto forte recorrente forte o bastante para equilibrar as falhas dominantes.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid gap-6 border-b border-border px-6 py-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Falhas por gravidade</p>
              <div className="mt-4 grid gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Criticas</p>
                  <ul className="mt-2 space-y-2">
                    {(managerDiagnostics.criticalFailures.length > 0 ? managerDiagnostics.criticalFailures : ['Nenhuma falha critica dominante no recorte atual.']).map((item) => (
                      <li key={`critical-${item}`} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Altas</p>
                  <ul className="mt-2 space-y-2">
                    {(managerDiagnostics.highFailures.length > 0 ? managerDiagnostics.highFailures : ['Sem falhas altas adicionais.']).map((item) => (
                      <li key={`high-${item}`} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Medias</p>
                  <ul className="mt-2 space-y-2">
                    {(managerDiagnostics.mediumFailures.length > 0 ? managerDiagnostics.mediumFailures : ['Sem falhas medias relevantes.']).map((item) => (
                      <li key={`medium-${item}`} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Baixas</p>
                  <ul className="mt-2 space-y-2">
                    {(managerDiagnostics.lowFailures.length > 0 ? managerDiagnostics.lowFailures : ['Sem falhas baixas adicionais.']).map((item) => (
                      <li key={`low-${item}`} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Oportunidades perdidas</p>
              <div className="mt-4 space-y-4">
                {managerDiagnostics.lostOpportunities.length > 0 ? managerDiagnostics.lostOpportunities.map((item, index) => (
                  <div key={`${item.conversationId}-${index}`} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Conversa #{item.conversationId.slice(0, 8)}</p>
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]',
                        item.impact === 'high' ? 'bg-red-100 text-red-700' : item.impact === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground',
                      )}>
                        {item.impact}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground">{item.missed_action}</p>
                    {item.agent_message && (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">Mensagem observada: {item.agent_message}</p>
                    )}
                  </div>
                )) : (
                  <p className="text-sm leading-6 text-muted-foreground">Nao houve oportunidade perdida estruturada o bastante nas analises para entrar como destaque aqui.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Acao recomendada ao gestor</p>
              <ul className="mt-4 space-y-2">
                {managerDiagnostics.managerActions.map((item) => (
                  <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                ))}
              </ul>
              {managerDiagnostics.topFailureTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {managerDiagnostics.topFailureTags.map(([tag, count]) => (
                    <span key={tag} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-secondary">
                      {tag.replace(/_/g, ' ')} ({count}x)
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plano de intervencao de 30 dias</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Parar agora</p>
                  <ul className="mt-2 space-y-2">
                    {managerDiagnostics.interventionPlan.stopNow.map((item) => (
                      <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Comecar agora</p>
                  <ul className="mt-2 space-y-2">
                    {managerDiagnostics.interventionPlan.startNow.map((item) => (
                      <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Treinar</p>
                  <ul className="mt-2 space-y-2">
                    {managerDiagnostics.interventionPlan.trainNext30Days.map((item) => (
                      <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Investigacao</span>
                  <div className="flex-1"><ScoreBar value={avgInvestigation} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Cond. Comercial</span>
                  <div className="flex-1"><ScoreBar value={avgSteering} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28">Objecoes</span>
                  <div className="flex-1"><ScoreBar value={avgObjHandling} /></div>
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

          {/* Aggregated Strengths / Improvements */}
          {(topStrengths.length > 0 || topImprovements.length > 0) && (
            <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {topStrengths.length > 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">Pontos Fortes Recorrentes</p>
                  <ul className="space-y-1">
                    {topStrengths.map(([text, count]) => (
                      <li key={text} className="text-xs text-green-800 flex items-start gap-1.5">
                        <span className="text-green-500 mt-0.5">•</span>
                        <span>{text}</span>
                        <span className="text-green-500 ml-auto">({count}x)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {topImprovements.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 mb-2">Melhorias Recorrentes</p>
                  <ul className="space-y-1">
                    {topImprovements.map(([text, count]) => (
                      <li key={text} className="text-xs text-orange-800 flex items-start gap-1.5">
                        <span className="text-orange-500 mt-0.5">•</span>
                        <span>{text}</span>
                        <span className="text-orange-500 ml-auto">({count}x)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
                  <th className="px-6 py-3 text-right">Invest.</th>
                  <th className="px-6 py-3 text-right">Cond.</th>
                  <th className="px-6 py-3">Coaching</th>
                  <th className="px-6 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {aiAnalyses.map(analysis => {
                  const conv = analysis.conversation as any;
                  const customerName = stripAgentPrefix(conv?.customer?.name, agent?.name, conv?.customer?.phone);
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
                      <td className="px-6 py-3 text-right text-muted-foreground">{analysis.score_investigation ?? '—'}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{analysis.score_commercial_steering ?? '—'}</td>
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
                    {stripAgentPrefix(conv.customer?.name, agent?.name, conv.customer?.phone)}
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
