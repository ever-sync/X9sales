import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getServiceClient,
  getUazapiConfig,
  json,
  requireUser,
} from "../_shared/settings-runtime.ts";

interface SendTemplateTestBody {
  company_id?: string;
  agent_id?: string;
  message?: string;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function getBearer(header: string | null): string {
  if (!header) return "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return "";
  return header.slice(prefix.length).trim();
}

async function canSendTemplateForCompany(companyId: string, userId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;
  return data.role === "owner_admin";
}

async function sendWhatsApp(message: string, phone: string) {
  const config = getUazapiConfig();
  if (!config.baseUrl || !config.instance || (!config.token && !config.adminToken)) {
    throw new HttpError(400, "WhatsApp provider nao configurado. Verifique UAZAPI_BASE_URL, UAZAPI_INSTANCE e UAZAPI_TOKEN/UAZAPI_ADMIN_TOKEN.");
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const payload = {
    number: phone,
    text: message,
  };

  const attempts = [
    `${baseUrl}/send/text`,
    `${baseUrl}/api/send/text`,
  ];
  const credentialCandidates = [config.token, config.adminToken].filter((item): item is string => !!item && item.trim().length > 0);

  for (const credential of credentialCandidates) {
    for (const url of attempts) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: credential,
          token: credential,
          Authorization: `Bearer ${credential}`,
          instance: config.instance,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) return;

      const errorText = await response.text();
      if (response.status === 401) {
        continue;
      }

      if (response.status === 404) {
        continue;
      }

      throw new HttpError(502, `Falha no envio WhatsApp (HTTP ${response.status}): ${errorText.slice(0, 300)}`);
    }
  }

  throw new HttpError(502, "Falha no envio WhatsApp: token invalido para o endpoint /send/text.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Use POST." }, { status: 405 });
  }

  try {
    const authorization = req.headers.get("authorization");
    const token = getBearer(authorization);
    if (!token) {
      throw new HttpError(401, "Bearer token ausente.");
    }

    let userId = "";
    try {
      const { user } = await requireUser(`Bearer ${token}`);
      userId = user.id;
    } catch {
      throw new HttpError(401, "Token invalido ou expirado. Faca login novamente.");
    }
    const body = (await req.json().catch(() => ({}))) as SendTemplateTestBody;
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!companyId || !agentId || !message) {
      throw new HttpError(400, "Campos obrigatorios: company_id, agent_id, message.");
    }

    const allowed = await canSendTemplateForCompany(companyId, userId);
    if (!allowed) {
      throw new HttpError(403, "Sem permissao para enviar teste de template nesta empresa.");
    }

    const service = getServiceClient();
    const { data: agent, error: agentError } = await service
      .from("agents")
      .select("id, name, phone, is_active")
      .eq("company_id", companyId)
      .eq("id", agentId)
      .maybeSingle();

    if (agentError) throw agentError;
    if (!agent || !agent.is_active) throw new HttpError(404, "Atendente nao encontrado ou inativo.");

    const targetPhone = normalizePhone(agent.phone ?? "");
    if (!targetPhone) throw new HttpError(400, "Atendente sem telefone valido para envio.");

    const { data: createdJob, error: insertError } = await service
      .from("notification_jobs")
      .insert({
        company_id: companyId,
        job_type: "agent_morning_ideas",
        target_agent_id: agent.id,
        channel: "whatsapp",
        status: "pending",
        scheduled_for: new Date().toISOString(),
        payload: {
          agent_name: agent.name,
          target_phone: targetPhone,
          message,
          suggestions: [],
          source: "template_test",
        },
      })
      .select("id")
      .single();

    if (insertError || !createdJob) {
      throw new Error(`Falha ao criar notification_job: ${insertError?.message ?? "desconhecida"}`);
    }

    try {
      await sendWhatsApp(message, targetPhone);
      await service
        .from("notification_jobs")
        .update({
          status: "sent",
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", createdJob.id);

      return json({
        success: true,
        job_id: createdJob.id,
        agent_name: agent.name,
        target_phone: targetPhone,
      });
    } catch (sendError) {
      await service
        .from("notification_jobs")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          error_message: sendError instanceof Error ? sendError.message : "Erro desconhecido no envio",
        })
        .eq("id", createdJob.id);

      throw sendError;
    }
  } catch (error) {
    if (error instanceof HttpError) {
      console.error("[send-template-test] http-error:", error.status, error.message);
      return json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Erro interno";
    console.error("[send-template-test] error:", message);
    return json({ error: message }, { status: 500 });
  }
});
