import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { DashboardOverview, AgentRanking, DailyTrend } from '../types';
import { CACHE } from '../config/constants';

export function useDashboardOverview() {
  const { companyId } = useCompany();

  return useQuery<DashboardOverview | null>({
    queryKey: ['dashboard-overview', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('mv_dashboard_overview')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      return (data as DashboardOverview | null) ?? null;
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });
}

export function useAgentRanking() {
  const { companyId } = useCompany();

  return useQuery<AgentRanking[]>({
    queryKey: ['agent-ranking', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mv_agent_ranking')
        .select('*')
        .eq('company_id', companyId)
        .order('total_conversations', { ascending: false });

      if (error) throw error;
      return (data ?? []) as AgentRanking[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });
}

export function useDailyTrend(days: number = 30) {
  const { companyId } = useCompany();

  return useQuery<DailyTrend[]>({
    queryKey: ['daily-trend', companyId, days],
    queryFn: async () => {
      if (!companyId) return [];
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('mv_daily_trend')
        .select('*')
        .eq('company_id', companyId)
        .gte('conversation_date', since.toISOString().split('T')[0])
        .order('conversation_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as DailyTrend[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });
}
