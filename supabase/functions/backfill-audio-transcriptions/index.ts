import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backfill-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TranscriptionStatus = "pending" | "completed" | "failed" | "no_speech";

interface BackfillRequest {
  company_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  dry_run?: boolean;
  conversation_id?: string;
}

interface MessageRow {
  id: string;
  company_id: string;
  conversation_id: string;
  content: string;
  content_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return null;
  return authorizationHeader.slice(prefix.length).trim() || null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(asNumber)) return fallback;
  const rounded = Math.round(asNumber);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function parseBody(value: unknown): BackfillRequest {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;
  return {
    company_id: typeof body.company_id === "string" ? body.company_id.trim() : undefined,
    date_from: typeof body.date_from === "string" ? body.date_from.trim() : undefined,
    date_to: typeof body.date_to === "string" ? body.date_to.trim() : undefined,
    limit: body.limit as number | undefined,
    dry_run: body.dry_run === true,
    conversation_id: typeof body.conversation_id === "string" ? body.conversation_id.trim() : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractExistingTranscription(content: string): string | null {
  const match = content.match(/^\[audio transcrito\]:\s*(.+)$/i);
  if (!match) return null;
  const text = match[1]?.trim();
  return text && text.length > 0 ? text : null;
}

function getAudioMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata || !isRecord(metadata.audio)) return {};
  return metadata.audio as Record<string, unknown>;
}

function getAudioUrl(metadata: Record<string, unknown> | null): string | null {
  const audio = getAudioMetadata(metadata);
  const textMeta = metadata && isRecord(metadata.text) ? (metadata.text as Record<string, unknown>) : null;
  const candidates = [audio.url, metadata?.audioUrl, metadata?.url, textMeta?.URL];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

function isLikelyAudioMessage(row: MessageRow): boolean {
  if (row.content_type === "audio") return true;
  const metadata = row.metadata;
  if (!metadata) return false;
  const audio = getAudioMetadata(metadata);
  if (Object.keys(audio).length > 0) return true;
  const textMeta = isRecord(metadata.text) ? (metadata.text as Record<string, unknown>) : null;
  const mimetype = typeof textMeta?.mimetype === "string" ? textMeta.mimetype.toLowerCase() : "";
  const mediaType = typeof metadata.mediaType === "string" ? metadata.mediaType.toLowerCase() : "";
  const messageType = typeof metadata.messageType === "string" ? metadata.messageType.toLowerCase() : "";
  return textMeta?.PTT === true ||
    mimetype.startsWith("audio/") ||
    mediaType === "audio" ||
    mediaType === "ptt" ||
    messageType === "audiomessage";
}

function buildAudioMetadata(params: {
  existingMetadata: Record<string, unknown> | null;
  audioUrl: string | null;
  status: TranscriptionStatus;
  text: string | null;
  error: string | null;
}): Record<string, unknown> {
  const existing = params.existingMetadata ?? {};
  const existingAudio = getAudioMetadata(existing);

  return {
    ...existing,
    audio: {
      ...existingAudio,
      provider: typeof existingAudio.provider === "string" ? existingAudio.provider : "uazapi",
      url: params.audioUrl,
      transcription_status: params.status,
      language: "pt",
      engine: typeof existingAudio.engine === "string" ? existingAudio.engine : "whisper-1",
      text: params.text,
      transcribed_at: params.status === "completed" || params.status === "no_speech"
        ? new Date().toISOString()
        : existingAudio.transcribed_at ?? null,
      error: params.error,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const backfillSecret = Deno.env.get("BACKFILL_AUDIO_SECRET");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." });
  }

  const bearerToken = getBearerToken(req.headers.get("authorization"));
  const providedSecret = req.headers.get("x-backfill-secret");
  const authorized = bearerToken === serviceRoleKey || (backfillSecret && providedSecret === backfillSecret);

  if (!authorized) {
    return json(401, { error: "Unauthorized." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const rawBody = await req.json().catch(() => null);
    const body = parseBody(rawBody);

    if (!body.company_id) {
      return json(400, { error: "Campo 'company_id' obrigatorio." });
    }

    const limit = clampInt(body.limit, 1, 500, 100);
    const dryRun = body.dry_run === true;

    let query = supabase
      .schema("app")
      .from("messages")
      .select("id, company_id, conversation_id, content, content_type, metadata, created_at")
      .eq("company_id", body.company_id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (body.date_from) query = query.gte("created_at", `${body.date_from}T00:00:00Z`);
    if (body.date_to) query = query.lte("created_at", `${body.date_to}T23:59:59Z`);
    if (body.conversation_id) query = query.eq("conversation_id", body.conversation_id);

    const { data, error } = await query;
    if (error) {
      return json(500, { error: `Falha ao carregar mensagens: ${error.message}` });
    }

    const rows = ((data ?? []) as MessageRow[]).filter(isLikelyAudioMessage);
    let completed = 0;
    let failed = 0;
    let noSpeech = 0;
    let skipped = 0;
    let processed = 0;
    const updates: Array<{ id: string; content: string; metadata: Record<string, unknown> }> = [];

    for (const row of rows) {
      const existingAudio = getAudioMetadata(row.metadata);
      const existingStatus = typeof existingAudio.transcription_status === "string"
        ? existingAudio.transcription_status
        : null;
      const existingText = typeof existingAudio.text === "string" && existingAudio.text.trim().length > 0
        ? existingAudio.text.trim()
        : null;
      const extractedText = extractExistingTranscription(row.content);
      const audioUrl = getAudioUrl(row.metadata);

      if (existingStatus === "completed" && existingText) {
        skipped += 1;
        continue;
      }

      if (extractedText) {
        processed += 1;
        completed += 1;
        updates.push({
          id: row.id,
          content: `[audio transcrito]: ${extractedText}`,
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl,
            status: "completed",
            text: extractedText,
            error: null,
          }),
        });
        continue;
      }

      if (!audioUrl) {
        processed += 1;
        failed += 1;
        updates.push({
          id: row.id,
          content: "[audio]",
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl: null,
            status: "failed",
            text: null,
            error: "audio_url_missing",
          }),
        });
        continue;
      }

      const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ audioUrl, company_id: row.company_id }),
      });

      processed += 1;

      if (!transcribeRes.ok) {
        failed += 1;
        updates.push({
          id: row.id,
          content: "[audio]",
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl,
            status: "failed",
            text: null,
            error: `transcriber_http_${transcribeRes.status}`,
          }),
        });
        continue;
      }

      const transcribeJson = await transcribeRes.json();
      const status = typeof transcribeJson?.status === "string"
        ? transcribeJson.status as TranscriptionStatus
        : "failed";
      const text = typeof transcribeJson?.text === "string" ? transcribeJson.text.trim() : "";

      if (status === "completed" && text.length > 0) {
        completed += 1;
        updates.push({
          id: row.id,
          content: `[audio transcrito]: ${text}`,
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl,
            status: "completed",
            text,
            error: null,
          }),
        });
      } else if (status === "no_speech") {
        noSpeech += 1;
        updates.push({
          id: row.id,
          content: "[audio sem fala reconhecida]",
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl,
            status: "no_speech",
            text: "",
            error: null,
          }),
        });
      } else {
        failed += 1;
        updates.push({
          id: row.id,
          content: "[audio]",
          metadata: buildAudioMetadata({
            existingMetadata: row.metadata,
            audioUrl,
            status: "failed",
            text: null,
            error: typeof transcribeJson?.error === "string" ? transcribeJson.error : "transcription_failed",
          }),
        });
      }
    }

    if (!dryRun) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .schema("app")
          .from("messages")
          .update({
            content: update.content,
            metadata: update.metadata,
          })
          .eq("id", update.id);

        if (updateError) {
          return json(500, { error: `Falha ao atualizar mensagem ${update.id}: ${updateError.message}` });
        }
      }
    }

    return json(200, {
      success: true,
      dry_run: dryRun,
      scanned: rows.length,
      processed,
      completed,
      failed,
      no_speech: noSpeech,
      skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return json(500, { error: message });
  }
});
