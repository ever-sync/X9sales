import { supabase, config } from '../config';
import { updateWatermark } from '../lib/watermark';
import { logProcessingError } from '../lib/errors';

interface RawMessage {
  id: string;
  company_id: string;
  provider: string;
  provider_message_id: string;
  conversation_external_id: string | null;
  channel: string;
  direction: string;
  sender_type: string | null;
  agent_external_id: string | null;
  customer_external_id: string | null;
  message_timestamp: string;
  raw_payload: Record<string, unknown>;
  ingested_at: string;
}

interface ConversationGroup {
  conversationExternalId: string;
  messages: RawMessage[];
}

function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D+/g, '');
}

export async function processMessages(): Promise<void> {
  console.log('[MessageProcessor] Starting processing cycle...');

  // Get all active companies
  const { data: companies, error: compErr } = await supabase
    .schema('app')
    .from('companies')
    .select('id');

  if (compErr || !companies) {
    console.error('[MessageProcessor] Failed to fetch companies:', compErr?.message);
    return;
  }

  for (const company of companies) {
    try {
      await processCompanyMessages(company.id);
    } catch (err) {
      console.error(`[MessageProcessor] Error processing company ${company.id}:`, err);
      await logProcessingError(company.id, 'raw.messages', null, err as Error);
    }
  }

  console.log('[MessageProcessor] Cycle complete.');
}

async function processCompanyMessages(companyId: string): Promise<void> {
  // Fetch unprocessed messages
  const { data: messages, error } = await supabase
    .schema('raw')
    .from('messages')
    .select('*')
    .eq('company_id', companyId)
    .eq('processed', false)
    .order('ingested_at', { ascending: true })
    .limit(config.batchSize);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  if (!messages || messages.length === 0) return;

  console.log(`[MessageProcessor] Company ${companyId}: ${messages.length} messages to process`);

  // Group by conversation
  const groups = groupByConversation(messages as RawMessage[]);

  const processedIds: string[] = [];

  for (const group of groups) {
    try {
      await processConversationGroup(companyId, group);
      processedIds.push(...group.messages.map(m => m.id));
    } catch (err) {
      console.error(`[MessageProcessor] Error processing conversation ${group.conversationExternalId}:`, err);
      for (const msg of group.messages) {
        await logProcessingError(companyId, 'raw.messages', msg.id, err as Error);
      }
    }
  }

  // Mark processed
  if (processedIds.length > 0) {
    const { error: updateErr } = await supabase
      .schema('raw')
      .from('messages')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .in('id', processedIds);

    if (updateErr) {
      console.error('[MessageProcessor] Failed to mark as processed:', updateErr.message);
    }

    // Update watermark
    const lastMsg = messages[messages.length - 1] as RawMessage;
    await updateWatermark(companyId, 'raw.messages', lastMsg.ingested_at, lastMsg.id);
  }
}

function groupByConversation(messages: RawMessage[]): ConversationGroup[] {
  const map = new Map<string, RawMessage[]>();

  for (const msg of messages) {
    const key = msg.conversation_external_id ?? msg.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(msg);
  }

  return Array.from(map.entries()).map(([conversationExternalId, msgs]) => ({
    conversationExternalId,
    messages: msgs.sort((a, b) =>
      new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
    ),
  }));
}

async function processConversationGroup(
  companyId: string,
  group: ConversationGroup
): Promise<void> {
  const { conversationExternalId, messages } = group;
  const firstMsg = messages[0];

  // 1. Upsert customer
  const customerExternalId = messages.find(m => m.customer_external_id)?.customer_external_id;
  const normalizedCustomerPhone = normalizePhone(customerExternalId);
  let customerId: string | null = null;
  if (customerExternalId) {
    const customerName = extractCustomerName(messages);
    let existingCustomer:
      | { id: string; external_id: string | null; name: string | null; phone: string | null }
      | null = null;

    if (normalizedCustomerPhone) {
      const { data: customerByPhone, error: customerByPhoneErr } = await supabase
        .schema('app')
        .from('customers')
        .select('id, external_id, name, phone')
        .eq('company_id', companyId)
        .eq('phone', normalizedCustomerPhone)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (customerByPhoneErr) {
        throw new Error(`Failed to resolve customer by phone ${normalizedCustomerPhone}: ${customerByPhoneErr.message}`);
      }

      existingCustomer = customerByPhone ?? null;
    }

    if (!existingCustomer) {
      const { data: customerByExternalId, error: customerByExternalIdErr } = await supabase
        .schema('app')
        .from('customers')
        .select('id, external_id, name, phone')
        .eq('company_id', companyId)
        .eq('external_id', customerExternalId)
        .maybeSingle();

      if (customerByExternalIdErr) {
        throw new Error(`Failed to resolve customer by external id ${customerExternalId}: ${customerByExternalIdErr.message}`);
      }

      existingCustomer = customerByExternalId ?? null;
    }

    if (existingCustomer) {
      const updates: Record<string, string> = {};

      if (normalizedCustomerPhone && existingCustomer.phone !== normalizedCustomerPhone) {
        updates.phone = normalizedCustomerPhone;
      }

      if (customerName && existingCustomer.name !== customerName) {
        updates.name = customerName;
      }

      if (!existingCustomer.external_id && customerExternalId) {
        updates.external_id = customerExternalId;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateCustomerErr } = await supabase
          .schema('app')
          .from('customers')
          .update(updates)
          .eq('id', existingCustomer.id);

        if (updateCustomerErr) {
          throw new Error(`Failed to update customer ${existingCustomer.id}: ${updateCustomerErr.message}`);
        }
      }

      customerId = existingCustomer.id;
    } else {
      const { data: customer, error: customerErr } = await supabase
        .schema('app')
        .from('customers')
        .insert({
          company_id: companyId,
          external_id: customerExternalId,
          ...(customerName ? { name: customerName } : {}),
          phone: normalizedCustomerPhone || customerExternalId,
        })
        .select('id')
        .single();

      if (customerErr) {
        throw new Error(`Failed to insert customer ${customerExternalId}: ${customerErr.message}`);
      }

      customerId = customer?.id ?? null;
    }
  }

  // 2. Upsert agent
  const agentExternalId = messages.find(m => m.agent_external_id)?.agent_external_id;
  let agentId: string | null = null;
  if (agentExternalId) {
    const { data: existingAgent, error: existingAgentErr } = await supabase
      .schema('app')
      .from('agents')
      .select('id')
      .eq('company_id', companyId)
      .eq('external_id', agentExternalId)
      .maybeSingle();

    if (existingAgentErr) {
      throw new Error(`Failed to find agent ${agentExternalId}: ${existingAgentErr.message}`);
    }

    if (existingAgent?.id) {
      agentId = existingAgent.id;
    } else {
      const { data: agent, error: agentErr } = await supabase
        .schema('app')
        .from('agents')
        .insert(
          { company_id: companyId, external_id: agentExternalId, name: agentExternalId, is_active: true }
        )
        .select('id')
        .single();
      if (agentErr) {
        throw new Error(`Failed to create agent ${agentExternalId}: ${agentErr.message}`);
      }
      agentId = agent?.id ?? null;
    }
  }

  // 3. Upsert conversation
  const { data: rawConv, error: rawConvErr } = await supabase
    .schema('raw')
    .from('conversations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', firstMsg.provider)
    .eq('conversation_external_id', conversationExternalId)
    .maybeSingle();

  if (rawConvErr) {
    throw new Error(`Failed to resolve raw conversation ${conversationExternalId}: ${rawConvErr.message}`);
  }

  const { data: conv, error: convErr } = await supabase
    .schema('app')
    .from('conversations')
    .upsert(
      {
        company_id: companyId,
        raw_conversation_id: rawConv?.id ?? null,
        ...(agentId ? { agent_id: agentId } : {}),
        ...(customerId ? { customer_id: customerId } : {}),
        channel: firstMsg.channel,
        started_at: firstMsg.message_timestamp,
      },
      { onConflict: 'raw_conversation_id', ignoreDuplicates: false }
    )
    .select('id, agent_id, customer_id, message_count_in, message_count_out')
    .single();

  if (convErr) {
    throw new Error(`Failed to upsert conversation ${conversationExternalId}: ${convErr.message}`);
  }
  if (!conv) return;
  const effectiveAgentId = agentId ?? conv.agent_id ?? null;
  const effectiveCustomerId = customerId ?? conv.customer_id ?? null;

  // 4. Persist normalized messages in app.messages (dedupe by external_message_id within conversation)
  const externalIds = Array.from(new Set(messages.map(m => m.provider_message_id))).filter(Boolean);
  const existingExternalIds = new Set<string>();

  if (externalIds.length > 0) {
    const { data: existingMsgs, error: existingMsgsErr } = await supabase
      .schema('app')
      .from('messages')
      .select('external_message_id')
      .eq('company_id', companyId)
      .in('external_message_id', externalIds);

    if (existingMsgsErr) {
      throw new Error(`Failed to check existing app messages: ${existingMsgsErr.message}`);
    }

    for (const row of existingMsgs ?? []) {
      if (typeof row.external_message_id === 'string' && row.external_message_id.length > 0) {
        existingExternalIds.add(row.external_message_id);
      }
    }
  }

  const seenExternalIdsInBatch = new Set<string>();
  const rowsToInsert = messages
    .filter(msg => {
      if (existingExternalIds.has(msg.provider_message_id)) return false;
      if (seenExternalIdsInBatch.has(msg.provider_message_id)) return false;
      seenExternalIdsInBatch.add(msg.provider_message_id);
      return true;
    })
    .map(msg => {
      const senderType = normalizeSenderType(msg.sender_type, msg.direction);
      const senderId = senderType === 'agent'
        ? (effectiveAgentId ?? msg.agent_external_id)
        : senderType === 'customer'
          ? (effectiveCustomerId ?? msg.customer_external_id)
          : null;

      return {
        company_id: companyId,
        conversation_id: conv.id,
        sender_type: senderType,
        sender_id: senderId,
        content: extractMessageContent(msg.raw_payload),
        content_type: inferContentType(msg.raw_payload),
        external_message_id: msg.provider_message_id,
        metadata: {
          ...msg.raw_payload,
          raw_message_id: msg.id,
          direction: msg.direction,
          provider: msg.provider,
        },
        created_at: msg.message_timestamp,
      };
    });

  if (rowsToInsert.length > 0) {
    const { error: insertMsgsErr } = await supabase
      .schema('app')
      .from('messages')
      .insert(rowsToInsert);

    if (insertMsgsErr) {
      throw new Error(`Failed to insert app.messages: ${insertMsgsErr.message}`);
    }
  }

  // 5. Recompute totals and response metrics from full conversation history
  const { data: allRawMessages, error: allRawMessagesErr } = await supabase
    .schema('raw')
    .from('messages')
    .select('id, direction, sender_type, message_timestamp')
    .eq('company_id', companyId)
    .eq('conversation_external_id', conversationExternalId)
    .order('message_timestamp', { ascending: true });

  if (allRawMessagesErr) {
    throw new Error(`Failed to load full raw history for ${conversationExternalId}: ${allRawMessagesErr.message}`);
  }

  const typedRawMessages = (allRawMessages ?? []) as Array<
    Pick<RawMessage, 'id' | 'direction' | 'sender_type' | 'message_timestamp'>
  >;

  if (typedRawMessages.length === 0) return;

  const inboundCount = typedRawMessages.filter(m => m.direction === 'inbound').length;
  const outboundCount = typedRawMessages.filter(m => m.direction === 'outbound').length;

  const { error: convCountsErr } = await supabase
    .schema('app')
    .from('conversations')
    .update({
      message_count_in: inboundCount,
      message_count_out: outboundCount,
      started_at: typedRawMessages[0].message_timestamp,
    })
    .eq('id', conv.id);

  if (convCountsErr) {
    throw new Error(`Failed to update conversation counters for ${conv.id}: ${convCountsErr.message}`);
  }

  const firstInbound = typedRawMessages.find(m => m.direction === 'inbound');
  const firstOutboundAfterInbound = firstInbound
    ? typedRawMessages.find(m =>
        m.direction === 'outbound' &&
        normalizeSenderType(m.sender_type, m.direction) === 'agent' &&
        new Date(m.message_timestamp).getTime() > new Date(firstInbound.message_timestamp).getTime()
      )
    : null;

  let firstResponseTimeSec: number | null = null;
  let slaMet: boolean | null = null;
  let slaTarget = 300;

  if (firstInbound && firstOutboundAfterInbound) {
    firstResponseTimeSec = Math.floor(
      (new Date(firstOutboundAfterInbound.message_timestamp).getTime() -
        new Date(firstInbound.message_timestamp).getTime()) / 1000
    );

    const { error: firstResponseEventErr } = await supabase
      .schema('app')
      .from('events')
      .upsert(
        {
          company_id: companyId,
          event_type: 'FIRST_RESPONSE',
          conversation_id: conv.id,
          agent_id: effectiveAgentId,
          event_timestamp: firstOutboundAfterInbound.message_timestamp,
          source_raw_id: firstOutboundAfterInbound.id,
          meta: { first_response_time_sec: firstResponseTimeSec },
        },
        { onConflict: 'company_id,event_type,source_raw_id' }
      );

    if (firstResponseEventErr) {
      throw new Error(`Failed to upsert FIRST_RESPONSE event: ${firstResponseEventErr.message}`);
    }

    const { data: companyData, error: companyErr } = await supabase
      .schema('app')
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    if (companyErr) {
      throw new Error(`Failed to load company settings for ${companyId}: ${companyErr.message}`);
    }

    slaTarget = companyData?.settings?.sla_first_response_sec ?? 300;
    slaMet = firstResponseTimeSec <= slaTarget;

    if (!slaMet) {
      const { error: slaEventErr } = await supabase
        .schema('app')
        .from('events')
        .upsert(
          {
            company_id: companyId,
            event_type: 'SLA_BREACH',
            conversation_id: conv.id,
            agent_id: effectiveAgentId,
            event_timestamp: firstOutboundAfterInbound.message_timestamp,
            source_raw_id: firstOutboundAfterInbound.id,
            meta: { first_response_time_sec: firstResponseTimeSec, sla_target_sec: slaTarget },
          },
          { onConflict: 'company_id,event_type,source_raw_id' }
        );

      if (slaEventErr) {
        throw new Error(`Failed to upsert SLA_BREACH event: ${slaEventErr.message}`);
      }

      const { data: existingAlert, error: existingAlertErr } = await supabase
        .schema('app')
        .from('alerts')
        .select('id')
        .eq('company_id', companyId)
        .eq('alert_type', 'SLA_BREACH')
        .eq('reference_id', conv.id)
        .contains('meta', { source_raw_id: firstOutboundAfterInbound.id })
        .limit(1);

      if (existingAlertErr) {
        throw new Error(`Failed to check SLA alert duplication: ${existingAlertErr.message}`);
      }

      if (!existingAlert || existingAlert.length === 0) {
        const { error: alertErr } = await supabase
          .schema('app')
          .from('alerts')
          .insert({
            company_id: companyId,
            alert_type: 'SLA_BREACH',
            severity: firstResponseTimeSec > slaTarget * 3 ? 'critical' : 'high',
            title: `SLA breach: ${Math.floor(firstResponseTimeSec / 60)}min first response`,
            description: `Agent took ${firstResponseTimeSec}s to respond (target: ${slaTarget}s)`,
            reference_type: 'conversation',
            reference_id: conv.id,
            agent_id: effectiveAgentId,
            meta: {
              source_raw_id: firstOutboundAfterInbound.id,
              first_response_time_sec: firstResponseTimeSec,
              sla_target_sec: slaTarget,
            },
          });

        if (alertErr) {
          throw new Error(`Failed to create SLA breach alert: ${alertErr.message}`);
        }
      }
    }
  }

  const responseGaps = calculateResponseGaps(typedRawMessages);

  const { error: metricsErr } = await supabase
    .schema('app')
    .from('metrics_conversation')
    .upsert(
      {
        company_id: companyId,
        conversation_id: conv.id,
        agent_id: effectiveAgentId,
        first_response_time_sec: firstResponseTimeSec,
        message_count_in: inboundCount,
        message_count_out: outboundCount,
        avg_response_gap_sec: responseGaps.length > 0
          ? Math.floor(responseGaps.reduce((a, b) => a + b, 0) / responseGaps.length)
          : null,
        sla_first_response_met: slaMet,
        channel: firstMsg.channel,
        conversation_date: typedRawMessages[0].message_timestamp.split('T')[0],
      },
      { onConflict: 'conversation_id' }
    );

  if (metricsErr) {
    throw new Error(`Failed to upsert metrics for conversation ${conv.id}: ${metricsErr.message}`);
  }
}

function extractCustomerName(messages: RawMessage[]): string | null {
  for (const msg of messages) {
    if (msg.direction !== 'inbound') continue;
    if (normalizeSenderType(msg.sender_type, msg.direction) !== 'customer') continue;
    const pushName = msg.raw_payload?.pushName;
    if (typeof pushName === 'string' && pushName.trim().length > 0) {
      return pushName.trim();
    }
  }
  return null;
}

function extractMessageContent(payload: Record<string, unknown>): string {
  const text = payload.text;
  if (typeof text === 'string' && text.trim().length > 0) {
    const normalized = text.trim().toLowerCase();
    if (normalized !== '[mensagem sem conteudo]' && normalized !== '[mensagem sem conteúdo]') {
      return text.trim();
    }
  }

  const body = payload.body;
  if (typeof body === 'string' && body.trim().length > 0) {
    const normalized = body.trim().toLowerCase();
    if (normalized !== '[mensagem sem conteudo]' && normalized !== '[mensagem sem conteúdo]') {
      return body.trim();
    }
  }

  const audioMetadata = payload.audio;
  if (audioMetadata && typeof audioMetadata === 'object') {
    const audioText = (audioMetadata as Record<string, unknown>).text;
    if (typeof audioText === 'string' && audioText.trim().length > 0) {
      return `[audio transcrito]: ${audioText.trim()}`;
    }
  }

  const inferredType = inferContentType(payload);
  if (inferredType === 'audio') return '[audio]';
  if (inferredType === 'image') return '[imagem]';
  if (inferredType === 'video') return '[video]';
  if (inferredType === 'document') return '[documento]';
  if (inferredType === 'interactive') return '[mensagem interativa]';

  return '[Mensagem sem conteudo]';
}

function inferContentType(payload: Record<string, unknown>): 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive' {
  const text = payload.text;
  const textObj = text && typeof text === 'object' ? (text as Record<string, unknown>) : null;
  const textMimetype = typeof textObj?.mimetype === 'string' ? textObj.mimetype.toLowerCase() : '';
  const textIsPtt = textObj?.PTT === true;
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType.toLowerCase() : '';
  const messageType = typeof payload.messageType === 'string' ? payload.messageType.toLowerCase() : '';

  if (textIsPtt || textMimetype.startsWith('audio/') || mediaType === 'ptt' || mediaType === 'audio' || messageType === 'audiomessage') return 'audio';
  if (textMimetype.startsWith('image/') || mediaType === 'image' || messageType === 'imagemessage') return 'image';
  if (textMimetype.startsWith('video/') || mediaType === 'video' || messageType === 'videomessage' || messageType === 'ptv') return 'video';
  if (textMimetype.startsWith('application/') || mediaType === 'document' || messageType === 'documentmessage') return 'document';

  if (payload.audioUrl || payload.audioMessage) return 'audio';
  if (payload.imageUrl || payload.imageMessage) return 'image';
  if (payload.videoUrl || payload.videoMessage) return 'video';
  if (payload.documentUrl || payload.documentMessage) return 'document';
  return 'text';
}

function normalizeSenderType(senderType: string | null, direction: string): 'agent' | 'customer' | 'system' | 'bot' {
  if (senderType === 'agent') return 'agent';
  if (senderType === 'customer') return 'customer';
  if (senderType === 'system') return 'system';
  if (senderType === 'bot') return 'bot';
  return direction === 'inbound' ? 'customer' : 'agent';
}

function calculateResponseGaps(messages: Array<Pick<RawMessage, 'direction' | 'message_timestamp'>>): number[] {
  const gaps: number[] = [];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    // Only measure gaps between customer message and agent response
    if (prev.direction === 'inbound' && curr.direction === 'outbound') {
      const gapSec = Math.floor(
        (new Date(curr.message_timestamp).getTime() - new Date(prev.message_timestamp).getTime()) / 1000
      );
      if (gapSec > 0) gaps.push(gapSec);
    }
  }

  return gaps;
}
