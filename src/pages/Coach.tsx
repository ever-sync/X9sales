import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import type { NotificationJobSummary } from '../types';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';

type AgentRow = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
};

type CoachHistoryGroup = {
  agentId: string;
  agentName: string;
  phone: string | null;
  jobs: NotificationJobSummary[];
};

function formatLocalTime(timezone?: string) {
  const fallback = 'Horario indisponivel';
  if (!timezone) return fallback;

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return fallback;
  }
}

function asPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function formatDateTime(value?: string | null, timezone?: string) {
  if (!value) return 'Sem horario';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return 'Data invalida';
  }
}

function formatPhone(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 'Telefone nao cadastrado';
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function renderCoachMessage(job: NotificationJobSummary, fallbackName: string) {
  const payload = asPayload(job.payload);
  const explicitMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (explicitMessage) return explicitMessage;

  const suggestions = asStringArray(payload.suggestions);
  const agentName = typeof payload.agent_name === 'string' && payload.agent_name.trim().length > 0
    ? payload.agent_name.trim()
    : fallbackName;

  return `Bom dia, ${agentName}\nIdeias de melhoria:\n${suggestions.join('\n') || 'Revise as conversas com menor score de qualidade.'}`;
}

function extractTheme(job: NotificationJobSummary) {
  const payload = asPayload(job.payload);
  return typeof payload.tema_do_dia === 'string' && payload.tema_do_dia.trim().length > 0
    ? payload.tema_do_dia.trim()
    : null;
}

function extractError(job: NotificationJobSummary) {
  const payload = asPayload(job.payload);
  return typeof payload.erro_atacado === 'string' && payload.erro_atacado.trim().length > 0
    ? payload.erro_atacado.trim()
    : null;
}

function jobTone(status: NotificationJobSummary['status']) {
  if (status === 'sent') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function jobLabel(status: NotificationJobSummary['status']) {
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Falhou';
  if (status === 'pending') return 'Pendente';
  return 'Ignorado';
}

export default function Coach() {
  const { company, role } = useCompany();
  const queryClient = useQueryClient();
  const canManageCoach = role === 'owner_admin';
  const [coachEnabled, setCoachEnabled] = useState(false);

  useEffect(() => {
    setCoachEnabled(!!company?.settings.agent_morning_improvement_ideas);
  }, [company?.id, company?.settings.agent_morning_improvement_ideas]);

  const agentsQuery = useQuery<AgentRow[]>({
    queryKey: ['coach-agents', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const { data, error } = await supabase
        .from('agents')
        .select('id, name, phone, is_active')
        .eq('company_id', company.id)
        .order('name');

      if (error) throw error;
      return (data ?? []) as AgentRow[];
    },
    enabled: !!company,
    staleTime: 60 * 1000,
  });

  const analysisCountQuery = useQuery({
    queryKey: ['coach-analyses-7d', company?.id],
    queryFn: async () => {
      if (!company) return 0;

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('ai_conversation_analysis')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .gte('analyzed_at', since);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!company,
    staleTime: 60 * 1000,
  });

  const coachJobsQuery = useQuery<NotificationJobSummary[]>({
    queryKey: ['coach-notification-jobs', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('notification_jobs')
        .select('*')
        .eq('company_id', company.id)
        .eq('job_type', 'agent_morning_ideas')
        .gte('created_at', since)
        .order('scheduled_for', { ascending: false })
        .limit(120);

      if (error) throw error;
      return (data ?? []) as NotificationJobSummary[];
    },
    enabled: !!company,
    staleTime: 60 * 1000,
  });

  const updateCoachMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!company) throw new Error('Empresa nao encontrada.');

      const nextSettings = {
        ...company.settings,
        agent_morning_improvement_ideas: enabled,
      };

      const { error } = await supabase
        .from('companies' as any)
        .update({ settings: nextSettings })
        .eq('id', company.id);

      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      setCoachEnabled(enabled);
      toast.success(enabled ? 'Coach matinal ativado.' : 'Coach matinal desativado.');
      queryClient.invalidateQueries({ queryKey: ['coach-notification-jobs', company?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar o Coach IA.');
    },
  });

  const allAgents = agentsQuery.data ?? [];
  const activeAgents = allAgents.filter((agent) => agent.is_active);
  const agentsWithPhone = activeAgents.filter((agent) => !!agent.phone?.trim()).length;
  const agentsWithoutPhone = Math.max(activeAgents.length - agentsWithPhone, 0);

  const recentCoachJobs = useMemo(() => {
    const weekWindow = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (coachJobsQuery.data ?? []).filter((job) => {
      const timestamp = Date.parse(job.created_at ?? job.scheduled_for);
      return Number.isFinite(timestamp) && timestamp >= weekWindow;
    });
  }, [coachJobsQuery.data]);
  const sentJobs = recentCoachJobs.filter((job) => job.status === 'sent').length;
  const pendingJobs = recentCoachJobs.filter((job) => job.status === 'pending').length;
  const failedJobs = recentCoachJobs.filter((job) => job.status === 'failed').length;

  const historyByAgent = useMemo<CoachHistoryGroup[]>(() => {
    const jobs = coachJobsQuery.data ?? [];
    const agentMap = new Map(allAgents.map((agent) => [agent.id, agent]));
    const grouped = new Map<string, CoachHistoryGroup>();

    for (const job of jobs) {
      const agentId = job.target_agent_id ?? 'unknown';
      const agent = job.target_agent_id ? agentMap.get(job.target_agent_id) : null;
      const payload = asPayload(job.payload);
      const fallbackName = typeof payload.agent_name === 'string' && payload.agent_name.trim().length > 0
        ? payload.agent_name.trim()
        : 'Atendente sem vinculo';

      const currentGroup = grouped.get(agentId) ?? {
        agentId,
        agentName: agent?.name ?? fallbackName,
        phone: agent?.phone ?? null,
        jobs: [],
      };

      currentGroup.jobs.push(job);
      grouped.set(agentId, currentGroup);
    }

    return Array.from(grouped.values()).sort((left, right) => {
      const leftDate = Date.parse(left.jobs[0]?.processed_at ?? left.jobs[0]?.scheduled_for ?? left.jobs[0]?.created_at ?? '0');
      const rightDate = Date.parse(right.jobs[0]?.processed_at ?? right.jobs[0]?.scheduled_for ?? right.jobs[0]?.created_at ?? '0');
      return rightDate - leftDate;
    });
  }, [allAgents, coachJobsQuery.data]);

  const timezone = company?.settings.timezone ?? 'America/Sao_Paulo';
  const localNow = formatLocalTime(timezone);

  const handleCoachToggle = (enabled: boolean) => {
    if (!canManageCoach || updateCoachMutation.isPending) return;
    updateCoachMutation.mutate(enabled);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(220,254,27,0.22),_transparent_28%),linear-gradient(135deg,_#0b1020_0%,_#121a30_40%,_#1b2740_100%)] text-white shadow-[0_32px_90px_rgba(15,23,42,0.24)]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.4fr_0.8fr] lg:px-8 lg:py-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1">Coach IA</span>
              <span className="rounded-full border border-lime-300/25 bg-lime-300/15 px-3 py-1 text-lime-200">Mensagem diaria as 08:00</span>
            </div>

            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                O painel do coach matinal para acompanhar o vendedor antes da operacao abrir.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-white/72 sm:text-base">
                Aqui fica o mapa do Coach IA: onde ligamos a rotina, como o fluxo diario deve rodar e o historico de mensagens que
                cada atendente ja recebeu.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full px-5">
                <Link to="/settings">Abrir configuracoes</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-white/20 bg-white/5 px-5 text-white hover:bg-white/10 hover:text-white">
                <Link to="/relatorio?tab=ai">Abrir relatorio de IA</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">Empresa ativa</p>
              <p className="mt-2 text-2xl font-semibold">{company?.name ?? 'Workspace'}</p>
              <p className="mt-2 text-sm text-white/70">
                Role atual: {role === 'owner_admin' ? 'Gestor' : 'Atendente'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">Horario local</p>
              <p className="mt-2 text-2xl font-semibold">{localNow}</p>
              <p className="mt-2 text-sm text-white/70">{timezone}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_1fr_1fr_1fr]">
        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Onde ligamos o coach</CardDescription>
            <CardTitle className="text-2xl font-semibold">Controle do Coach IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Ativar rotina matinal</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usa o campo <span className="font-medium text-foreground">agent_morning_improvement_ideas</span> da empresa.
                </p>
              </div>
              <Switch
                checked={coachEnabled}
                onChange={(event) => handleCoachToggle(event.target.checked)}
                disabled={!canManageCoach || updateCoachMutation.isPending}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={cn('rounded-full px-3 py-1 font-semibold', coachEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                {coachEnabled ? 'Coach ligado' : 'Coach desligado'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                {canManageCoach ? 'Edicao liberada para gestor' : 'Somente leitura para atendente'}
              </span>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              Se preferir, o mesmo controle continua disponivel em Configuracoes. Aqui ele vira o centro operacional do Coach IA.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Objetivo diario</CardDescription>
            <CardTitle className="text-3xl font-semibold">08:00</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Sempre no horario local da empresa, nunca preso ao timezone do servidor.</p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Agentes com telefone</CardDescription>
            <CardTitle className="text-3xl font-semibold">{agentsWithPhone}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {activeAgents.length} ativos na empresa, {agentsWithoutPhone} sem numero pronto para disparo.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Analises IA em 7 dias</CardDescription>
            <CardTitle className="text-3xl font-semibold">{analysisCountQuery.data ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Esse e o volume recente que ja pode alimentar o resumo do coach.</p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Jobs matinais em 7 dias</CardDescription>
            <CardTitle className="text-3xl font-semibold">{recentCoachJobs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Enviados {sentJobs}, pendentes {pendingJobs}, falhos {failedJobs}.</p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-[1.75rem] border-slate-200 shadow-sm">
          <CardHeader>
            <CardDescription>Historico do coach</CardDescription>
            <CardTitle className="text-2xl">Mensagens enviadas para cada atendente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {historyByAgent.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-base font-semibold text-foreground">Nenhum historico encontrado.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Assim que os jobs do coach forem gerados, esta tela lista mensagem, horario e status por atendente.
                </p>
              </div>
            ) : (
              historyByAgent.map((group) => {
                const sentCount = group.jobs.filter((job) => job.status === 'sent').length;
                const failedCount = group.jobs.filter((job) => job.status === 'failed').length;
                const pendingCount = group.jobs.filter((job) => job.status === 'pending').length;

                return (
                  <div key={group.agentId} className="rounded-[1.5rem] border border-slate-200 p-5">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{group.agentName}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{formatPhone(group.phone)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                          {sentCount} enviados
                        </span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                          {pendingCount} pendentes
                        </span>
                        <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700">
                          {failedCount} falhos
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {group.jobs.slice(0, 4).map((job) => {
                        const message = renderCoachMessage(job, group.agentName);
                        const theme = extractTheme(job);
                        const errorLabel = extractError(job);
                        const timestamp = job.processed_at ?? job.scheduled_for ?? job.created_at;

                        return (
                          <div key={job.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`rounded-full border px-3 py-1 font-semibold ${jobTone(job.status)}`}>
                                  {jobLabel(job.status)}
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">
                                  {job.channel === 'whatsapp' ? 'WhatsApp' : 'Notificacao'}
                                </span>
                              </div>

                              <p className="text-xs font-medium text-muted-foreground">
                                {formatDateTime(timestamp, timezone)}
                              </p>
                            </div>

                            {(theme || errorLabel) && (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                {theme && (
                                  <span className="rounded-full bg-primary/12 px-3 py-1 font-semibold text-primary">
                                    Tema: {theme}
                                  </span>
                                )}
                                {errorLabel && (
                                  <span className="rounded-full bg-slate-200 px-3 py-1 font-semibold text-slate-700">
                                    Erro atacado: {errorLabel}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="mt-3 rounded-2xl bg-white p-4">
                              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{message}</pre>
                            </div>

                            {job.status === 'sent' && (
                              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" />
                                Mensagem registrada como enviada.
                              </div>
                            )}

                            {job.status === 'failed' && (
                              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-rose-700">
                                <XCircle className="h-4 w-4" />
                                {job.error_message || 'Falha de entrega sem detalhe retornado.'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
