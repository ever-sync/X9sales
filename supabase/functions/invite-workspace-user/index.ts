import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getBaseUrl, getResendApiKey, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type InvitePayload = {
  company_id: string;
  email: string;
  role: "owner_admin" | "agent";
};

async function sendInviteEmail(email: string, inviteUrl: string, role: string, companyName: string) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn("[invite-workspace-user] RESEND_API_KEY missing, skipping delivery");
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
      subject: `Convite para acessar ${companyName}`,
      html: `
        <h2>Convite de acesso</h2>
        <p>Voce recebeu um convite para entrar em <strong>${companyName}</strong> com o perfil <strong>${role}</strong>.</p>
        <p><a href="${inviteUrl}">Clique aqui para aceitar o convite</a></p>
        <p>Se voce ainda nao tiver conta, faca o cadastro com este mesmo e-mail antes de aceitar.</p>
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
    const payload = (await req.json()) as InvitePayload;
    const email = payload.email.trim().toLowerCase();

    if (!payload.company_id || !email || !payload.role) {
      return json({ error: "company_id, email and role are required" }, { status: 400 });
    }

    if (!["owner_admin", "agent"].includes(payload.role)) {
      return json({ error: "Only owner_admin and agent roles are allowed" }, { status: 400 });
    }

    const { service, user } = await requireOwnerAdmin(authHeader, payload.company_id);

    const { data: company, error: companyError } = await service
      .from("companies")
      .select("id, name")
      .eq("id", payload.company_id)
      .single();

    if (companyError) throw companyError;

    const { data: existingInvite } = await service
      .from("company_invites")
      .select("id, token, status")
      .eq("company_id", payload.company_id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return json({ error: "Pending invite already exists for this email" }, { status: 409 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: invite, error: inviteError } = await service
      .from("company_invites")
      .insert({
        company_id: payload.company_id,
        email,
        role: payload.role,
        token,
        invited_by_user_id: user.id,
        expires_at: expiresAt,
      })
      .select("id, token, email, role, expires_at")
      .single();

    if (inviteError) throw inviteError;

    const inviteUrl = `${getBaseUrl()}/login?invite_token=${encodeURIComponent(token)}`;
    const delivery = await sendInviteEmail(email, inviteUrl, payload.role, company.name);

    return json({
      success: true,
      invite,
      delivery,
    });
  } catch (error) {
    console.error("[invite-workspace-user] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
