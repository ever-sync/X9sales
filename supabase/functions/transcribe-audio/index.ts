import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscribePayload {
  audioUrl: string;
  mimetype?: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as TranscribePayload;
    const { audioUrl } = payload;

    if (!audioUrl) {
      return json(400, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "Missing audioUrl",
      });
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      console.error("[transcribe-audio] OPENAI_API_KEY is missing");
      return json(500, {
        success: false,
        status: "failed" satisfies TranscriptionStatus,
        error: "Configuration Error",
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

    console.log(`[transcribe-audio] Transcription status=${transcriptionStatus} text=\"${transcribedText.substring(0, 50)}...\"`);

    return json(200, {
      success: true,
      status: transcriptionStatus,
      text: transcribedText,
      language: "pt",
      engine: "whisper-1",
    });
  } catch (error: any) {
    console.error("[transcribe-audio] Error:", error.message);
    return json(500, {
      success: false,
      status: "failed" satisfies TranscriptionStatus,
      error: error.message,
      language: "pt",
      engine: "whisper-1",
    });
  }
});
