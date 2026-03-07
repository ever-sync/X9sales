import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getResendApiKey, getServiceClient, getUazapiConfig, json } from "../_shared/settings-runtime.ts";

async function resolveAuthEmail(userId: string) {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw error;
  return data.users.find((user) => user.id === userId)?.email ?? null;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MonitoraIA <noreply@monitoraia.local>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email delivery failed: ${errorText}`);
  }
}

async function sendWhatsApp(message: string) {
  const config = getUazapiConfig();
  if (!config.baseUrl || !config.instance || !config.token || !config.managerPhone) {
    throw new Error("WhatsApp provider is not configured");
  }

  const response = await fetch(`${config.baseUrl}/message/sendText/${config.instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.token,
    },
    body: JSON.stringify({
      number: config.managerPhone,
      text: message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp delivery failed: ${errorText}`);
  }
}

function renderJob(job: any) {
  if (job.job_type === "admin_report") {
    const summary = job.payload?.summary ?? {};
    const companyName = job.payload?.company_name ?? "Empresa";
    return {
      subject: `Relatorio MonitoraIA - ${companyName}`,
      html: `
        <h2>Relatorio ${companyName}</h2>
        <p>Conversas 7d: ${summary.conversations_7d ?? 0}</p>
        <p>Conversas 30d: ${summary.conversations_30d ?? 0}</p>
        <p>Alertas abertos: ${summary.open_alerts ?? 0}</p>
        <p>CSAT medio 30d: ${summary.avg_predicted_csat_30d ?? "--"}</p>
      `,
      text: `Relatorio ${companyName}\nConversas 7d: ${summary.conversations_7d ?? 0}\nConversas 30d: ${summary.conversations_30d ?? 0}\nAlertas abertos: ${summary.open_alerts ?? 0}\nCSAT medio 30d: ${summary.avg_predicted_csat_30d ?? "--"}`,
    };
  }

  if (job.job_type === "agent_morning_ideas") {
    const agentName = job.payload?.agent_name ?? "Atendente";
    const suggestions = (job.payload?.suggestions ?? []).slice(0, 5);
    return {
      subject: `Ideias de melhoria para ${agentName}`,
      html: `
        <h2>Bom dia, ${agentName}</h2>
        <p>Ideias de melhoria para hoje:</p>
        <ul>${suggestions.map((item: string) => `<li>${item}</li>`).join("") || "<li>Revise as conversas com menor score de qualidade.</li>"}</ul>
      `,
      text: `Bom dia, ${agentName}\nIdeias de melhoria:\n${suggestions.join("\n") || "Revise as conversas com menor score de qualidade."}`,
    };
  }

  const customers = (job.payload?.customers ?? []).slice(0, 5);
  const agentName = job.payload?.agent_name ?? "Atendente";
  return {
    subject: `Clientes para follow up - ${agentName}`,
    html: `
      <h2>Follow up pendente</h2>
      <p>Clientes que precisam de retomada:</p>
      <ul>${customers.map((item: string) => `<li>${item}</li>`).join("")}</ul>
    `,
    text: `Follow up pendente para ${agentName}\n${customers.join("\n")}`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const service = getServiceClient();
    const now = new Date().toISOString();
    const { data: jobs, error } = await service
      .from("notification_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs ?? []) {
      try {
        const content = renderJob(job);
        if (job.channel === "email") {
          let email = job.payload?.agent_email ?? null;
          if (!email && job.target_user_id) {
            email = await resolveAuthEmail(job.target_user_id);
          }

          if (!email) {
            throw new Error("Email recipient not found");
          }

          await sendEmail(email, content.subject, content.html);
        } else if (job.channel === "whatsapp") {
          await sendWhatsApp(content.text);
        }

        await service
          .from("notification_jobs")
          .update({
            status: "sent",
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id);

        results.push({ id: job.id, status: "sent" });
      } catch (jobError) {
        await service
          .from("notification_jobs")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            error_message: jobError instanceof Error ? jobError.message : "Unknown delivery error",
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          status: "failed",
          error: jobError instanceof Error ? jobError.message : "Unknown delivery error",
        });
      }
    }

    return json({ success: true, processed: results });
  } catch (error) {
    console.error("[send-notification-jobs] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
