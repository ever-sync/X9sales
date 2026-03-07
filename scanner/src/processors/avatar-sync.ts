import { supabase } from '../config';

/**
 * UazApi GET /instance/all response shape.
 * Requires AdminToken header (same key as WHAZAPI_KEY).
 */
interface UazApiInstance {
  id: string;       // short hex id, e.g. "ra9da85babf05e6"
  token: string;    // UUID — matches agents.external_id, e.g. "22c3d54a-32f7-415f-8b6d-2643bb6d0f1c"
  name: string;     // human-readable name configured in UazApi
  profilePicUrl?: string;
  profileName?: string;
  status?: string;
  owner?: string;
}

/**
 * Syncs agent avatar_url from UazApi profile pictures.
 *
 * Endpoint: GET {WHAZAPI_URL}/instance/all
 * Auth: AdminToken header (uses the same WHAZAPI_KEY)
 *
 * Matching: agents.external_id → UazApi instance.token (UUID format)
 *           agents.external_id → UazApi instance.name (fallback for manually-set IDs)
 */
export async function syncAgentAvatars(): Promise<void> {
  const whazapiUrl = process.env.WHAZAPI_URL;
  const whazapiKey = process.env.WHAZAPI_KEY;

  if (!whazapiUrl || !whazapiKey) {
    console.log('[AvatarSync] WHAZAPI_URL or WHAZAPI_KEY not configured, skipping.');
    return;
  }

  console.log('[AvatarSync] Starting avatar sync...');

  // 1. Fetch all instances from UazApi
  let instances: UazApiInstance[] = [];
  try {
    const res = await fetch(`${whazapiUrl}/instance/all`, {
      headers: { AdminToken: whazapiKey },
    });

    if (!res.ok) {
      console.error(`[AvatarSync] UazApi returned ${res.status}: ${await res.text()}`);
      return;
    }

    const json = await res.json() as unknown;
    instances = Array.isArray(json) ? (json as UazApiInstance[]) : [];
    console.log(`[AvatarSync] Found ${instances.length} instances from UazApi`);
  } catch (err) {
    console.error('[AvatarSync] Failed to fetch instances from UazApi:', err);
    return;
  }

  if (instances.length === 0) return;

  // Build lookup maps
  // byToken: instance.token (UUID) → pic — matches when external_id = UazApi token
  // byName:  instance.name (lowercase) → pic — fallback by agent display name
  const byToken = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const inst of instances) {
    if (!inst.profilePicUrl) continue;
    if (inst.token) byToken.set(inst.token, inst.profilePicUrl);
    if (inst.name) byName.set(inst.name.toLowerCase().trim(), inst.profilePicUrl);
  }

  // 2. Fetch all active agents
  const { data: agents, error: agentsErr } = await supabase
    .schema('app')
    .from('agents')
    .select('id, name, external_id, avatar_url')
    .eq('is_active', true);

  if (agentsErr || !agents) {
    console.error('[AvatarSync] Failed to fetch agents:', agentsErr?.message);
    return;
  }

  // 3. Match and update
  let updated = 0;
  for (const agent of agents) {
    if (!agent.external_id) continue;

    // 1. Match by token (when external_id IS the UazApi token UUID)
    // 2. Fall back to matching by agent display name (case-insensitive)
    const agentName: string = (agent as Record<string, unknown>).name as string ?? '';
    const newPic =
      byToken.get(agent.external_id) ??
      (agentName ? byName.get(agentName.toLowerCase().trim()) : undefined);
    if (!newPic) continue;
    if (newPic === agent.avatar_url) continue; // already up to date

    const { error: updErr } = await supabase
      .schema('app')
      .from('agents')
      .update({ avatar_url: newPic })
      .eq('id', agent.id);

    if (updErr) {
      console.error(`[AvatarSync] Failed to update avatar for agent ${agent.id}:`, updErr.message);
    } else {
      updated++;
      console.log(`[AvatarSync] Updated avatar for agent ${agent.id} (external_id: ${agent.external_id})`);
    }
  }

  console.log(`[AvatarSync] Done. Updated ${updated} of ${agents.length} agents.`);
}
