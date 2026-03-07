import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const acceptedEvents = new Set([
  "messages.upsert",
  "message",
  "messages",
  "message.received",
  "message.receive",
]);

interface UazApiKey {
  id?: string;
  fromMe?: boolean;
  remoteJid?: string;
}

interface UazApiMessage {
  id?: string;
  messageid?: string;
  messageId?: string;
  text?: string;
  body?: string;
  content?: string;
  fromMe?: boolean;
  chatid?: string;
  chatId?: string;
  sender?: string;
  sender_pn?: string;
  senderName?: string;
  messageType?: string;
  type?: string;
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; url?: string; mediaUrl?: string };
  videoMessage?: { caption?: string; url?: string; mediaUrl?: string };
  audioMessage?: { url?: string; mediaUrl?: string; [k: string]: unknown };
  documentMessage?: { caption?: string; fileName?: string; url?: string; mediaUrl?: string };
  stickerMessage?: Record<string, unknown>;
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number };
  contactMessage?: { displayName?: string };
  reactionMessage?: { text?: string };
  buttonsResponseMessage?: { selectedDisplayText?: string };
  listResponseMessage?: { title?: string };
  templateButtonReplyMessage?: { selectedDisplayText?: string };
  ephemeralMessage?: { message?: UazApiMessage };
  viewOnceMessage?: { message?: UazApiMessage };
  viewOnceMessageV2?: { message?: UazApiMessage };
  viewOnceMessageV2Extension?: { message?: UazApiMessage };
  documentWithCaptionMessage?: { message?: UazApiMessage };
}

interface UazApiMessageEntry {
  key?: UazApiKey;
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  pushName?: string;
  messageTimestamp?: number | string;
  message?: UazApiMessage;
  messageStubType?: number;
  [k: string]: unknown;
}

interface UazApiPayload {
  event?: string;
  instance?: string;
  data?: unknown;
  [k: string]: unknown;
}

type SkipReason =
  | "message_stub"
  | "missing_remote_jid"
  | "broadcast_or_group"
  | "no_content";

type AudioTranscriptionStatus = "pending" | "completed" | "failed" | "no_speech";

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripAudioPrefix(content: string): string {
  return content.replace(/^\[audio transcrito\]:\s*/i, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function normalizeEventName(event?: string): string {
  return (event ?? "").toLowerCase().replace(/_/g, ".").replace(/-/g, ".");
}

function isMessageEvent(normalizedEvent: string): boolean {
  if (!normalizedEvent) return true;
  if (acceptedEvents.has(normalizedEvent)) return true;
  return normalizedEvent.includes("message");
}

function jidToExternalId(jid: string): string {
  return jid.split("@")[0];
}

function normalizePhone(value: string): string {
  return value.replace(/\D+/g, "");
}

function unwrapMessage(message?: UazApiMessage): UazApiMessage | undefined {
  if (!message) return undefined;
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) {
    return unwrapMessage(message.viewOnceMessageV2Extension.message);
  }
  if (message.documentWithCaptionMessage?.message) {
    return unwrapMessage(message.documentWithCaptionMessage.message);
  }
  return message;
}

function extractText(rawMessage?: UazApiMessage): string {
  const message = unwrapMessage(rawMessage);
  if (!message) return "[sem conteudo]";
  if (message.text) return message.text;
  if (message.body) return message.body;
  if (message.content) return message.content;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage) return message.imageMessage.caption ?? "[imagem]";
  if (message.videoMessage) return message.videoMessage.caption ?? "[video]";
  if (message.audioMessage) return "[audio]";
  if (message.documentMessage) {
    const name = message.documentMessage.fileName ?? "arquivo";
    return message.documentMessage.caption ?? `[documento: ${name}]`;
  }
  if (message.stickerMessage) return "[figurinha]";
  if (message.locationMessage) return "[localizacao]";
  if (message.contactMessage) return `[contato: ${message.contactMessage.displayName ?? ""}]`;
  if (message.reactionMessage) return `[reacao: ${message.reactionMessage.text ?? ""}]`;
  if (message.buttonsResponseMessage) {
    return message.buttonsResponseMessage.selectedDisplayText ?? "[botao]";
  }
  if (message.listResponseMessage) return message.listResponseMessage.title ?? "[lista]";
  if (message.templateButtonReplyMessage) {
    return message.templateButtonReplyMessage.selectedDisplayText ?? "[template]";
  }
  return "[mensagem]";
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return new Date().toISOString();

    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        const ms = num > 1e12 ? num : num * 1000;
        return new Date(ms).toISOString();
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return new Date().toISOString();
}

function resolveMessageId(entry: UazApiMessageEntry): string | null {
  const nestedKey = isRecord(entry["key"]) ? entry["key"] : null;
  const nestedData = isRecord(entry["data"]) ? entry["data"] : null;
  const nestedMessage = isRecord(entry["message"]) ? entry["message"] : null;

  const candidates = [
    entry.key?.id,
    entry.id,
    entry["messageId"],
    entry["messageID"],
    entry["msgId"],
    entry["msg_id"],
    entry["idMessage"],
    entry["id_message"],
    nestedKey?.["id"],
    nestedData?.["id"],
    nestedData?.["messageId"],
    nestedData?.["msgId"],
    nestedMessage?.["id"],
    nestedMessage?.["messageid"],
    nestedMessage?.["messageId"],
  ];

  for (const candidate of candidates) {
    const normalized = pickString(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function resolveRemoteJid(entry: UazApiMessageEntry): string | null {
  const sender = isRecord(entry["sender"]) ? entry["sender"] : null;
  const chat = isRecord(entry["chat"]) ? entry["chat"] : null;
  const nestedData = isRecord(entry["data"]) ? entry["data"] : null;
  const nestedMessage = isRecord(entry["message"]) ? entry["message"] : null;

  const rawCandidates = [
    entry.key?.remoteJid,
    entry.remoteJid,
    entry["from"],
    entry["chatid"],
    entry["chatId"],
    entry["sender"],
    entry["to"],
    entry["participant"],
    entry["number"],
    entry["phone"],
    nestedMessage?.["chatid"],
    nestedMessage?.["chatId"],
    nestedMessage?.["sender_pn"],
    nestedMessage?.["sender"],
    chat?.["wa_chatid"],
    chat?.["phone"],
    sender?.["id"],
    sender?.["jid"],
    sender?.["phone"],
    sender?.["number"],
    chat?.["id"],
    chat?.["jid"],
    chat?.["remoteJid"],
    nestedData?.["from"],
    nestedData?.["chatId"],
    nestedData?.["remoteJid"],
  ];

  const normalizedCandidates = rawCandidates
    .map((candidate) => pickString(candidate))
    .filter((value): value is string => value !== null)
    .map((value) => {
      if (value.includes("@")) return value.toLowerCase();
      const digits = value.replace(/\D+/g, "");
      if (digits.length >= 8) return digits;
      return value.toLowerCase();
    });

  const scoreCandidate = (value: string): number => {
    if (/^\d+@s\.whatsapp\.net$/.test(value)) return 100;
    if (/^\d+@c\.us$/.test(value)) return 95;
    if (/^\d+@lid$/.test(value)) return 90;
    if (/^\d+@/.test(value)) return 85;
    if (/^\d{8,}$/.test(value)) return 80;
    if (value.includes("@")) return 40;
    return 10;
  };

  let best: string | null = null;
  let bestScore = -1;
  for (const candidate of normalizedCandidates) {
    const score = scoreCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function resolveFromMe(entry: UazApiMessageEntry): boolean {
  if (typeof entry.key?.fromMe === "boolean") return entry.key.fromMe;
  if (typeof entry.fromMe === "boolean") return entry.fromMe;
  const message = unwrapMessage(entry.message);
  if (typeof message?.fromMe === "boolean") return message.fromMe;
  return false;
}

function resolveAudioUrl(rawMessage?: UazApiMessage): string | null {
  const message = unwrapMessage(rawMessage);
  const audio = message?.audioMessage;
  if (!audio) return null;
  if (typeof audio.url === "string" && audio.url.length > 0) return audio.url;
  if (typeof audio.mediaUrl === "string" && audio.mediaUrl.length > 0) return audio.mediaUrl;
  return null;
}

function resolveFlatAudioUrl(entry: UazApiMessageEntry): string | null {
  const candidates = [
    entry["audioUrl"],
    entry["fileURL"],
    entry["fileUrl"],
    entry["url"],
    entry["mediaUrl"],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function resolveFallbackText(entry: UazApiMessageEntry): string | null {
  const text = entry["text"];
  if (typeof text === "string" && text.trim().length > 0) return text.trim();

  const body = entry["body"];
  if (typeof body === "string" && body.trim().length > 0) return body.trim();

  const content = entry["content"];
  if (typeof content === "string" && content.trim().length > 0) return content.trim();
  if (isRecord(content)) {
    const contentText = content["text"];
    if (typeof contentText === "string" && contentText.trim().length > 0) {
      return contentText.trim();
    }
  }

  const message = entry["message"];
  if (isRecord(message)) {
    const messageText = message["text"];
    if (typeof messageText === "string" && messageText.trim().length > 0) {
      return messageText.trim();
    }
    const messageBody = message["body"];
    if (typeof messageBody === "string" && messageBody.trim().length > 0) {
      return messageBody.trim();
    }
    const messageContent = message["content"];
    if (typeof messageContent === "string" && messageContent.trim().length > 0) {
      return messageContent.trim();
    }
  }

  return null;
}

function resolveContactName(
  entry: UazApiMessageEntry,
  fallbackPushName: string | null,
): string | null {
  if (resolveFromMe(entry)) return null;

  const sender = isRecord(entry["sender"]) ? entry["sender"] : null;
  const chat = isRecord(entry["chat"]) ? entry["chat"] : null;
  const message = isRecord(entry["message"]) ? entry["message"] : null;
  const candidates = [
    entry.pushName,
    entry["senderName"],
    entry["notifyName"],
    entry["name"],
    sender?.["name"],
    sender?.["pushName"],
    chat?.["name"],
    chat?.["wa_name"],
    message?.["senderName"],
    fallbackPushName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function isLikelyMessageEntry(candidate: Record<string, unknown>): boolean {
  const hints = [
    "id",
    "key",
    "message",
    "from",
    "remoteJid",
    "chatId",
    "chatid",
    "text",
    "body",
    "content",
    "msgId",
    "messageId",
  ];
  return hints.some((key) => key in candidate);
}

function extractEntries(payload: UazApiPayload): UazApiMessageEntry[] {
  const entries: UazApiMessageEntry[] = [];
  const push = (candidate: unknown) => {
    if (isRecord(candidate) && isLikelyMessageEntry(candidate)) {
      entries.push(candidate as UazApiMessageEntry);
    }
  };

  const data = payload.data;
  if (Array.isArray(data)) {
    for (const item of data) push(item);
  } else if (isRecord(data)) {
    const candidates = [
      data["messages"],
      data["data"],
      data["message"],
      data["msg"],
      data["payload"],
      data["eventData"],
      data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) push(item);
      } else {
        push(candidate);
      }
    }
  }

  if (entries.length === 0) {
    push(payload);
  }

  return entries;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const companyId = url.searchParams.get("company_id");
  const agentId = url.searchParams.get("agent_id");

  if (!companyId) return err(400, "Parametro 'company_id' obrigatorio na URL");
  if (!agentId) return err(400, "Parametro 'agent_id' obrigatorio na URL");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return err(500, "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurado");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (webhookSecret) {
      const provided = req.headers.get("x-webhook-secret") ?? req.headers.get("x-api-key");
      if (provided !== webhookSecret) return err(401, "Segredo invalido");
    }

    let payload: UazApiPayload;
    try {
      payload = (await req.json()) as UazApiPayload;
    } catch {
      return err(400, "Payload JSON invalido");
    }

    const normalizedEvent = normalizeEventName(payload.event);
    if (!isMessageEvent(normalizedEvent)) {
      return ok({
        skipped: true,
        event: payload.event ?? null,
        normalizedEvent,
        reason: "not a message event",
      });
    }

    const entries = extractEntries(payload);
    if (entries.length === 0) {
      return ok({ skipped: true, reason: "no message entries in payload" });
    }

    const rootData = isRecord(payload.data) ? payload.data : null;
    const fallbackPushName = rootData && typeof rootData["pushName"] === "string"
      ? (rootData["pushName"] as string)
      : null;
    const fallbackTimestamp = rootData?.["messageTimestamp"];

    let processed = 0;
    let deduplicated = 0;
    let skipped = 0;
    const skipReasons: Record<SkipReason, number> = {
      message_stub: 0,
      missing_remote_jid: 0,
      broadcast_or_group: 0,
      no_content: 0,
    };

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];

      if (typeof entry.messageStubType === "number" && entry.messageStubType > 0) {
        skipped += 1;
        skipReasons.message_stub += 1;
        continue;
      }

      const remoteJid = resolveRemoteJid(entry);
      const rawMessage = unwrapMessage(entry.message);
      const fallbackText = resolveFallbackText(entry);
      const timestamp = toIsoTimestamp(entry.messageTimestamp ?? entry["timestamp"] ?? fallbackTimestamp);

      if (!remoteJid) {
        skipped += 1;
        skipReasons.missing_remote_jid += 1;
        continue;
      }

      let messageId = resolveMessageId(entry);
      if (!messageId) {
        const nestedType = isRecord(entry["message"])
          ? entry["message"]["type"] ?? entry["message"]["messageType"] ?? null
          : null;
        const idSource = JSON.stringify({
          remoteJid,
          timestamp,
          text: fallbackText ?? null,
          fromMe: resolveFromMe(entry),
          type: entry["type"] ?? entry["messageType"] ?? nestedType,
          idx: index,
        });
        messageId = `auto-${hashString(idSource)}`;
      }

      if (remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) {
        skipped += 1;
        skipReasons.broadcast_or_group += 1;
        continue;
      }

      const hasFlatMediaUrl = resolveFlatAudioUrl(entry) !== null;
      if (!rawMessage && !fallbackText && !hasFlatMediaUrl) {
        skipped += 1;
        skipReasons.no_content += 1;
        continue;
      }

      const fromMe = resolveFromMe(entry);
      const rawCustomerExternalId = jidToExternalId(remoteJid);
      const customerExternalId = normalizePhone(rawCustomerExternalId) || rawCustomerExternalId;
      const conversationExternalId = `whatsapp:${customerExternalId}`;
      const scopedMessageId = `${agentId}:${messageId}`;
      let messageText = rawMessage ? extractText(rawMessage) : (fallbackText ?? "[mensagem]");
      const audioUrl = resolveAudioUrl(rawMessage) ?? resolveFlatAudioUrl(entry);
      const audioMetadata: Record<string, unknown> = {
        provider: "uazapi",
        url: audioUrl,
        transcription_status: audioUrl ? "pending" satisfies AudioTranscriptionStatus : "failed" satisfies AudioTranscriptionStatus,
        language: "pt",
        engine: "whisper-1",
        text: null,
        transcribed_at: null,
        error: audioUrl ? null : "audio_url_missing",
      };

      if (audioUrl) {
        try {
          const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ audioUrl }),
          });

          if (transcribeRes.ok) {
            const transcribeJson = await transcribeRes.json();
            const status = typeof transcribeJson?.status === "string"
              ? transcribeJson.status as AudioTranscriptionStatus
              : "failed";
            const transcribedText = typeof transcribeJson?.text === "string"
              ? transcribeJson.text.trim()
              : "";

            audioMetadata.transcription_status = status;
            audioMetadata.language = typeof transcribeJson?.language === "string" ? transcribeJson.language : "pt";
            audioMetadata.engine = typeof transcribeJson?.engine === "string" ? transcribeJson.engine : "whisper-1";
            audioMetadata.error = transcribeJson?.error ?? null;
            audioMetadata.transcribed_at = new Date().toISOString();

            if (transcribeJson?.success && status === "completed" && transcribedText.length > 0) {
              audioMetadata.text = transcribedText;
              messageText = `[audio transcrito]: ${transcribedText}`;
            } else if (status === "no_speech") {
              audioMetadata.text = "";
              messageText = "[audio sem fala reconhecida]";
            } else {
              messageText = "[audio]";
            }
          } else {
            console.error(`[uazapi-webhook] transcriber returned ${transcribeRes.status}`);
            audioMetadata.transcription_status = "failed";
            audioMetadata.error = `transcriber_http_${transcribeRes.status}`;
          }
        } catch (transcribeError) {
          console.error("[uazapi-webhook] failed to transcribe audio", transcribeError);
          audioMetadata.transcription_status = "failed";
          audioMetadata.error = transcribeError instanceof Error ? transcribeError.message : "unknown_transcription_error";
        }
      }

      const contactName = resolveContactName(entry, fallbackPushName);
      if (payload.instance && payload.instance !== agentId) {
        console.warn(
          `[uazapi-webhook] instance mismatch: payload.instance=${payload.instance} agent_id=${agentId}`,
        );
      }

      const messageType =
        typeof entry["type"] === "string"
          ? (entry["type"] as string).toLowerCase()
          : typeof entry["messageType"] === "string"
            ? (entry["messageType"] as string).toLowerCase()
            : isRecord(entry["message"]) && typeof entry["message"]["type"] === "string"
              ? String(entry["message"]["type"]).toLowerCase()
              : isRecord(entry["message"]) && typeof entry["message"]["messageType"] === "string"
                ? String(entry["message"]["messageType"]).toLowerCase()
                : null;

      const hasAudio = Boolean(rawMessage?.audioMessage) || messageType === "audio" || messageType === "myaudio" || messageType === "ptt";
      const hasImage = Boolean(rawMessage?.imageMessage) || messageType === "image";
      const hasVideo = Boolean(rawMessage?.videoMessage) || messageType === "video" || messageType === "ptv";
      const hasDocument = Boolean(rawMessage?.documentMessage) || messageType === "document";

      const rawPayload = {
        text: messageText,
        pushName: contactName,
        instance: payload.instance ?? null,
        event: payload.event ?? null,
        normalizedEvent,
        fromMe,
        messageId,
        scopedMessageId,
        remoteJid,
        conversationExternalId,
        agentExternalId: agentId,
        customerExternalId,
        messageTimestamp: timestamp,
        messageType,
        audioUrl,
        audioMessage: hasAudio,
        audio: hasAudio ? {
          ...audioMetadata,
          text: typeof audioMetadata.text === "string" ? stripAudioPrefix(String(audioMetadata.text)) : audioMetadata.text,
        } : undefined,
        imageMessage: hasImage,
        videoMessage: hasVideo,
        documentMessage: hasDocument,
        original: entry,
      };

      const { data: result, error: rpcError } = await supabase.schema("raw").rpc("ingest_message", {
        p_company_id: companyId,
        p_provider: "uazapi",
        p_provider_message_id: scopedMessageId,
        p_conversation_external_id: conversationExternalId,
        p_channel: "whatsapp",
        p_direction: fromMe ? "outbound" : "inbound",
        p_sender_type: fromMe ? "agent" : "customer",
        p_agent_external_id: agentId,
        p_customer_external_id: customerExternalId,
        p_message_timestamp: timestamp,
        p_raw_payload: rawPayload,
      });

      if (rpcError) {
        console.error("[uazapi-webhook] ingest_message error:", rpcError);
        return err(500, `Falha ao ingerir mensagem no indice ${index}: ${rpcError.message}`);
      }

      processed += 1;
      if (result === null) deduplicated += 1;
    }

    console.log(
      `[uazapi-webhook] agent=${agentId} event=${normalizedEvent || "none"} ` +
        `received=${entries.length} processed=${processed} deduplicated=${deduplicated} skipped=${skipped}`,
    );

    if (skipped > 0) {
      console.warn(
        `[uazapi-webhook] skip_reasons=${JSON.stringify(skipReasons)}`,
      );
    }

    return ok({
      success: true,
      event: payload.event ?? null,
      normalizedEvent,
      received: entries.length,
      processed,
      deduplicated,
      skipped,
      skipReasons,
    });
  } catch (error) {
    console.error("[uazapi-webhook] unexpected error:", error);
    return err(500, "Erro interno");
  }
});
