import { supabase } from '../config';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export async function sendWeeklyAgentFeedback(): Promise<void> {
  console.log('[WeeklyGamification] Starting weekly feedback generation...');

  // 1. Fetch all active agents
  const { data: agents, error: agentErr } = await supabase
    .schema('app')
    .from('agents')
    .select('id, name, external_id, company_id')
    .eq('is_active', true);

  if (agentErr || !agents) {
    console.error('[WeeklyGamification] Failed to fetch agents:', agentErr?.message);
    return;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];

  for (const agent of agents) {
    try {
      await processAgentWeeklyFeedback(agent, dateStr);
    } catch (err) {
      console.error(`[WeeklyGamification] Error for agent ${agent.name}:`, err);
    }
  }

  console.log('[WeeklyGamification] Weekly feedback process complete.');
}

async function processAgentWeeklyFeedback(agent: any, sinceDate: string): Promise<void> {
  // 2. Aggregate metrics for the week
  const { data: metrics, error: metricErr } = await supabase
    .schema('app')
    .from('metrics_agent_daily')
    .select('conversations_closed, avg_predicted_csat, sla_first_response_pct')
    .eq('agent_id', agent.id)
    .gte('metric_date', sinceDate);

  if (metricErr || !metrics || metrics.length === 0) return;

  const totalClosed = metrics.reduce((sum, m) => sum + (m.conversations_closed || 0), 0);
  const avgSla = metrics.reduce((sum, m) => sum + (m.sla_first_response_pct || 0), 0) / metrics.length;
  const avgCsat = metrics.filter(m => m.avg_predicted_csat).reduce((sum, m) => sum + Number(m.avg_predicted_csat), 0) / metrics.filter(m => m.avg_predicted_csat).length || 0;

  // 3. Fetch collective AI tips for the week
  const { data: tips } = await supabase
    .schema('app')
    .from('ai_conversation_analysis')
    .select('coaching_tips, training_tags')
    .eq('agent_id', agent.id)
    .gte('analyzed_at', sinceDate)
    .limit(20);

  const allTips = (tips || []).flatMap(t => t.coaching_tips || []);
  const allTags = (tips || []).flatMap(t => t.training_tags || []);

  // 4. Use AI to generate an encouraging, gamified message
  const systemPrompt = "Você é um mentor encorajador para atendentes de suporte. Seu objetivo é transformar métricas técnicas em feedbacks positivos e acionáveis.";
  const userPrompt = `
    Atendente: ${agent.name}
    Métricas da Semana:
    - Conversas fechadas: ${totalClosed}
    - SLA Médio: ${avgSla.toFixed(0)}%
    - CSAT Médio (IA): ${avgCsat.toFixed(1)}/5
    
    Temas recorrentes (IA): ${allTags.slice(0, 5).join(', ')}
    Dicas brutas coletadas: ${allTips.slice(0, 5).join(' | ')}
    
    Escreva uma mensagem curta (estilo WhatsApp) que:
    1. Comece parabenizando pelo esforço/números.
    2. Destaque um ponto positivo.
    3. Dê uma única dica de "ouro" para a próxima semana baseada nas dicas brutas.
    4. Use emojis e tom amigável.
  `;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const content = response.content[0];
  if (content.type !== 'text') return;
  const feedbackMsg = content.text;

  // 5. Send via WhaZApi
  const whazapiUrl = process.env.WHAZAPI_URL;
  const whazapiKey = process.env.WHAZAPI_KEY;

  if (whazapiUrl && whazapiKey) {
    console.log(`[WeeklyGamification] Sending REAL feedback to ${agent.name} (${agent.external_id})...`);
    try {
      const response = await fetch(`${whazapiUrl}/instance/sendMessage/${agent.external_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': whazapiKey
        },
        body: JSON.stringify({
           number: agent.external_id, // Geralmente o external_id é o JID ou número
           options: {
             delay: 1200,
             presence: "composing",
             linkPreview: false
           },
           textMessage: {
             text: feedbackMsg
           }
        })
      });

      if (response.ok) {
        console.log(`[WeeklyGamification] Feedback sent to ${agent.name}`);
      } else {
        const errText = await response.text();
        console.error(`[WeeklyGamification] Failed to send feedback to ${agent.name}: ${response.status} - ${errText}`);
      }
    } catch (e) {
      console.error(`[WeeklyGamification] Error calling WhaZApi for ${agent.name}:`, e);
    }
  } else {
    console.warn(`[WeeklyGamification] WHAZAPI_URL or WHAZAPI_KEY not configured. Mocking feedback for ${agent.name}:\n${feedbackMsg}\n`);
  }
}
