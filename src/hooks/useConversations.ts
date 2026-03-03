import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Conversation } from '../types';
import { CACHE, PAGINATION } from '../config/constants';

interface UseConversationsOptions {
  agentId?: string;
  status?: string;
  channel?: string;
  page?: number;
  pageSize?: number;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const { companyId } = useCompany();
  const { agentId, status, channel, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE } = options;

  return useQuery<{ data: Conversation[]; count: number }>({
    queryKey: ['conversations', companyId, agentId, status, channel, page, pageSize],
    queryFn: async () => {
      if (!companyId) return { data: [], count: 0 };

      let query = supabase
        .from('conversations')
        .select('*, agent:agents(*), customer:customers(*), metrics:metrics_conversation(*)', { count: 'exact' })
        .eq('company_id', companyId)
        .order('started_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (agentId) query = query.eq('agent_id', agentId);
      if (status) query = query.eq('status', status);
      if (channel) query = query.eq('channel', channel);

      const { data, error, count } = await query;

      if (error) throw error;
      return { data: (data ?? []) as Conversation[], count: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });
}
