import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getServiceClient, json, requireUser } from "../_shared/settings-runtime.ts";

type AcceptInvitePayload = {
  token: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { user } = await requireUser(authHeader);
    const service = getServiceClient();
    const payload = (await req.json()) as AcceptInvitePayload;

    if (!payload.token) {
      return json({ error: "token is required" }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await service
      .from("company_invites")
      .select("*")
      .eq("token", payload.token)
      .eq("status", "pending")
      .single();

    if (inviteError || !invite) {
      return json({ error: "Invite not found or no longer valid" }, { status: 404 });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await service.from("company_invites").update({ status: "expired" }).eq("id", invite.id);
      return json({ error: "Invite expired" }, { status: 410 });
    }

    if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
      return json({ error: "Authenticated email does not match invite email" }, { status: 403 });
    }

    const { data: existingMember } = await service
      .from("company_members")
      .select("id")
      .eq("company_id", invite.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingMember) {
      const { error: memberError } = await service
        .from("company_members")
        .insert({
          company_id: invite.company_id,
          user_id: user.id,
          role: invite.role,
          is_active: true,
        });

      if (memberError) throw memberError;
    }

    const { error: updateInviteError } = await service
      .from("company_invites")
      .update({
        status: "accepted",
        accepted_by_user_id: user.id,
      })
      .eq("id", invite.id);

    if (updateInviteError) throw updateInviteError;

    return json({ success: true, company_id: invite.company_id });
  } catch (error) {
    console.error("[accept-company-invite] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
