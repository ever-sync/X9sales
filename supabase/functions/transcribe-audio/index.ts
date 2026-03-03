import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscribePayload {
  audioUrl: string; // The URL to the audio file (e.g., from WhaZApi/Evolution)
  mimetype?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as TranscribePayload;
    const { audioUrl } = payload;

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: "Missing audioUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      console.error("[transcribe-audio] OPENAI_API_KEY is missing");
      return new Response(JSON.stringify({ error: "Configuration Error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[transcribe-audio] Fetching audio from: ${audioUrl}`);
    
    // 1. Download the audio file
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio: ${audioRes.statusText}`);
    }
    
    const audioBlob = await audioRes.blob();
    const fileExtension = audioBlob.type.includes("ogg") ? "ogg" : "webm";

    // 2. Prepare FormData for OpenAI Whisper
    const formData = new FormData();
    formData.append("file", audioBlob, `audio.${fileExtension}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt"); // Defaulting to Portuguese for MonitoraIA

    console.log(`[transcribe-audio] Sending ${audioBlob.size} bytes to OpenAI Whisper...`);

    // 3. Send to OpenAI
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
    const transcribedText = whisperData.text || "[Áudio sem fala reconhecida]";

    console.log(`[transcribe-audio] Transcription complete: "${transcribedText.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ success: true, text: transcribedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[transcribe-audio] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
