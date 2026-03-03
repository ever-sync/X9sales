import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "owner_admin" | "manager" | "qa_reviewer" | "agent";

interface PublishRequestBody {
  company_id?: string;
  playbook_id?: string;
}

interface MemberRow {
  role: Role;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return null;
  const token = authorizationHeader.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function parseBody(value: unknown): PublishRequestBody {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;
  return {
    company_id: typeof body.company_id === "string" ? body.company_id.trim() : undefined,
    playbook_id: typeof body.playbook_id === "string" ? body.playbook_id.trim() : undefined,
  };
}

async function getMemberRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<Role> {
  const { data: member, error } = await supabase
    .schema("app")
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao validar membership: ${error.message}`);
  }
  if (!member) {
    throw new Error("Voce nao e membro ativo desta empresa.");
  }

  return (member as MemberRow).role;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const token = getBearerToken(req.headers.get("authorization"));
    if (!token) return json(401, { error: "Missing Authorization bearer token." });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      return json(401, { error: "Invalid or expired token." });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return json(400, { error: "Payload JSON invalido." });

    const body = parseBody(rawBody);
    if (!body.company_id) return json(400, { error: "Campo 'company_id' obrigatorio." });
    if (!body.playbook_id) return json(400, { error: "Campo 'playbook_id' obrigatorio." });

    const role = await getMemberRole(supabase, user.id, body.company_id);
    if (role !== "owner_admin" && role !== "manager") {
      return json(403, { error: "Somente owner_admin e manager podem publicar playbook." });
    }

    const { data: playbook, error: playbookError } = await supabase
      .schema("app")
      .from("playbooks")
      .select("id, company_id, segment, name, status, version")
      .eq("company_id", body.company_id)
      .eq("id", body.playbook_id)
      .maybeSingle();

    if (playbookError && playbookError.code !== "PGRST116") {
      return json(500, { error: `Falha ao carregar playbook: ${playbookError.message}` });
    }
    if (!playbook) {
      return json(404, { error: "Playbook nao encontrado para esta empresa." });
    }

    const { count: rulesCount, error: rulesCountError } = await supabase
      .schema("app")
      .from("playbook_rules")
      .select("id", { count: "exact", head: true })
      .eq("playbook_id", body.playbook_id)
      .eq("company_id", body.company_id);

    if (rulesCountError) {
      return json(500, { error: `Falha ao validar regras do playbook: ${rulesCountError.message}` });
    }
    if (!rulesCount || rulesCount < 1) {
      return json(400, { error: "Adicione pelo menos 1 regra antes de publicar o playbook." });
    }

    const { error: deactivateError } = await supabase
      .schema("app")
      .from("playbooks")
      .update({ status: "draft" })
      .eq("company_id", body.company_id)
      .eq("segment", playbook.segment)
      .eq("status", "active")
      .neq("id", body.playbook_id);

    if (deactivateError) {
      return json(500, { error: `Falha ao desativar playbooks antigos: ${deactivateError.message}` });
    }

    const { data: publishedPlaybook, error: publishError } = await supabase
      .schema("app")
      .from("playbooks")
      .update({ status: "active" })
      .eq("company_id", body.company_id)
      .eq("id", body.playbook_id)
      .select("id, name, segment, status, version, updated_at")
      .single();

    if (publishError || !publishedPlaybook) {
      return json(500, { error: `Falha ao publicar playbook: ${publishError?.message ?? "erro desconhecido"}` });
    }

    return json(200, {
      success: true,
      message: "Playbook publicado com sucesso.",
      playbook: publishedPlaybook,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return json(500, { error: message });
  }
});
