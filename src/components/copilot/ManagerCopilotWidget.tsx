import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CalendarRange,
  ChevronRight,
  Lightbulb,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  User,
  WandSparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../integrations/supabase/client';
import { useCompany } from '../../contexts/CompanyContext';
import { usePermissions } from '../../hooks/usePermissions';
import { CACHE } from '../../config/constants';
import { env } from '../../config/env';
import { formatDateTime } from '../../lib/utils';
import { Button } from '../ui/button';
import type {
  Agent,
  ManagerCopilotMessage,
  ManagerCopilotThread,
  ManagerFeedbackJob,
} from '../../types';

interface AskRequest {
  action: 'ask';
  thread_id: string | null;
  company_id: string;
  question: string;
  period_start: string;
  period_end: string;
  agent_id: string | null;
}

interface AskSuccessResponse {
  success: true;
  thread_id: string;
  user_message_id: string;
  quick_answer_message_id: string;
  agent_resolution: {
    agent_id: string;
    agent_name: string;
  };
  job: {
    job_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
  };
}

interface AskFailureResponse {
  success: false;
  code?: string;
  message?: string;
  error?: string;
  candidates?: Array<{ agent_id: string; name: string }>;
}

interface AskResponseEnvelope {
  ok: boolean;
  status: number;
  body: AskSuccessResponse | AskFailureResponse;
}

interface ParsedMetric {
  label: string;
  value: string;
}

interface ParsedAssistantMessage {
  summary: string[];
  sections: Array<{ title: string; bullets: string[] }>;
  metrics: ParsedMetric[];
}

function dateInputFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validatePeriod(periodStart: string, periodEnd: string): string | null {
  if (!periodStart || !periodEnd) return 'Periodo inicial e final sao obrigatorios.';
  if (periodEnd < periodStart) return 'Data final nao pode ser menor que data inicial.';
  return null;
}

async function callAskManagerCopilot(
  accessToken: string,
  payload: AskRequest,
): Promise<AskResponseEnvelope> {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/ask-manager-copilot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let parsed: AskSuccessResponse | AskFailureResponse;
  try {
    parsed = (raw ? JSON.parse(raw) : {}) as AskSuccessResponse | AskFailureResponse;
  } catch {
    parsed = {
      success: false,
      error: raw || 'Resposta invalida da funcao ask-manager-copilot.',
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
  };
}

function normalizeLine(line: string) {
  return line
    .replace(/_[^_]+_/g, '')
    .replace(/\[(mensagem sem conteudo|sem conteudo)\]/gi, 'Mensagem sem contexto')
    .replace(/\(([a-f0-9-]{16,})\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanAssistantText(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^_?modelo:/i.test(line))
    .filter((line) => !/^prompt:/i.test(line))
    .filter((line) => !/^_?prompt:/i.test(line))
    .filter((line) => !/^thread:/i.test(line))
    .map(normalizeLine)
    .filter((line) => line.length > 0);
}

function prettifyMetricLabel(label: string) {
  return label
    .replace(/\*/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function parseAssistantMessage(raw: string): ParsedAssistantMessage {
  const lines = cleanAssistantText(raw);
  const metrics: ParsedMetric[] = [];
  const summary: string[] = [];
  const sections: Array<{ title: string; bullets: string[] }> = [];
  let currentSection: { title: string; bullets: string[] } | null = null;

  for (const line of lines) {
    const panelMetricMatch = line.match(/^-?\s*([^:]+):\s*(.+)$/);
    if (panelMetricMatch && /painel rapido/i.test(raw) && !/^conversas?\b/i.test(line.toLowerCase())) {
      const label = prettifyMetricLabel(panelMetricMatch[1]);
      const value = panelMetricMatch[2].trim();
      if (label && value) {
        metrics.push({ label, value });
        continue;
      }
    }

    if (/^-?\s*(conversas?|score medio ia|csat previsto medio|coaching recomendado|sla primeira resposta|receita ganha)\s*:/i.test(line)) {
      const [, rawLabel, rawValue] = line.match(/^-?\s*([^:]+):\s*(.+)$/) ?? [];
      if (rawLabel && rawValue) {
        metrics.push({ label: prettifyMetricLabel(rawLabel), value: rawValue.trim() });
        continue;
      }
    }

    if (/^\*\*.+\*\*$/.test(line)) {
      if (currentSection && currentSection.bullets.length > 0) sections.push(currentSection);
      currentSection = { title: line.replace(/\*/g, '').trim(), bullets: [] };
      continue;
    }

    if (/^[-•]/.test(line)) {
      const bullet = line.replace(/^[-•]\s*/, '').trim();
      if (!bullet) continue;
      if (currentSection) currentSection.bullets.push(bullet);
      else summary.push(bullet);
      continue;
    }

    if (!currentSection && summary.length < 3) {
      summary.push(line);
      continue;
    }

    if (!currentSection) {
      currentSection = { title: 'Leitura detalhada', bullets: [] };
    }
    currentSection.bullets.push(line);
  }

  if (currentSection && currentSection.bullets.length > 0) {
    sections.push(currentSection);
  }

  return {
    summary: summary.slice(0, 3),
    sections: sections.slice(0, 4),
    metrics: metrics.slice(0, 6),
  };
}

function threadTitle(thread: ManagerCopilotThread) {
  return `${thread.title} · ${formatDateTime(thread.updated_at)}`;
}

function useSuggestedQuestions(agentName: string | null) {
  return useMemo(() => {
    const name = agentName ?? 'este atendente';
    return [
      `Resuma os pontos fortes de ${name} e o que deve ser mantido.`,
      `Liste os 3 maiores riscos de atendimento de ${name} neste periodo.`,
      `Monte um plano de coaching objetivo para ${name} na proxima semana.`,
      `Mostre quais conversas de ${name} merecem revisao manual agora.`,
    ];
  }, [agentName]);
}

function MetricCard({ label, value }: ParsedMetric) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function AssistantMessageCard({
  message,
  isThinking,
}: {
  message: ManagerCopilotMessage;
  isThinking: boolean;
}) {
  const parsed = parseAssistantMessage(message.content_md);

  return (
    <div className="rounded-[22px] border border-border/70 bg-muted/45 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Copiloto</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(message.created_at)}</p>
          </div>
        </div>
        {isThinking && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aprofundando
          </span>
        )}
      </div>

      {parsed.summary.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Resumo executivo</p>
          </div>
          {parsed.summary.map((item, index) => (
            <p key={`${message.id}-summary-${index}`} className="text-sm leading-6 text-foreground">
              {item}
            </p>
          ))}
        </div>
      )}

      {parsed.metrics.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {parsed.metrics.map((metric) => (
            <MetricCard key={`${message.id}-${metric.label}`} {...metric} />
          ))}
        </div>
      )}

      {parsed.sections.length > 0 && (
        <div className="mt-3 space-y-3">
          {parsed.sections.map((section) => (
            <div key={`${message.id}-${section.title}`} className="rounded-2xl border border-border/60 bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.title}</p>
              <div className="mt-2 space-y-2">
                {section.bullets.map((bullet, index) => (
                  <div key={`${message.id}-${section.title}-${index}`} className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="text-sm leading-6 text-foreground">{bullet}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {parsed.summary.length === 0 && parsed.metrics.length === 0 && parsed.sections.length === 0 && (
        <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">{message.content_md}</p>
      )}
    </div>
  );
}

function UserMessageCard({ message }: { message: ManagerCopilotMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-[20px] bg-[#5945fd] px-4 py-3 text-sm leading-6 text-white shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
          <User className="h-3 w-3" />
          Pergunta
        </div>
        <p>{message.content_md}</p>
      </div>
    </div>
  );
}

export function ManagerCopilotWidget() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const enabled = !!companyId && can('copilot.manager');

  const [isOpen, setIsOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [periodStart, setPeriodStart] = useState(() => dateInputFromDate(new Date(Date.now() - 30 * 86400000)));
  const [periodEnd, setPeriodEnd] = useState(() => dateInputFromDate(new Date()));
  const [agentId, setAgentId] = useState('');
  const [sendingError, setSendingError] = useState<string | null>(null);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<Array<{ agent_id: string; name: string }>>([]);
  const previousJobStatusRef = useRef<ManagerFeedbackJob['status'] | null>(null);

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ['manager-copilot-agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, company_id, member_id, external_id, name, email, phone, avatar_url, is_active, created_at')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: enabled && isOpen,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: threads } = useQuery<ManagerCopilotThread[]>({
    queryKey: ['manager-copilot-threads', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('manager_copilot_threads')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ManagerCopilotThread[];
    },
    enabled: enabled && isOpen,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!activeThreadId && threads && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  const { data: activeJob } = useQuery<ManagerFeedbackJob | null>({
    queryKey: ['manager-copilot-job', companyId, activeThreadId],
    queryFn: async () => {
      if (!companyId || !activeThreadId) return null;
      const { data, error } = await supabase
        .from('manager_feedback_jobs')
        .select('*')
        .eq('company_id', companyId)
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ManagerFeedbackJob | null) ?? null;
    },
    enabled: enabled && isOpen && !!activeThreadId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') return 2000;
      return false;
    },
  });

  const { data: messages } = useQuery<ManagerCopilotMessage[]>({
    queryKey: ['manager-copilot-messages', companyId, activeThreadId],
    queryFn: async () => {
      if (!companyId || !activeThreadId) return [];
      const { data, error } = await supabase
        .from('manager_copilot_messages')
        .select('*')
        .eq('company_id', companyId)
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ManagerCopilotMessage[];
    },
    enabled: enabled && isOpen && !!activeThreadId,
    refetchInterval: activeJob?.status === 'queued' || activeJob?.status === 'running' ? 2000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!activeJob) return;
    const prevStatus = previousJobStatusRef.current;
    if (prevStatus && (prevStatus === 'queued' || prevStatus === 'running')) {
      if (activeJob.status === 'completed') {
        toast.success('Analise profunda do Copiloto concluida.');
        queryClient.invalidateQueries({ queryKey: ['manager-copilot-messages', companyId, activeThreadId] });
      } else if (activeJob.status === 'failed') {
        toast.error(activeJob.error_message || 'Falha ao concluir a analise profunda.');
      }
    }
    previousJobStatusRef.current = activeJob.status;
  }, [activeJob, queryClient, companyId, activeThreadId]);

  useEffect(() => {
    if (!agentId && agents && agents.length > 0) {
      setAgentId(agents[0].id);
    }
  }, [agentId, agents]);

  const askMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa nao selecionada.');
      if (!question.trim()) throw new Error('Escreva sua pergunta.');
      const periodError = validatePeriod(periodStart, periodEnd);
      if (periodError) throw new Error(periodError);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Nao foi possivel validar a sessao.');
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessao expirada. Entre novamente.');

      return callAskManagerCopilot(token, {
        action: 'ask',
        thread_id: activeThreadId,
        company_id: companyId,
        question: question.trim(),
        period_start: periodStart,
        period_end: periodEnd,
        agent_id: agentId || null,
      });
    },
    onSuccess: (result) => {
      setSendingError(null);

      if (!result.ok) {
        const message = !result.body.success
          ? result.body.message || result.body.error || `Falha HTTP ${result.status}`
          : `Falha HTTP ${result.status}`;
        setSendingError(message);
        return;
      }

      if (!result.body.success) {
        if (result.body.code === 'AGENT_AMBIGUOUS' && Array.isArray(result.body.candidates)) {
          setAmbiguousCandidates(result.body.candidates);
          setSendingError('Mais de um atendente encontrado. Selecione abaixo.');
          return;
        }
        setSendingError(result.body.message || result.body.error || 'Nao foi possivel processar a pergunta.');
        return;
      }

      setAmbiguousCandidates([]);
      setQuestion('');
      setActiveThreadId(result.body.thread_id);
      setAgentId(result.body.agent_resolution.agent_id);
      queryClient.invalidateQueries({ queryKey: ['manager-copilot-threads', companyId] });
      queryClient.invalidateQueries({ queryKey: ['manager-copilot-messages', companyId, result.body.thread_id] });
      queryClient.invalidateQueries({ queryKey: ['manager-copilot-job', companyId, result.body.thread_id] });
    },
    onError: (error) => {
      setSendingError(error instanceof Error ? error.message : 'Falha ao enviar pergunta.');
    },
  });

  const sortedMessages = useMemo(() => messages ?? [], [messages]);
  const selectedAgent = useMemo(() => (agents ?? []).find((agent) => agent.id === agentId) ?? null, [agents, agentId]);
  const suggestedQuestions = useSuggestedQuestions(selectedAgent?.name ?? null);
  const activeThread = useMemo(() => (threads ?? []).find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const inProgress = activeJob?.status === 'queued' || activeJob?.status === 'running';

  if (!enabled) return null;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-[#5945fd] shadow-lg transition-colors hover:bg-primary/90"
          aria-label="Abrir Copiloto do Gestor"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[80vh] w-[430px] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-2xl">
          <div className="border-b border-border/70 bg-gradient-to-br from-card via-card to-muted/40 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Copiloto do Gestor</p>
                  <p className="text-xs text-muted-foreground">Leitura executiva, riscos, coaching e proximas acoes.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Atendente</p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{selectedAgent?.name ?? 'Resolver no prompt'}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Periodo</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{periodStart} a {periodEnd}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{inProgress ? 'Analisando' : 'Pronto para perguntar'}</p>
              </div>
            </div>
          </div>

          <div className="border-b border-border/70 bg-muted/30 px-4 py-3">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Thread</label>
            <select
              value={activeThreadId ?? ''}
              onChange={(event) => setActiveThreadId(event.target.value || null)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">Nova conversa</option>
              {(threads ?? []).map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {threadTitle(thread)}
                </option>
              ))}
            </select>
            {activeThread && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Thread ativa: <span className="font-medium text-foreground">{activeThread.title}</span>
              </p>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-card p-4">
            <div className="rounded-[22px] border border-border/70 bg-gradient-to-br from-[#f8ffd8] via-[#f5ffd0] to-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#5945fd] text-white">
                  <WandSparkles className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Perguntas sugeridas</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use um atalho para pedir analise executiva, plano de acao ou priorizacao de risco.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuestion(item)}
                    className="rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {sortedMessages.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Pergunte algo como: "Analise o atendente Rafael neste periodo e destaque riscos, pontos fortes e coaching prioritario."
              </div>
            ) : (
              sortedMessages.map((message) => {
                if (message.role === 'user') {
                  return <UserMessageCard key={message.id} message={message} />;
                }

                if (message.status === 'error') {
                  return (
                    <div key={message.id} className="rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {message.content_md}
                    </div>
                  );
                }

                return (
                  <AssistantMessageCard
                    key={message.id}
                    message={message}
                    isThinking={message.status === 'pending'}
                  />
                );
              })
            )}
          </div>

          <div className="border-t border-border/70 bg-card p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="rounded-2xl border border-border/70 bg-background px-3 py-2">
                <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <CalendarRange className="h-3 w-3" />
                  Inicio
                </span>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="w-full bg-transparent text-xs text-foreground outline-none"
                />
              </label>

              <label className="rounded-2xl border border-border/70 bg-background px-3 py-2">
                <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <CalendarRange className="h-3 w-3" />
                  Fim
                </span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="w-full bg-transparent text-xs text-foreground outline-none"
                />
              </label>
            </div>

            <label className="mb-3 block rounded-2xl border border-border/70 bg-background px-3 py-2">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <User className="h-3 w-3" />
                Atendente
              </span>
              <select
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className="w-full bg-transparent text-xs text-foreground outline-none"
              >
                <option value="">Resolver por nome na pergunta</option>
                {(agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              placeholder="Peça resumo executivo, coaching, comparativo de desempenho ou lista de conversas criticas."
              className="w-full resize-none rounded-[22px] border border-border/70 bg-background px-3 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/35"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuestion(`Monte um plano de coaching semanal para ${selectedAgent?.name ?? 'o atendente selecionado'}.`)}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-medium text-foreground hover:border-primary/35 hover:text-primary"
              >
                <Target className="h-3.5 w-3.5" />
                Plano de coaching
              </button>
              <button
                type="button"
                onClick={() => setQuestion(`Liste ideias de melhoria imediata para ${selectedAgent?.name ?? 'o atendente selecionado'}.`)}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-medium text-foreground hover:border-primary/35 hover:text-primary"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Ideias de melhoria
              </button>
            </div>

            {ambiguousCandidates.length > 0 && (
              <div className="mt-3 rounded-2xl border border-primary/30 bg-accent p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Selecione o atendente correto
                </p>
                <div className="flex flex-wrap gap-2">
                  {ambiguousCandidates.map((candidate) => (
                    <button
                      key={candidate.agent_id}
                      type="button"
                      onClick={() => {
                        setAgentId(candidate.agent_id);
                        setAmbiguousCandidates([]);
                        setSendingError(null);
                      }}
                      className="rounded-full border border-primary/35 px-3 py-1 text-[11px] font-medium text-primary hover:bg-accent"
                    >
                      {candidate.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sendingError && (
              <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-[11px] text-red-700">{sendingError}</p>
            )}

            {inProgress && (
              <p className="mt-3 rounded-2xl bg-accent px-3 py-2 text-[11px] text-primary">
                Aprofundamento em andamento: {activeJob?.processed_count ?? 0}/{activeJob?.total_conversations ?? 0}
              </p>
            )}

            <Button
              type="button"
              onClick={() => askMutation.mutate()}
              disabled={askMutation.isPending}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[#5945fd] hover:bg-primary/90"
            >
              {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Perguntar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
