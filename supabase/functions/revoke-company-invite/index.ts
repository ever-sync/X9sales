import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

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
    const { error } = await service
      .from("company_invites")
      .update({ status: "revoked" })
      .eq("id", invite_id)
      .eq("company_id", company_id);

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("[revoke-company-invite] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
