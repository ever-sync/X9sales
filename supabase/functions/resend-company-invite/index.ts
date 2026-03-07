import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getBaseUrl, getResendApiKey, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

async function sendInviteEmail(email: string, inviteUrl: string, role: string, companyName: string) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn("[resend-company-invite] RESEND_API_KEY missing, skipping delivery");
    return { delivered: false, skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MonitoraIA <noreply@monitoraia.local>",
      to: [email],
      subject: `Reenvio de convite para ${companyName}`,
      html: `
        <h2>Reenvio de convite</h2>
        <p>Seu convite para acessar <strong>${companyName}</strong> como <strong>${role}</strong> foi reenviado.</p>
        <p><a href="${inviteUrl}">Aceitar convite</a></p>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email delivery failed: ${errorText}`);
  }

  return { delivered: true, skipped: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { invite_id, company_id } = await req.json();

    if (!invite_id || !company_id) {
      return json({ error: "invite_id and company_id are required" }, { status: 400 });
    }

    const { service } = await requireOwnerAdmin(authHeader, company_id);
    const { data: invite, error: inviteError } = await service
      .from("company_invites")
      .select("id, email, role, token, company_id, status")
      .eq("id", invite_id)
      .single();

    if (inviteError) throw inviteError;
    if (invite.status !== "pending") {
      return json({ error: "Only pending invites can be resent" }, { status: 409 });
    }

    const { data: company, error: companyError } = await service
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    if (companyError) throw companyError;

    const delivery = await sendInviteEmail(
      invite.email,
      `${getBaseUrl()}/login?invite_token=${encodeURIComponent(invite.token)}`,
      invite.role,
      company.name,
    );

    return json({ success: true, delivery });
  } catch (error) {
    console.error("[resend-company-invite] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
