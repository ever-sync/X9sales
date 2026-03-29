import Anthropic from '@anthropic-ai/sdk';
import { config, supabase } from '../config';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Você é uma IA professora de vendas de alta performance, especializada em vendas por WhatsApp, condução comercial, atendimento consultivo, objeções, fechamento e melhoria diária de vendedores.

Sua função é enviar, toda manhã, uma mensagem curta e prática para o vendedor com base nas análises já feitas sobre o desempenho dele.

Você deve agir como uma treinadora comercial direta, humana, simples e útil.
Você não fala formal. Você não fala como RH. Você não fala como consultoria.
Você fala como alguém que quer fazer esse vendedor vender mais hoje.

Seu objetivo é:
- corrigir erros recorrentes do vendedor
- ensinar técnicas de venda de forma fácil
- mostrar como atender melhor no WhatsApp
- melhorar abertura, diagnóstico, condução, objeção, fechamento e follow-up
- transformar análise em orientação prática
- gerar evolução diária de performance

A mensagem deve sempre ser:
- curta ou moderada (máximo 30 linhas)
- direta, fácil de entender, natural e literal
- sem linguagem difícil, textão ou teoria demais

Sempre use como base os dados de performance fornecidos:
- erros recorrentes e padrões mais graves
- oportunidades perdidas e pontos que mais impactam conversão

A cada mensagem, escolha 1 tema principal: abertura, diagnóstico, condução, construção de valor, preço, objeção, fechamento, follow-up, postura comercial ou clareza.

Estrutura obrigatória da mensagem:
1. Abertura curta e humana (ex: "Bom dia. Bora ajustar sua venda hoje.")
2. Principal erro ou alerta do dia
3. Ensinamento prático (o que fazer no lugar)
4. Exemplo literal de frase pronta para usar
5. Missão do dia
6. Fechamento curto com energia comercial

Regras:
- ensine uma coisa por vez
- transforme erro em ação com frase pronta
- não humilhe o vendedor
- não faça motivação vazia
- não escreva palestra
- varie o tema conforme a análise
- se ele fala demais → ensine objetividade
- se ele não conduz → ensine CTA
- se ele não investiga → ensine perguntas
- se ele manda preço cedo → ensine transição de valor
- se ele falha em objeção → ensine exploração
- se ele não fecha → ensine chamada de avanço

Sempre que houver falhas recorrentes graves, trate com firmeza — mas de forma útil, mostrando exatamente o que fazer no lugar.

Retorne APENAS um JSON válido com esta estrutura (sem markdown, sem texto extra):
{
  "tema_do_dia": "string",
  "erro_atacado": "string",
  "mensagem": "string"
}`;

interface CoachingResult {
  tema_do_dia: string;
  erro_atacado: string;
  mensagem: string;
}

interface AgentAnalysisSummary {
  agentName: string;
  avgScore: number | null;
  totalAnalyses: number;
  topFailureTags: string[];
  topImprovements: string[];
  topCoachingTips: string[];
  lowestPillar: string | null;
  lowestPillarScore: number | null;
  missedOpportunitySamples: string[];
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function getTopFrequent(items: string[], topN = 3): string[] {
  const freq: Record<string, number> = {};
  for (const item of items) {
    if (item) freq[item] = (freq[item] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag]) => tag);
}

async function fetchAgentAnalysisSummary(
  agentId: string,
  agentName: string,
  since: string,
): Promise<AgentAnalysisSummary | null> {
  const { data: analyses, error } = await supabase
    .schema('app')
    .from('ai_conversation_analysis')
    .select(
      'quality_score, training_tags, failure_tags, coaching_tips, improvements, ' +
      'score_investigation, score_commercial_steering, score_objection_handling, ' +
      'score_empathy, score_clarity, score_rapport, score_urgency, ' +
      'score_value_proposition, structured_analysis',
    )
    .eq('agent_id', agentId)
    .gte('analyzed_at', since)
    .order('analyzed_at', { ascending: false })
    .limit(30);

  if (error || !analyses || analyses.length === 0) return null;

  const scores = analyses.map(a => a.quality_score).filter((s): s is number => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const allFailureTags = analyses.flatMap(a =>
    Array.isArray(a.failure_tags) ? a.failure_tags : [],
  );
  const allTrainingTags = analyses.flatMap(a =>
    Array.isArray(a.training_tags) ? a.training_tags : [],
  );
  const allImprovements = analyses.flatMap(a =>
    Array.isArray((a as any).improvements) ? (a as any).improvements : [],
  );
  const allCoachingTips = analyses.flatMap(a =>
    Array.isArray(a.coaching_tips) ? a.coaching_tips : [],
  );

  // missed opportunity samples from structured_analysis
  const missedOpportunitySamples: string[] = [];
  for (const a of analyses.slice(0, 5)) {
    const sa = (a as any).structured_analysis;
    if (sa && Array.isArray(sa.missed_opportunities)) {
      for (const mo of sa.missed_opportunities.slice(0, 2)) {
        if (mo.missed_action) missedOpportunitySamples.push(mo.missed_action);
      }
    }
    if (missedOpportunitySamples.length >= 5) break;
  }

  // find lowest scoring pillar
  const pillarKeys = [
    { key: 'score_investigation', label: 'investigação / diagnóstico' },
    { key: 'score_commercial_steering', label: 'condução comercial / fechamento' },
    { key: 'score_objection_handling', label: 'tratamento de objeções' },
    { key: 'score_empathy', label: 'empatia e rapport' },
    { key: 'score_clarity', label: 'clareza na comunicação' },
    { key: 'score_value_proposition', label: 'construção de valor' },
    { key: 'score_urgency', label: 'criação de urgência' },
  ] as const;

  let lowestPillar: string | null = null;
  let lowestPillarScore: number | null = null;

  for (const { key, label } of pillarKeys) {
    const vals = analyses.map(a => (a as any)[key]).filter((v: unknown): v is number => typeof v === 'number');
    if (vals.length === 0) continue;
    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
    if (lowestPillarScore === null || avg < lowestPillarScore) {
      lowestPillarScore = avg;
      lowestPillar = label;
    }
  }

  return {
    agentName,
    avgScore: avgScore !== null ? Math.round(avgScore) : null,
    totalAnalyses: analyses.length,
    topFailureTags: getTopFrequent([...allFailureTags, ...allTrainingTags], 4),
    topImprovements: getTopFrequent(allImprovements, 3),
    topCoachingTips: allCoachingTips.slice(0, 3),
    lowestPillar,
    lowestPillarScore: lowestPillarScore !== null ? Math.round(lowestPillarScore * 10) / 10 : null,
    missedOpportunitySamples: [...new Set(missedOpportunitySamples)].slice(0, 4),
  };
}

async function generateCoachingMessage(summary: AgentAnalysisSummary): Promise<CoachingResult | null> {
  const userPrompt = `
Gere a mensagem de coaching matinal para o vendedor ${summary.agentName}.

DADOS DE PERFORMANCE (base para a análise):
- Score médio de qualidade: ${summary.avgScore !== null ? `${summary.avgScore}/100` : 'sem dados suficientes'}
- Total de conversas analisadas no período: ${summary.totalAnalyses}
- Erros/falhas mais recorrentes: ${summary.topFailureTags.length > 0 ? summary.topFailureTags.join(', ') : 'sem padrão identificado'}
- Principais pontos de melhoria identificados: ${summary.topImprovements.length > 0 ? summary.topImprovements.join(' | ') : 'nenhum'}
- Pilar mais fraco: ${summary.lowestPillar ?? 'não identificado'}${summary.lowestPillarScore !== null ? ` (score médio: ${summary.lowestPillarScore}/10)` : ''}
- Oportunidades perdidas recorrentes: ${summary.missedOpportunitySamples.length > 0 ? summary.missedOpportunitySamples.join(' | ') : 'nenhuma registrada'}
- Dicas de coaching já geradas: ${summary.topCoachingTips.length > 0 ? summary.topCoachingTips.join(' | ') : 'nenhuma'}

Com base nesses dados, gere a mensagem matinal de coaching seguindo as regras do system prompt.
Retorne APENAS o JSON, sem markdown ou texto extra.
  `.trim();

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    const parsed = JSON.parse(content.text.trim()) as CoachingResult;
    if (!parsed.mensagem || !parsed.tema_do_dia) return null;
    return parsed;
  } catch (err) {
    console.error('[MorningCoaching] Error generating message:', err);
    return null;
  }
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  const instance = process.env.UAZAPI_INSTANCE;
  const token = process.env.UAZAPI_TOKEN;

  if (!baseUrl || !instance || !token) {
    console.warn('[MorningCoaching] UazAPI not configured. Message (mock):\n', message);
    return false;
  }

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token },
      body: JSON.stringify({ number: phone, text: message }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[MorningCoaching] WhatsApp send failed (${res.status}): ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MorningCoaching] WhatsApp send error:', err);
    return false;
  }
}

export async function sendMorningCoaching(): Promise<void> {
  console.log('[MorningCoaching] Starting daily coaching messages...');

  // Fetch all active agents that have a phone number
  const { data: agents, error: agentErr } = await supabase
    .schema('app')
    .from('agents')
    .select('id, name, phone, company_id')
    .eq('is_active', true)
    .not('phone', 'is', null);

  if (agentErr || !agents || agents.length === 0) {
    console.warn('[MorningCoaching] No agents found:', agentErr?.message);
    return;
  }

  // Use yesterday as the primary window; fall back to last 7 days if no data
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterday = yesterdayStart.toISOString();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const lastWeek = sevenDaysAgo.toISOString();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const agent of agents) {
    const phone = normalizePhone(agent.phone);
    if (!phone) { skipped++; continue; }

    try {
      // Try yesterday first, fall back to last 7 days
      let summary = await fetchAgentAnalysisSummary(agent.id, agent.name, yesterday);
      if (!summary) {
        summary = await fetchAgentAnalysisSummary(agent.id, agent.name, lastWeek);
      }

      if (!summary) {
        console.log(`[MorningCoaching] No analysis data for ${agent.name}, skipping.`);
        skipped++;
        continue;
      }

      const result = await generateCoachingMessage(summary);
      if (!result) {
        console.error(`[MorningCoaching] Failed to generate message for ${agent.name}`);
        failed++;
        continue;
      }

      console.log(`[MorningCoaching] ${agent.name} | Tema: ${result.tema_do_dia} | Erro: ${result.erro_atacado}`);

      const ok = await sendWhatsAppMessage(phone, result.mensagem);
      if (ok) {
        sent++;
        console.log(`[MorningCoaching] ✓ Sent to ${agent.name} (${phone})`);
      } else {
        failed++;
      }

      // Small delay between sends to avoid rate limits
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`[MorningCoaching] Error for agent ${agent.name}:`, err);
      failed++;
    }
  }

  console.log(`[MorningCoaching] Done. Sent: ${sent} | Skipped: ${skipped} | Failed: ${failed}`);
}
