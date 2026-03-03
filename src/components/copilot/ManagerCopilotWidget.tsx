import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../integrations/supabase/client';
import { useCompany } from '../../contexts/CompanyContext';
import { usePermissions } from '../../hooks/usePermissions';
import type {
  Agent,
  ManagerCopilotMessage,
  ManagerCopilotThread,
  ManagerFeedbackJob,
} from '../../types';
import { CACHE } from '../../config/constants';
import { env } from '../../config/env';
import { formatDateTime } from '../../lib/utils';

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

  if (!enabled) return null;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90"
          aria-label="Abrir Copiloto do Gestor"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[74vh] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-accent p-1.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Copiloto do Gestor</p>
                <p className="text-xs text-muted-foreground">Pergunte sobre desempenho do atendente</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 border-b border-border bg-muted p-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Thread</label>
            <select
              value={activeThreadId ?? ''}
              onChange={(event) => setActiveThreadId(event.target.value || null)}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">Nova conversa</option>
              {(threads ?? []).map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title} - {formatDateTime(thread.updated_at)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-card p-3">
            {sortedMessages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
                Exemplo: "Analise o atendente Rafael de 2026-03-01 ate 2026-03-31 e traga pontos fortes e fracos."
              </div>
            ) : (
              sortedMessages.map((message) => {
                const isUser = message.role === 'user';
                const isError = message.status === 'error';
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                        isUser
                          ? 'bg-primary text-white'
                          : isError
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-muted text-foreground'
                      }`}
                    >
                      {message.content_md}
                      {message.status === 'pending' && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] opacity-80">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Aprofundando...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-2 border-t border-border bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/35"
              />
              <input
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/35"
              />
            </div>

            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/35"
            >
              <option value="">Resolver por nome na pergunta</option>
              {(agents ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="Pergunte algo como: analise o atendente Rafael e traga pontos fortes e fracos."
              className="w-full resize-none rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/35"
            />

            {ambiguousCandidates.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-accent p-2">
                <p className="mb-1 text-[11px] font-medium text-primary">
                  Encontramos mais de um atendente:
                </p>
                <div className="flex flex-wrap gap-1">
                  {ambiguousCandidates.map((candidate) => (
                    <button
                      key={candidate.agent_id}
                      type="button"
                      onClick={() => {
                        setAgentId(candidate.agent_id);
                        setAmbiguousCandidates([]);
                        setSendingError(null);
                      }}
                      className="rounded-full border border-primary/35 px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
                    >
                      {candidate.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sendingError && (
              <p className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">{sendingError}</p>
            )}

            {(activeJob?.status === 'queued' || activeJob?.status === 'running') && (
              <p className="rounded-lg bg-accent px-2 py-1 text-[11px] text-primary">
                Aprofundamento em andamento: {activeJob.processed_count}/{activeJob.total_conversations}
              </p>
            )}

            <button
              type="button"
              onClick={() => askMutation.mutate()}
              disabled={askMutation.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {askMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Perguntar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
