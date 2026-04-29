import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Eye,
  FileText,
  X,
  XCircle,
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import type { NotificationJobSummary } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';

type AgentRow = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
};

type CoachHistoryRow = {
  job: NotificationJobSummary;
  agentName: string;
  phone: string | null;
  timestamp: string | null;
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

export default function Coach({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { company, role } = useCompany();
  const queryClient = useQueryClient();
  const canManageCoach = role === 'owner_admin';
  const [coachPreference, setCoachPreference] = useState<{ companyId: string | null; enabled: boolean } | null>(null);
  const [selectedRow, setSelectedRow] = useState<CoachHistoryRow | null>(null);
  const coachEnabled = coachPreference && coachPreference.companyId === company?.id
    ? coachPreference.enabled
    : !!company?.settings.agent_morning_improvement_ideas;

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
        .from('companies')
        .update({ settings: nextSettings })
        .eq('id', company.id);

      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      setCoachPreference({ companyId: company?.id ?? null, enabled });
      toast.success(enabled ? 'Coach matinal ativado.' : 'Coach matinal desativado.');
      queryClient.invalidateQueries({ queryKey: ['coach-notification-jobs', company?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar o Coach IA.');
    },
  });

  const allAgents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
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

  const timezone = company?.settings.timezone ?? 'America/Sao_Paulo';
  const historyRows = useMemo<CoachHistoryRow[]>(() => {
    const jobs = coachJobsQuery.data ?? [];
    const agentMap = new Map(allAgents.map((agent) => [agent.id, agent]));

    return jobs
      .map((job) => {
        const agent = job.target_agent_id ? agentMap.get(job.target_agent_id) : null;
        const payload = asPayload(job.payload);
        const fallbackName = typeof payload.agent_name === 'string' && payload.agent_name.trim().length > 0
          ? payload.agent_name.trim()
          : 'Atendente sem vinculo';
        const timestamp = job.processed_at ?? job.scheduled_for ?? job.created_at ?? null;
        return {
          job,
          agentName: agent?.name ?? fallbackName,
          phone: agent?.phone ?? null,
          timestamp,
        };
      })
      .sort((a, b) => Date.parse(b.timestamp ?? '0') - Date.parse(a.timestamp ?? '0'));
  }, [allAgents, coachJobsQuery.data]);

  const handleCoachToggle = (enabled: boolean) => {
    if (!canManageCoach || updateCoachMutation.isPending) return;
    updateCoachMutation.mutate(enabled);
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Configuracoes</CardDescription>
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
              <span className={`rounded-full px-3 py-1 font-semibold ${coachEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {coachEnabled ? 'Coach ligado' : 'Coach desligado'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                {canManageCoach ? 'Edicao liberada para gestor' : 'Somente leitura para atendente'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Resumo rapido</CardDescription>
            <CardTitle className="text-3xl font-semibold">{recentCoachJobs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Enviados {sentJobs}, pendentes {pendingJobs}, falhos {failedJobs}. Hora local: {formatLocalTime(timezone)}.</p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-slate-200 shadow-sm md:col-span-2">
          <CardHeader className="pb-3">
            <CardDescription>Templates</CardDescription>
            <CardTitle className="text-xl font-semibold">Modelos de mensagem do coach</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/templates"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" />
              Abrir templates
            </Link>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-[1.75rem] border-slate-200 shadow-sm">
          <CardHeader>
            <CardDescription>Historico de envio</CardDescription>
            <CardTitle className="text-2xl">Lista de mensagens do coach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {historyRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-base font-semibold text-foreground">Nenhum historico encontrado.</p>
                <p className="mt-2 text-sm text-muted-foreground">Assim que os jobs forem gerados, os envios aparecem aqui.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-600">Atendente</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Telefone</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Canal</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Data</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.job.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 text-foreground">{row.agentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatPhone(row.phone)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.job.channel === 'whatsapp' ? 'WhatsApp' : 'Notificacao'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${jobTone(row.job.status)}`}>
                            {jobLabel(row.job.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.timestamp, timezone)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            title="Ver mensagem"
                            aria-label="Ver mensagem"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedRow.agentName}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(selectedRow.timestamp, timezone)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full border px-3 py-1 font-semibold ${jobTone(selectedRow.job.status)}`}>{jobLabel(selectedRow.job.status)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{selectedRow.job.channel === 'whatsapp' ? 'WhatsApp' : 'Notificacao'}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
                  {renderCoachMessage(selectedRow.job, selectedRow.agentName)}
                </pre>
              </div>
              {selectedRow.job.status === 'sent' && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Mensagem registrada como enviada.
                </div>
              )}
              {selectedRow.job.status === 'failed' && (
                <div className="flex items-center gap-2 text-xs font-medium text-rose-700">
                  <XCircle className="h-4 w-4" />
                  {selectedRow.job.error_message || 'Falha de entrega sem detalhe retornado.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
