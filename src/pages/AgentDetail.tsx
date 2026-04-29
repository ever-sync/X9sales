import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import type { Agent, AgentBadge, AgentDailyMetrics, AIConversationAnalysis, AIInsightsSummary } from '../types';
import { useConversations } from '../hooks/useConversations';
import { useBlockedPhones } from '../hooks/useBlockedPhones';
import { getPercentDelta, usePeriodComparison } from '../hooks/usePeriodComparison';
import { CACHE } from '../config/constants';
import { MetricCard } from '../components/dashboard/MetricCard';
import { BadgePill } from '../components/gamification/BadgePill';
import { invokeSyncAgentAvatars } from '../lib/agentAvatarSync';
import { formatSeconds, formatPercent, formatCurrency, formatDateTime, channelLabel, cn, stripAgentPrefix } from '../lib/utils';
import { ArrowLeft, User, Clock, CheckCircle, MessageSquare, TrendingUp, Brain, BookOpen, Camera, Loader2, Pencil, MessageCircle } from 'lucide-react';
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

export default function AgentDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { companyId, company } = useCompany();
  const timezone = company?.settings?.timezone || 'UTC';
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

  const previousPeriodEnd = (() => {
    const date = new Date(periodStart);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  })();
  const previousPeriodStart = (() => {
    const date = new Date(previousPeriodEnd);
    date.setDate(date.getDate() - 29);
    return date.toISOString().split('T')[0];
  })();

  const { data: previousAgentSummary } = useQuery<AIInsightsSummary>({
    queryKey: ['agent-ai-summary-previous', companyId, id, previousPeriodStart, previousPeriodEnd, timezone],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_insights_summary', {
        p_company_id: companyId,
        p_agent_id: id,
        p_period_start: previousPeriodStart,
        p_period_end: previousPeriodEnd,
        p_timezone: timezone,
        p_tag: null,
        p_needs_coaching: null,
      });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? {
        analyses_total: 0,
        avg_score: null,
        lowest_score: null,
        coaching_count: 0,
        coaching_rate: 0,
      }) as AIInsightsSummary;
    },
    enabled: !!companyId && !!id,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: teamSummary } = useQuery<AIInsightsSummary>({
    queryKey: ['agent-ai-summary-team', companyId, periodStart, periodEnd, timezone],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_insights_summary', {
        p_company_id: companyId,
        p_agent_id: null,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_timezone: timezone,
        p_tag: null,
        p_needs_coaching: null,
      });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? {
        analyses_total: 0,
        avg_score: null,
        lowest_score: null,
        coaching_count: 0,
        coaching_rate: 0,
      }) as AIInsightsSummary;
    },
    enabled: !!companyId,
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
  const { data: leadTransferCandidates = [], isLoading: isLoadingLeadTransfers, error: leadTransferError } = useQuery<Array<{
    id: string;
    status: string;
    started_at: string | null;
    customer_name: string;
    customer_phone: string;
    first_response_time_sec: number;
    sla_sec: number;
    excess_sec: number;
  }>>({
    queryKey: ['agent-lead-transfers', companyId, id, company?.settings?.sla_first_response_sec],
    queryFn: async () => {
      if (!companyId || !id) return [];
      const slaSec = company?.settings?.sla_first_response_sec ?? 0;
      if (slaSec <= 0) return [];

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from('conversations')
        .select('id, status, started_at, customer:customers(name, phone), metrics:metrics_conversation(first_response_time_sec)')
        .eq('company_id', companyId)
        .eq('agent_id', id)
        .gte('started_at', since.toISOString())
        .order('started_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      return ((data ?? []) as any[])
        .map((row) => {
          const customer = Array.isArray(row.customer) ? (row.customer[0] ?? null) : row.customer;
          const metrics = Array.isArray(row.metrics) ? (row.metrics[0] ?? null) : row.metrics;
          const firstResponse = Number(metrics?.first_response_time_sec ?? 0);
          return {
            id: row.id as string,
            status: row.status as string,
            started_at: row.started_at as string | null,
            customer_name: String(customer?.name ?? 'Cliente sem nome'),
            customer_phone: String(customer?.phone ?? ''),
            first_response_time_sec: firstResponse,
            sla_sec: slaSec,
            excess_sec: Math.max(firstResponse - slaSec, 0),
          };
        })
        .filter((item) =>
          item.first_response_time_sec > item.sla_sec &&
          !isBlockedPhone(item.customer_phone),
        );
    },
    enabled: !!companyId && !!id && !!company?.settings?.sla_first_response_sec,
    staleTime: CACHE.STALE_TIME,
  });

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
  const [erroredAvatarUrl, setErroredAvatarUrl] = useState<string | null>(null);
  const avatarError = !!agent?.avatar_url && erroredAvatarUrl === agent.avatar_url;

  const [showAllStats, setShowAllStats] = useState(false);
  const [showAllCompetencies, setShowAllCompetencies] = useState(false);

  const conversationCustomerMap = useMemo(() => {
    const map = new Map<string, { name?: string; phone?: string }>();
    for (const analysis of aiAnalyses ?? []) {
      const conv = analysis.conversation as any;
      if (analysis.conversation_id && conv?.customer) {
        map.set(analysis.conversation_id, conv.customer);
      }
    }
    return map;
  }, [aiAnalyses]);

  const rankedKpis = useMemo(() => {
    const stats = [
      { label: 'Tentativa de fechamento', value: managerDiagnostics.closeAttemptRate, lowerIsWorse: true, benchmark: 60 },
      { label: 'Follow-up estimado', value: managerDiagnostics.followUpRate, lowerIsWorse: true, benchmark: 60 },
      { label: 'Diagnóstico real', value: managerDiagnostics.diagnosisRate, lowerIsWorse: true, benchmark: 60 },
      { label: 'Abandono estimado', value: managerDiagnostics.abandonmentRate, lowerIsWorse: false, benchmark: 30 },
      { label: 'Objeção mal tratada', value: managerDiagnostics.weakObjectionRate, lowerIsWorse: false, benchmark: 40 },
      { label: 'Resposta passiva', value: managerDiagnostics.passiveResponseRate, lowerIsWorse: false, benchmark: 40 },
    ];
    return stats
      .map((stat) => ({
        ...stat,
        severity: stat.lowerIsWorse ? Math.max(0, stat.benchmark - stat.value) : Math.max(0, stat.value - stat.benchmark),
        note: stat.lowerIsWorse
          ? `Esperado >${stat.benchmark}% · está em ${Math.round(stat.value)}%`
          : `Esperado <${stat.benchmark}% · está em ${Math.round(stat.value)}%`,
      }))
      .sort((a, b) => b.severity - a.severity);
  }, [managerDiagnostics]);

  const sortedScorecard = useMemo(
    () => [...managerDiagnostics.scorecard].sort((a, b) => b.value - a.value),
    [managerDiagnostics.scorecard],
  );

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

  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'diagnostics' | 'metrics' | 'leads' | 'action'>('overview');

  const tabs = [
    { id: 'overview' as const, label: 'Visão Geral' },
    { id: 'ai' as const, label: 'Análise' },
    { id: 'diagnostics' as const, label: 'Diagnóstico' },
    { id: 'metrics' as const, label: 'Métricas Diárias' },
    { id: 'leads' as const, label: 'Leads' },
    { id: 'action' as const, label: 'Plano de ação' },
  ];

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const whatsappWebhookUrl = (supabaseUrl && companyId && agent.external_id)
    ? `${supabaseUrl}/functions/v1/uazapi-webhook?company_id=${companyId}&agent_id=${agent.external_id}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/agents"
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-3">
            {agent.avatar_url && !avatarError ? (
              <img
                src={agent.avatar_url}
                alt={agent.name}
                className="h-12 w-12 rounded-full object-cover"
                onError={() => setErroredAvatarUrl(agent.avatar_url ?? null)}
              />
            ) : (
              <div className="h-12 w-12 bg-accent rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-foreground">{agent.name}</h2>
              {agent.email && <p className="text-muted-foreground">{agent.email}</p>}
              {agent.store?.name && <p className="text-sm text-muted-foreground mt-1">Loja: {agent.store.name}</p>}
            </div>
          </div>
        </div>
        {canManageAgents && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => syncAgentAvatars.mutate(undefined)}
              disabled={syncAgentAvatars.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncAgentAvatars.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Atualizar foto
            </button>
            <button
              type="button"
              onClick={() => navigate('/agents')}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <Pencil className="h-4 w-4" />
              Editar atendente
            </button>
            <button
              type="button"
              onClick={() => {
                if (!whatsappWebhookUrl) {
                  toast.error('Atendente sem ID Externo. Configure para conectar o WhatsApp.');
                  return;
                }
                navigator.clipboard.writeText(whatsappWebhookUrl).then(() => {
                  toast.success('URL copiada. Cole no UazAPI para conectar o WhatsApp.');
                }).catch(() => {
                  toast.error('Não foi possível copiar a URL.');
                });
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-primary/90"
            >
              <MessageCircle className="h-4 w-4" />
              Conectar WhatsApp
            </button>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border rounded-[20px] bg-[#f0f0f0] px-2 pt-2">
        <nav className="-mb-px flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Visão Geral */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
        </div>
      )}

      {/* Tab: Diagnóstico de Gestão */}
      {activeTab === 'diagnostics' && scoredAnalyses.length > 0 && (
        <div className="rounded-[30px] border border-border bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)] overflow-hidden">
          {/* 1. Cabeçalho */}
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-secondary/10 bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-secondary">
                  Diagnóstico de Gestão
                </div>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-foreground">Leitura crítica da performance comercial deste vendedor</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  Baseado em {scoredAnalyses.length} análise{scoredAnalyses.length !== 1 ? 's' : ''} de conversa do período (últimos 30 dias).
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

            {/* Comparação: este vendedor vs time vs período anterior */}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(() => {
                const agentScore = avgQuality;
                const teamScore = teamSummary?.avg_score != null ? Math.round(teamSummary.avg_score) : null;
                const prevScore = previousAgentSummary?.avg_score != null ? Math.round(previousAgentSummary.avg_score) : null;
                const teamDelta = agentScore != null && teamScore != null ? agentScore - teamScore : null;
                const trendDelta = agentScore != null && prevScore != null ? agentScore - prevScore : null;
                const teamDeltaLabel = teamDelta == null
                  ? '—'
                  : teamDelta === 0
                    ? 'na média do time'
                    : `${teamDelta > 0 ? '+' : ''}${teamDelta} vs. time`;
                const trendLabel = trendDelta == null
                  ? 'sem base anterior'
                  : trendDelta === 0
                    ? 'estável vs. 30d antes'
                    : trendDelta > 0
                      ? `↑ ${trendDelta} pts vs. 30d antes`
                      : `↓ ${Math.abs(trendDelta)} pts vs. 30d antes`;
                return (
                  <>
                    <div className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Score IA · este vendedor</p>
                      <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-foreground">{agentScore ?? '—'}<span className="text-sm font-medium text-muted-foreground">/100</span></p>
                      <p className={cn(
                        'text-xs font-medium mt-0.5',
                        teamDelta == null ? 'text-muted-foreground'
                        : teamDelta >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}>{teamDeltaLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Média do time</p>
                      <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-foreground">{teamScore ?? '—'}<span className="text-sm font-medium text-muted-foreground">/100</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {teamSummary?.analyses_total != null ? `${teamSummary.analyses_total} análises do time (30d)` : 'Sem dados do time'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tendência</p>
                      <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-foreground">{prevScore ?? '—'}<span className="text-sm font-medium text-muted-foreground">/100 antes</span></p>
                      <p className={cn(
                        'text-xs font-medium mt-0.5',
                        trendDelta == null ? 'text-muted-foreground'
                        : trendDelta > 0 ? 'text-emerald-600'
                        : trendDelta < 0 ? 'text-red-600' : 'text-muted-foreground',
                      )}>{trendLabel}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* 2. Veredito + Perfil + Sem filtro */}
          <div className="grid gap-6 border-b border-border px-6 py-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Veredito executivo</p>
              <p className="mt-3 text-base font-semibold leading-7 text-foreground">{managerDiagnostics.unfilteredManagerNote}</p>
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Perfil real</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{managerDiagnostics.behaviorProfile}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{managerDiagnostics.trainableAssessment}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">O gestor precisa saber sem filtro</p>
              <ul className="mt-3 space-y-2">
                {managerDiagnostics.mainErrors.slice(0, 3).map((item) => (
                  <li key={item} className="text-sm font-medium leading-6 text-red-700">{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 3. Falhas dominantes (top 3 KPIs piores) */}
          <div className="border-b border-border px-6 py-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Falhas dominantes</p>
                <p className="text-xs text-muted-foreground mt-1">Os indicadores onde a operação mais perde dinheiro hoje.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllStats((v) => !v)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {showAllStats ? 'Ver só os 3 piores' : 'Ver os 6 indicadores'}
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(showAllStats ? rankedKpis : rankedKpis.slice(0, 3)).map((kpi) => {
                const isCritical = kpi.severity > 0;
                return (
                  <div
                    key={kpi.label}
                    className={cn(
                      'rounded-2xl border p-4',
                      isCritical ? 'border-red-200 bg-red-50/60' : 'border-border bg-card',
                    )}
                  >
                    <p className={cn('text-[11px] font-bold uppercase tracking-[0.18em]', isCritical ? 'text-red-600' : 'text-muted-foreground')}>
                      {kpi.label}
                    </p>
                    <p className={cn('mt-2 text-3xl font-bold tracking-[-0.04em]', isCritical ? 'text-red-700' : 'text-foreground')}>
                      {Math.round(kpi.value)}%
                    </p>
                    <p className={cn('mt-1 text-xs', isCritical ? 'text-red-600' : 'text-muted-foreground')}>
                      {kpi.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Placar de competências (top + bottom) */}
          <div className="border-b border-border px-6 py-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placar por competência</p>
                <p className="text-xs text-muted-foreground mt-1">Top 3 fortes vs. top 3 lacunas. Avaliação de 0 a 10 por área.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllCompetencies((v) => !v)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {showAllCompetencies ? 'Ver só destaques' : 'Ver todas as 10'}
              </button>
            </div>
            {showAllCompetencies ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sortedScorecard.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className="text-sm font-bold text-foreground">{item.value}/10</span>
                    </div>
                    <div className="mt-2"><ScoreBar value={item.value} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Pontos fortes</p>
                  <div className="mt-3 grid gap-2">
                    {sortedScorecard.slice(0, 3).map((item) => (
                      <div key={item.label} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          <span className="text-sm font-bold text-foreground">{item.value}/10</span>
                        </div>
                        <div className="mt-2"><ScoreBar value={item.value} /></div>
                      </div>
                    ))}
                  </div>
                  {topStrengths.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Recorrência observada: {topStrengths.slice(0, 2).map(([text, count]) => `${text} (${count}x)`).join(' · ')}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Lacunas críticas</p>
                  <div className="mt-3 grid gap-2">
                    {[...sortedScorecard].slice(-3).reverse().map((item) => (
                      <div key={item.label} className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          <span className="text-sm font-bold text-foreground">{item.value}/10</span>
                        </div>
                        <div className="mt-2"><ScoreBar value={item.value} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Impacto operacional */}
          {managerDiagnostics.operationalImpact.length > 0 && (
            <div className="border-b border-border px-6 py-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Como isso prejudica a operação</p>
              <ul className="mt-3 space-y-2">
                {managerDiagnostics.operationalImpact.map((item) => (
                  <li key={item} className="text-sm leading-6 text-foreground flex gap-2">
                    <span className="text-red-500 mt-2 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 6. Plano de ação único */}
          <div className="border-b border-border px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plano de intervenção · próximos 30 dias</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Parar agora</p>
                <ul className="mt-3 space-y-2">
                  {managerDiagnostics.interventionPlan.stopNow.length > 0
                    ? managerDiagnostics.interventionPlan.stopNow.map((item) => (
                        <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                      ))
                    : <li className="text-sm leading-6 text-muted-foreground">Sem comportamentos críticos para interromper.</li>}
                </ul>
              </div>
              <div className="rounded-2xl border border-secondary/20 bg-accent/40 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Começar agora</p>
                <ul className="mt-3 space-y-2">
                  {managerDiagnostics.interventionPlan.startNow.map((item) => (
                    <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Treinar</p>
                <ul className="mt-3 space-y-2">
                  {managerDiagnostics.interventionPlan.trainNext30Days.map((item) => (
                    <li key={item} className="text-sm leading-6 text-foreground">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            {managerDiagnostics.topFailureTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center">Padrões recorrentes:</span>
                {managerDiagnostics.topFailureTags.map(([tag, count]) => (
                  <span key={tag} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-secondary">
                    {tag.replace(/_/g, ' ')} ({count}x)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 7. Evidências */}
          <div className="px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Evidências · oportunidades perdidas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {managerDiagnostics.opportunityLossCount > 0
                ? `${managerDiagnostics.opportunityLossCount} oportunidade${managerDiagnostics.opportunityLossCount !== 1 ? 's' : ''} mapeada${managerDiagnostics.opportunityLossCount !== 1 ? 's' : ''} no período. Mostrando as de maior impacto.`
                : 'Sem oportunidades perdidas estruturadas neste recorte.'}
            </p>
            {managerDiagnostics.lostOpportunities.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {managerDiagnostics.lostOpportunities.map((item, index) => {
                  const customer = conversationCustomerMap.get(item.conversationId);
                  const customerLabel = stripAgentPrefix(customer?.name, agent?.name, customer?.phone) || customer?.phone || `Conversa #${item.conversationId.slice(0, 8)}`;
                  return (
                    <div key={`${item.conversationId}-${index}`} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground truncate">{customerLabel}</p>
                        <span className={cn(
                          'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] shrink-0',
                          item.impact === 'high' ? 'bg-red-100 text-red-700' : item.impact === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground',
                        )}>
                          {item.impact}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground">{item.missed_action}</p>
                      {item.agent_message && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground italic">"{item.agent_message}"</p>
                      )}
                      <Link
                        to={`/conversations/${item.conversationId}`}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Ver conversa →
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'diagnostics' && scoredAnalyses.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Sem dados suficientes para diagnóstico neste período.
        </div>
      )}

      {/* Tab: Análise IA */}
      {activeTab === 'ai' && aiAnalyses && aiAnalyses.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Análise IA</h3>
            <span className="ml-auto text-xs text-muted-foreground">{aiAnalyses.length} conversa{aiAnalyses.length !== 1 ? 's' : ''} analisada{aiAnalyses.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
      {activeTab === 'ai' && (!aiAnalyses || aiAnalyses.length === 0) && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Sem análises de IA disponíveis para este atendente.
        </div>
      )}

      {/* Tab: Métricas Diárias */}
      {activeTab === 'metrics' && metrics && metrics.length > 0 && (
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
      {activeTab === 'metrics' && (!metrics || metrics.length === 0) && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Sem métricas diárias registradas para este atendente.
        </div>
      )}

      {/* Tab: Leads */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leads transferíveis (30d)</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{leadTransferCandidates.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Conversas com 1ª resposta acima do SLA de {formatSeconds(company?.settings?.sla_first_response_sec ?? 0)}.
            </p>
          </div>

          {isLoadingLeadTransfers && (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Carregando leads transferíveis...
            </div>
          )}

          {leadTransferError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              Não foi possível carregar os dados de leads transferíveis.
            </div>
          )}

          {!isLoadingLeadTransfers && !leadTransferError && leadTransferCandidates.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Nenhuma lead transferível encontrada no período.
            </div>
          )}

          {!isLoadingLeadTransfers && !leadTransferError && leadTransferCandidates.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <th className="px-6 py-3">Cliente</th>
                      <th className="px-6 py-3 text-right">1ª resposta</th>
                      <th className="px-6 py-3 text-right">SLA alvo</th>
                      <th className="px-6 py-3 text-right">Excesso</th>
                      <th className="px-6 py-3">Data</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leadTransferCandidates.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/50">
                        <td className="px-6 py-3 text-foreground">{item.customer_name}</td>
                        <td className="px-6 py-3 text-right text-foreground">{formatSeconds(item.first_response_time_sec)}</td>
                        <td className="px-6 py-3 text-right text-muted-foreground">{formatSeconds(item.sla_sec)}</td>
                        <td className="px-6 py-3 text-right font-semibold text-red-600">+{Math.ceil(item.excess_sec / 60)} min</td>
                        <td className="px-6 py-3 text-muted-foreground">{item.started_at ? formatDateTime(item.started_at) : '—'}</td>
                        <td className="px-6 py-3 text-muted-foreground">{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Plano de ação */}
      {activeTab === 'action' && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground">Plano de ação</h3>
          <div className="mt-4 space-y-3 text-sm text-foreground">
            <p>1. Priorizar follow-up das conversas com maior risco no período.</p>
            <p>2. Reforçar condução comercial nas abordagens com alto índice de passividade.</p>
            <p>3. Revisar objeções recorrentes e atualizar script de resposta com o gestor.</p>
          </div>
        </div>
      )}
    </div>
  );
}
