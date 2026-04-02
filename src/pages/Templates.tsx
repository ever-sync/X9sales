import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, FileText, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { env } from '../config/env';

type AgentOption = {
  id: string;
  name: string;
};

type RankingRow = {
  agent_id: string;
  agent_name: string;
  avg_ai_quality_score: number | null;
  total_revenue: number | null;
};

type StructuredAnalysisRow = {
  strengths?: string[];
  improvements?: string[];
};

type AnalysisRow = {
  analyzed_at: string | null;
  coaching_tips: string[] | null;
  training_tags: string[] | null;
  structured_analysis: StructuredAnalysisRow | null;
};

async function getValidAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    const token = data.session?.access_token;
    if (error || !token) throw new Error('Sessao expirada. Faca login novamente.');
    return token;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (token) return token;
  return getValidAccessToken(true);
}

async function callSendTemplateTest(
  payload: { company_id: string; agent_id: string; message: string },
  accessToken: string,
): Promise<{ success?: boolean; error?: string }> {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-template-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let parsed: { success?: boolean; error?: string; message?: string } = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as { success?: boolean; error?: string; message?: string };
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message = parsed.error || parsed.message || raw || `Falha HTTP ${response.status} ao enviar teste.`;
    throw new Error(message);
  }

  return parsed;
}

const templateMensagemIndividual = `Fala, [Nome]! 👊
Passei na sua análise de [período].

📊 Hoje você está em # [pos_atendimento] em atendimento e # [pos_vendas] em vendas.
🏆 No atendimento, o 1º lugar está com [nome_top_atendimento].
💰 Em vendas, o 1º lugar está com [nome_top_vendas].

✅ Pontos fortes:
- [ponto_forte_1]
- [ponto_forte_2]

⚠️ Pontos fracos:
- [ponto_fraco_1]
- [ponto_fraco_2]

🚀 Como melhorar hoje:
- [acao_melhoria_1]
- [acao_melhoria_2]
- [acao_melhoria_3]

🎯 Meta do dia: [meta]
Tô contigo pra subir esse resultado. Bora pra cima!`;

export default function Templates() {
  const { companyId } = useCompany();
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const { data: agents = [] } = useQuery<AgentOption[]>({
    queryKey: ['templates-agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as AgentOption[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: rankingRows = [] } = useQuery<RankingRow[]>({
    queryKey: ['templates-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_agent_ranking')
        .select('agent_id, agent_name, avg_ai_quality_score, total_revenue')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as RankingRow[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: agentAnalyses = [], isLoading: loadingAnalysis } = useQuery<AnalysisRow[]>({
    queryKey: ['templates-agent-analyses', companyId, selectedAgentId],
    queryFn: async () => {
      if (!companyId || !selectedAgentId) return [];
      const periodEnd = new Date().toISOString().split('T')[0];
      const periodStartDate = new Date();
      periodStartDate.setDate(periodStartDate.getDate() - 29);
      const periodStart = periodStartDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('ai_conversation_analysis')
        .select('analyzed_at, coaching_tips, training_tags, structured_analysis')
        .eq('company_id', companyId)
        .eq('agent_id', selectedAgentId)
        .gte('analyzed_at', `${periodStart}T00:00:00.000Z`)
        .lte('analyzed_at', `${periodEnd}T23:59:59.999Z`)
        .order('analyzed_at', { ascending: false })
        .limit(80);

      if (error) throw error;
      return (data ?? []) as AnalysisRow[];
    },
    enabled: !!companyId && !!selectedAgentId,
    staleTime: CACHE.STALE_TIME,
  });

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  const generatedMessage = useMemo(() => {
    if (!selectedAgent) return '';

    const atendimentoRanking = [...rankingRows].sort(
      (a, b) => (b.avg_ai_quality_score ?? 0) - (a.avg_ai_quality_score ?? 0),
    );
    const vendasRanking = [...rankingRows].sort(
      (a, b) => (b.total_revenue ?? 0) - (a.total_revenue ?? 0),
    );

    const posAtendimentoIndex = atendimentoRanking.findIndex((row) => row.agent_id === selectedAgent.id);
    const posVendasIndex = vendasRanking.findIndex((row) => row.agent_id === selectedAgent.id);
    const posAtendimento = posAtendimentoIndex >= 0 ? posAtendimentoIndex + 1 : null;
    const posVendas = posVendasIndex >= 0 ? posVendasIndex + 1 : null;
    const topAtendimento = atendimentoRanking[0]?.agent_name ?? '—';
    const topVendas = vendasRanking[0]?.agent_name ?? '—';
    const latestAnalysis = agentAnalyses[0] ?? null;

    const strengthCounts = new Map<string, number>();
    const improvementCounts = new Map<string, number>();
    for (const analysis of agentAnalyses) {
      for (const strength of analysis.structured_analysis?.strengths ?? []) {
        const normalized = strength.trim();
        if (!normalized) continue;
        strengthCounts.set(normalized, (strengthCounts.get(normalized) ?? 0) + 1);
      }
      for (const improvement of analysis.structured_analysis?.improvements ?? []) {
        const normalized = improvement.trim();
        if (!normalized) continue;
        improvementCounts.set(normalized, (improvementCounts.get(normalized) ?? 0) + 1);
      }
    }

    const strengths = [...strengthCounts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text);
    const improvements = [...improvementCounts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text);

    const coachingTips = Array.isArray(latestAnalysis?.coaching_tips)
      ? latestAnalysis.coaching_tips.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const trainingTags = Array.isArray(latestAnalysis?.training_tags)
      ? latestAnalysis.training_tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const pontosFortes = strengths.slice(0, 2);
    const pontosFracos = improvements.slice(0, 2);
    const acoes = [...coachingTips, ...improvements].slice(0, 3);

    const periodo = 'últimos 30 dias';

    const meta = trainingTags[0] ?? 'subir consistencia e manter follow-up ativo';

    return `Fala, ${selectedAgent.name}! 👊
Passei na sua análise de ${periodo}.

📊 Hoje você está em #${posAtendimento ?? '—'} em atendimento e #${posVendas ?? '—'} em vendas.
🏆 No atendimento, o 1º lugar está com ${topAtendimento}.
💰 Em vendas, o 1º lugar está com ${topVendas}.

✅ Pontos fortes:
- ${pontosFortes[0] ?? 'boa condução inicial da conversa'}
- ${pontosFortes[1] ?? 'clareza ao responder o cliente'}

⚠️ Pontos fracos:
- ${pontosFracos[0] ?? 'perde timing para avançar o fechamento'}
- ${pontosFracos[1] ?? 'follow-up pode ser mais objetivo'}

🚀 Como melhorar hoje:
- ${acoes[0] ?? 'confirmar próximo passo com hora marcada'}
- ${acoes[1] ?? 'fazer pergunta de diagnóstico antes de enviar proposta'}
- ${acoes[2] ?? 'encerrar cada conversa com CTA claro'}

🎯 Meta do dia: ${meta}
Tô contigo pra subir esse resultado. Bora pra cima!`;
  }, [selectedAgent, rankingRows, agentAnalyses]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Template copiado.');
    } catch {
      toast.error('Nao foi possivel copiar o template.');
    }
  };

  const handleSendTest = async () => {
    if (!companyId) {
      toast.error('Empresa nao encontrada para envio do teste.');
      return;
    }

    if (!selectedAgent) {
      toast.error('Selecione um atendente para testar o envio.');
      return;
    }

    if (!generatedMessage.trim()) {
      toast.error('Nao foi possivel gerar a mensagem com os dados atuais.');
      return;
    }

    try {
      setSendingTest(true);
      let accessToken = await getValidAccessToken();
      let data = await callSendTemplateTest(
        { company_id: companyId, agent_id: selectedAgent.id, message: generatedMessage },
        accessToken,
      );

      if (!data.success) {
        accessToken = await getValidAccessToken(true);
        data = await callSendTemplateTest(
          { company_id: companyId, agent_id: selectedAgent.id, message: generatedMessage },
          accessToken,
        );
        if (!data.success) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao enviar teste.');
        }
      }

      toast.success(`Teste enviado para ${selectedAgent.name}.`);
      setShowTestModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar teste.';
      toast.error(message);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 md:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          <FileText className="h-3.5 w-3.5" />
          Templates
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground md:text-3xl">Mensagens prontas para o time</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
          Copie e personalize os modelos de mensagem individual com base na analise de desempenho.
        </p>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Template - Feedback individual com ranking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Modelo informal, direto ao ponto, com posicao em atendimento e vendas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(templateMensagemIndividual)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            Copiar template
          </button>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
            Testar envio
          </button>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground whitespace-pre-wrap">
          {templateMensagemIndividual}
        </pre>
      </section>

      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-foreground">Testar envio do template</h3>
                <p className="text-sm text-muted-foreground">
                  Selecione o atendente para montar a mensagem com base na análise já feita.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setShowTestModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Atendente</label>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                >
                  <option value="">Selecione um atendente</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                {loadingAnalysis ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando análise mais recente...
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-foreground">{generatedMessage || 'Selecione um atendente para gerar a mensagem.'}</pre>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={!selectedAgentId || loadingAnalysis || sendingTest}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sendingTest ? 'Enviando...' : 'Enviar teste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
