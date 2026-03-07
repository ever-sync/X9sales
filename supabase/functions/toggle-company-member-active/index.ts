import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { company_id, member_id, is_active } = await req.json();

    if (!company_id || !member_id || typeof is_active !== "boolean") {
      return json({ error: "company_id, member_id and is_active are required" }, { status: 400 });
    }

    const { service } = await requireOwnerAdmin(authHeader, company_id);
    const { error } = await service
      .from("company_members")
      .update({ is_active })
      .eq("id", member_id)
      .eq("company_id", company_id);

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("[toggle-company-member-active] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
