import crypto from 'crypto';
import { supabase } from '../config';

interface OutboundMessage {
  agent_external_id: string;
  customer_external_id: string;
  message_timestamp: string;
  raw_payload: { text?: string; body?: string; [key: string]: unknown };
}

interface SpamEventData {
  patternType: 'identical_message' | 'near_identical_message' | 'burst_volume';
  messageHash: string | null;
  messageSample: string | null;
  recipientCount: number;
  occurrenceCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  windowStart: Date;
  windowEnd: Date;
}

export async function detectSpam(): Promise<void> {
  console.log('[SpamDetector] Starting detection cycle...');

  const { data: companies, error } = await supabase
    .schema('app')
    .from('companies')
    .select('id');

  if (error || !companies) {
    console.error('[SpamDetector] Failed to fetch companies:', error?.message);
    return;
  }

  for (const company of companies) {
    try {
      await detectCompanySpam(company.id);
    } catch (err) {
      console.error(`[SpamDetector] Error for company ${company.id}:`, err);
    }
  }

  console.log('[SpamDetector] Cycle complete.');
}

async function detectCompanySpam(companyId: string): Promise<void> {
  const lookbackMs = 2 * 60 * 60 * 1000; // 2-hour window
  const windowStart = new Date(Date.now() - lookbackMs).toISOString();

  // Fetch recent outbound WhatsApp messages only (Meta ban risk is WhatsApp-specific)
  const { data: messages, error } = await supabase
    .schema('raw')
    .from('messages')
    .select('agent_external_id, customer_external_id, message_timestamp, raw_payload')
    .eq('company_id', companyId)
    .eq('direction', 'outbound')
    .eq('channel', 'whatsapp')
    .gte('message_timestamp', windowStart)
    .not('agent_external_id', 'is', null)
    .not('customer_external_id', 'is', null)
    .limit(5000);

  if (error) {
    console.error(`[SpamDetector] Error fetching messages for ${companyId}:`, error.message);
    return;
  }

  if (!messages || messages.length === 0) return;

  const typedMessages = messages as OutboundMessage[];

  // Per-agent data structures
  // agent_external_id → message_key (first 100 chars) → Set<customer_external_id>
  const agentMsgMap = new Map<string, Map<string, Set<string>>>();
  // agent_external_id → sorted array of { ts: epoch ms, customerId }
  const agentEvents = new Map<string, { ts: number; customerId: string }[]>();

  for (const msg of typedMessages) {
    const agentId = msg.agent_external_id;
    const customerId = msg.customer_external_id;
    const rawText = msg.raw_payload.text ?? msg.raw_payload.body ?? '';
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) continue;

    // Group by agent → message prefix → set of recipients
    if (!agentMsgMap.has(agentId)) agentMsgMap.set(agentId, new Map());
    const msgMap = agentMsgMap.get(agentId)!;
    const msgKey = text.slice(0, 100);
    if (!msgMap.has(msgKey)) msgMap.set(msgKey, new Set());
    msgMap.get(msgKey)!.add(customerId);

    // Collect events for burst detection
    if (!agentEvents.has(agentId)) agentEvents.set(agentId, []);
    agentEvents.get(agentId)!.push({ ts: new Date(msg.message_timestamp).getTime(), customerId });
  }

  // Track which (agent, pattern) combos we already reported this cycle to avoid doubles
  const reportedThisCycle = new Set<string>();

  // ----------------------------------------------------------------
  // Pattern 1 & 2: identical / near-identical message sent to 5+ customers
  // ----------------------------------------------------------------
  for (const [agentExtId, msgMap] of agentMsgMap) {
    for (const [msgKey, customerSet] of msgMap) {
      const recipientCount = customerSet.size;
      if (recipientCount < 5) continue;

      const riskLevel =
        recipientCount >= 20 ? 'critical' :
        recipientCount >= 10 ? 'high' : 'medium';

      const msgHash = crypto.createHash('sha256').update(msgKey).digest('hex').slice(0, 16);
      const cycleKey = `${agentExtId}-identical-${msgHash}`;
      if (reportedThisCycle.has(cycleKey)) continue;

      await reportSpamEvent(companyId, agentExtId, {
        patternType: 'identical_message',
        messageHash: msgHash,
        messageSample: msgKey.slice(0, 200),
        recipientCount,
        occurrenceCount: recipientCount,
        riskLevel,
        windowStart: new Date(Date.now() - lookbackMs),
        windowEnd: new Date(),
      });

      reportedThisCycle.add(cycleKey);
    }
  }

  // ----------------------------------------------------------------
  // Pattern 3: burst volume — 50+ messages in 5 min to 20+ distinct customers
  // ----------------------------------------------------------------
  const fiveMin = 5 * 60 * 1000;

  for (const [agentExtId, events] of agentEvents) {
    const burstKey = `${agentExtId}-burst`;
    if (reportedThisCycle.has(burstKey)) continue;

    events.sort((a, b) => a.ts - b.ts);

    let left = 0;
    for (let right = 0; right < events.length; right++) {
      // Slide left pointer to keep window within 5 minutes
      while (events[right].ts - events[left].ts > fiveMin) left++;

      const windowEvents = events.slice(left, right + 1);
      const uniqueCustomers = new Set(windowEvents.map(e => e.customerId));

      if (windowEvents.length >= 50 && uniqueCustomers.size >= 20) {
        await reportSpamEvent(companyId, agentExtId, {
          patternType: 'burst_volume',
          messageHash: null,
          messageSample: null,
          recipientCount: uniqueCustomers.size,
          occurrenceCount: windowEvents.length,
          riskLevel: 'critical',
          windowStart: new Date(events[left].ts),
          windowEnd: new Date(events[right].ts),
        });

        reportedThisCycle.add(burstKey);
        break;
      }
    }
  }
}

async function reportSpamEvent(
  companyId: string,
  agentExternalId: string,
  data: SpamEventData
): Promise<void> {
  // Resolve agent internal id and company settings
  const { data: companyAgentData } = await supabase
    .schema('app')
    .from('companies')
    .select('id, settings, agents!inner(id, name, external_id)')
    .eq('id', companyId)
    .eq('agents.external_id', agentExternalId)
    .single();

  if (!companyAgentData || !companyAgentData.agents) return;
  const agent = (companyAgentData.agents as any)[0] || companyAgentData.agents;
  const settings = companyAgentData.settings as any;

  // Idempotency: skip if same pattern was already detected in the last 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .schema('app')
    .from('spam_risk_events')
    .select('id')
    .eq('company_id', companyId)
    .eq('agent_id', agent.id)
    .eq('pattern_type', data.patternType)
    .gte('detected_at', since24h)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Calculate window duration in minutes for the alert description
  const durationMin = Math.round(
    (data.windowEnd.getTime() - data.windowStart.getTime()) / 60000
  );

  const alertTitle = `Risco de banimento Meta: ${data.recipientCount} clientes receberam mensagem idêntica`;
  const alertDescription = data.messageSample
    ? `Atendente ${agent.name} enviou "${data.messageSample.slice(0, 60)}..." para ${data.recipientCount} clientes diferentes em ${durationMin} minutos.`
    : `Atendente ${agent.name} enviou ${data.occurrenceCount} mensagens para ${data.recipientCount} clientes diferentes em ${durationMin} minutos.`;

  // Create alert
  const { data: alert } = await supabase
    .schema('app')
    .from('alerts')
    .insert({
      company_id: companyId,
      alert_type: 'META_BAN_RISK',
      severity: data.riskLevel,
      title: alertTitle,
      description: alertDescription,
      reference_type: 'agent',
      reference_id: agent.id,
      agent_id: agent.id,
      meta: {
        pattern_type: data.patternType,
        recipient_count: data.recipientCount,
        occurrence_count: data.occurrenceCount,
        message_sample: data.messageSample,
        window_start: data.windowStart.toISOString(),
        window_end: data.windowEnd.toISOString(),
      },
    })
    .select('id')
    .single();

  // Record spam event linked to alert
  await supabase
    .schema('app')
    .from('spam_risk_events')
    .insert({
    company_id: companyId,
    agent_id: agent.id,
    detected_at: new Date().toISOString(),
    window_start: data.windowStart.toISOString(),
    window_end: data.windowEnd.toISOString(),
    pattern_type: data.patternType,
    identical_message_hash: data.messageHash,
    message_sample: data.messageSample,
    recipient_count: data.recipientCount,
    occurrence_count: data.occurrenceCount,
    risk_level: data.riskLevel,
    alert_id: alert?.id ?? null,
  });

  console.log(
    `[SpamDetector] Spam detected: agent "${agent.name}", ` +
    `pattern=${data.patternType}, recipients=${data.recipientCount}, risk=${data.riskLevel}`
  );

  // --- V2: ACTIVE PREVENTION ---
  // If auto-block is enabled and risk is critical, logout the instance
  if (data.riskLevel === 'critical' && settings?.auto_block_on_critical_risk === true) {
    console.warn(`[SpamDetector] CRITICAL RISK DETECTED. Executing ACTIVE AUTO-BLOCK for agent ${agent.name} (Instance: ${agentExternalId})`);
    
    try {
      // Evolution API / WhaZApi logout endpoint example
      // In a real scenario, WHAZAPI_URL and WHAZAPI_KEY should be in config/env
      const whazapiUrl = process.env.WHAZAPI_URL;
      const whazapiKey = process.env.WHAZAPI_KEY;

      if (whazapiUrl && whazapiKey) {
        const response = await fetch(`${whazapiUrl}/instance/logout/${agentExternalId}`, {
          method: 'DELETE',
          headers: {
            'apikey': whazapiKey
          }
        });

        if (response.ok) {
          console.log(`[SpamDetector] Instance ${agentExternalId} successfully suspended (logged out).`);
        } else {
          console.error(`[SpamDetector] Failed to logout instance ${agentExternalId}: ${response.statusText}`);
        }
      } else {
        console.warn(`[SpamDetector] WHAZAPI_URL or WHAZAPI_KEY not configured. Mocking suspension.`);
      }
    } catch (e) {
      console.error(`[SpamDetector] Error during active auto-block:`, e);
    }
  }
}
