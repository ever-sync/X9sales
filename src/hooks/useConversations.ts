import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Conversation } from '../types';
import { CACHE, PAGINATION } from '../config/constants';
import { filterBlockedItems, useBlockedPhones } from './useBlockedPhones';

interface UseConversationsOptions {
  agentId?: string;
  status?: string;
  channel?: string;
  page?: number;
  pageSize?: number;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const { companyId } = useCompany();
  const { blockedPhones, isLoading: isLoadingBlockedPhones } = useBlockedPhones();
  const { agentId, status, channel, page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE } = options;

  return useQuery<{ data: Conversation[]; count: number }>({
    queryKey: ['conversations', companyId, agentId, status, channel, page, pageSize, Array.from(blockedPhones).join(',')],
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

      const { data, error } = await query;

      if (error) throw error;

      const filtered = filterBlockedItems((data ?? []) as Conversation[], (conversation) => conversation.customer?.phone, blockedPhones);
      return { data: filtered, count: filtered.length };
    },
    enabled: !!companyId && !isLoadingBlockedPhones,
    staleTime: CACHE.STALE_TIME,
  });
}
