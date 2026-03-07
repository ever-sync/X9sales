import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { company_id, member_id, role } = await req.json();

    if (!company_id || !member_id || !role) {
      return json({ error: "company_id, member_id and role are required" }, { status: 400 });
    }

    if (!["owner_admin", "agent"].includes(role)) {
      return json({ error: "Only owner_admin and agent roles are allowed" }, { status: 400 });
    }

    const { service } = await requireOwnerAdmin(authHeader, company_id);
    const { error } = await service
      .from("company_members")
      .update({ role })
      .eq("id", member_id)
      .eq("company_id", company_id);

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("[update-company-member-role] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
