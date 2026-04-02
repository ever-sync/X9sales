import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscribePayload {
  audioUrl: string;
  mimetype?: string;
  company_id?: string;
  companyId?: string;
}

type TranscriptionStatus = "completed" | "failed" | "no_speech";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeAudioUrl(audioUrl: string): string {
  try {
    const parsed = new URL(audioUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid-audio-url]";
  }
}

function normalizeCompanyId(payload: TranscribePayload): string | null {
  const candidate = payload.company_id ?? payload.companyId ?? null;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface CompanyAIProvider {
  provider: string;
  api_key: string;
  enabled: boolean;
  order: number;
}

async function getCompanyOpenAIKey(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("app")
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();

  if (error) {
    console.error(`[transcribe-audio] failed to load company settings: ${error.message}`);
    return null;
  }

  if (!isRecord(data) || !isRecord(data.settings) || !Array.isArray(data.settings.ai_providers)) {
    return null;
  }

  const providers = (data.settings.ai_providers as unknown[])
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      provider: typeof item.provider === "string" ? item.provider.toLowerCase() : "",
      api_key: typeof item.api_key === "string" ? item.api_key.trim() : "",
      enabled: item.enabled === true,
      order: typeof item.order === "number" ? item.order : 9999,
    } satisfies CompanyAIProvider))
    .filter((item) => item.enabled && item.provider === "openai" && item.api_key.length > 0)
    .sort((a, b) => a.order - b.order);

  return providers[0]?.api_key ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as TranscribePayload;
    const { audioUrl } = payload;
    const companyId = normalizeCompanyId(payload);

    if (!audioUrl) {
      return json(400, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "Missing audioUrl",
      });
    }

    if (!companyId) {
      return json(400, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "Missing company_id",
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[transcribe-audio] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
      return json(500, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "Configuration Error",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const openAiKey = await getCompanyOpenAIKey(supabase, companyId);

    if (!openAiKey) {
      console.error(`[transcribe-audio] openai provider key not found for company ${companyId}`);
      return json(500, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "OpenAI provider key not configured for company",
      });
    }

    console.log(`[transcribe-audio] Fetching audio from: ${sanitizeAudioUrl(audioUrl)}`);

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio: ${audioRes.statusText}`);
    }

    const audioBlob = await audioRes.blob();
    const fileExtension = audioBlob.type.includes("ogg") ? "ogg" : "webm";

    const formData = new FormData();
    formData.append("file", audioBlob, `audio.${fileExtension}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    console.log(`[transcribe-audio] Sending ${audioBlob.size} bytes to OpenAI Whisper...`);

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errorData = await whisperRes.text();
      console.error("[transcribe-audio] Whisper API error:", errorData);
      throw new Error(`Whisper API Error: ${whisperRes.statusText}`);
    }

    const whisperData = await whisperRes.json();
    const transcribedText = typeof whisperData.text === "string" ? whisperData.text.trim() : "";
    const transcriptionStatus: TranscriptionStatus = transcribedText.length > 0
      ? "completed"
      : "no_speech";

    console.log(`[transcribe-audio] Transcription status=${transcriptionStatus} text="${transcribedText.substring(0, 50)}..."`);

    return json(200, {
      success: true,
      status: transcriptionStatus,
      text: transcribedText,
      language: "pt",
      engine: "whisper-1",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown transcription error";
    console.error("[transcribe-audio] Error:", message);
    return json(500, {
      success: false,
      status: "failed" satisfies TranscriptionStatus,
      error: message,
      language: "pt",
      engine: "whisper-1",
    });
  }
});
