import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getUazapiConfig, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type SyncAgentAvatarsPayload = {
  company_id: string;
};

type UazApiInstance = {
  id?: string;
  token?: string;
  name?: string;
  profileName?: string;
  profilePicUrl?: string | null;
  status?: string;
};

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const payload = (await req.json()) as SyncAgentAvatarsPayload;

    if (!payload.company_id) {
      return json({ error: "company_id is required" }, { status: 200 });
    }

    const { service } = await requireOwnerAdmin(authHeader, payload.company_id);
    const config = getUazapiConfig();

    if (!config.baseUrl) {
      return json({ error: "UAZAPI_BASE_URL nao configurada." }, { status: 200 });
    }

    if (!config.adminToken) {
      return json({ error: "UAZAPI_ADMIN_TOKEN nao configurado." }, { status: 200 });
    }

    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/instance/all`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "admintoken": config.adminToken,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("[sync-agent-avatars] UAZAPI error:", response.status, details);
      return json({ error: `Falha ao consultar a UazAPI (${response.status}).` }, { status: 200 });
    }

    const raw = await response.json();
    const instances = Array.isArray(raw) ? (raw as UazApiInstance[]) : [];

    const byToken = new Map<string, string>();
    const byName = new Map<string, string>();
    const byProfileName = new Map<string, string>();

    for (const instance of instances) {
      const photo = instance.profilePicUrl?.trim();
      if (!photo) continue;

      const tokenKey = normalize(instance.token);
      const nameKey = normalize(instance.name);
      const profileNameKey = normalize(instance.profileName);

      if (tokenKey) byToken.set(tokenKey, photo);
      if (nameKey) byName.set(nameKey, photo);
      if (profileNameKey) byProfileName.set(profileNameKey, photo);
    }

    const { data: agents, error: agentsError } = await service
      .from("agents")
      .select("id, name, external_id, avatar_url")
      .eq("company_id", payload.company_id)
      .eq("is_active", true)
      .order("name");

    if (agentsError) throw agentsError;

    let updated = 0;
    let matched = 0;
    let alreadyCurrent = 0;
    let unmatched = 0;
    const updatedAgents: Array<{ id: string; name: string; avatar_url: string }> = [];

    for (const agent of agents ?? []) {
      const externalIdKey = normalize(agent.external_id);
      const agentNameKey = normalize(agent.name);

      const nextAvatar =
        (externalIdKey ? byToken.get(externalIdKey) : undefined) ??
        (externalIdKey ? byName.get(externalIdKey) : undefined) ??
        (agentNameKey ? byProfileName.get(agentNameKey) : undefined) ??
        (agentNameKey ? byName.get(agentNameKey) : undefined);

      if (!nextAvatar) {
        unmatched += 1;
        continue;
      }

      matched += 1;

      if (nextAvatar === agent.avatar_url) {
        alreadyCurrent += 1;
        continue;
      }

      const { error: updateError } = await service
        .from("agents")
        .update({ avatar_url: nextAvatar })
        .eq("id", agent.id);

      if (updateError) throw updateError;

      updated += 1;
      updatedAgents.push({
        id: agent.id,
        name: agent.name,
        avatar_url: nextAvatar,
      });
    }

    return json({
      success: true,
      stats: {
        total_instances: instances.length,
        total_agents: agents?.length ?? 0,
        matched,
        updated,
        already_current: alreadyCurrent,
        unmatched,
      },
      updated_agents: updatedAgents,
    });
  } catch (error: any) {
    console.error("[sync-agent-avatars] error:", error);
    return json({ error: error.message || "Erro interno ao sincronizar fotos." }, { status: 200 });
  }
});
