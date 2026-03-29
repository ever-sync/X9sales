import { supabase } from '../integrations/supabase/client';

export type SyncAgentAvatarsResult = {
  success?: boolean;
  error?: string;
  stats?: {
    total_instances: number;
    total_agents: number;
    matched: number;
    updated: number;
    already_current: number;
    unmatched: number;
  };
  updated_agents?: Array<{
    id: string;
    name: string;
    avatar_url: string;
  }>;
};

export async function invokeSyncAgentAvatars(companyId: string) {
  const { data, error } = await supabase.functions.invoke('sync-agent-avatars', {
    body: { company_id: companyId },
  });

  if (error) {
    throw new Error('Falha ao sincronizar fotos com a UazAPI.');
  }

  const result = (data ?? {}) as SyncAgentAvatarsResult;
  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}
