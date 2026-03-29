import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '../contexts/CompanyContext';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';

function normalizeBlockedPhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function isPhoneBlocked(phone: string | null | undefined, blockedPhones: Set<string> | string[]) {
  const normalized = normalizeBlockedPhone(phone);
  if (!normalized) return false;
  if (blockedPhones instanceof Set) return blockedPhones.has(normalized);
  return blockedPhones.includes(normalized);
}

export function filterBlockedItems<T>(
  items: T[],
  getPhone: (item: T) => string | null | undefined,
  blockedPhones: Set<string> | string[],
) {
  return items.filter((item) => !isPhoneBlocked(getPhone(item), blockedPhones));
}

export function useBlockedPhones() {
  const { companyId, company } = useCompany();
  const blockTeamAnalysis = !!company?.settings.block_team_analysis;

  const storedBlockedPhones = useMemo(() => {
    const numbers = new Set<string>();

    for (const phone of company?.settings.blocked_report_numbers ?? []) {
      const normalized = normalizeBlockedPhone(String(phone));
      if (normalized) numbers.add(normalized);
    }

    for (const customer of company?.settings.blocked_analysis_customers ?? []) {
      const normalized = normalizeBlockedPhone(customer.phone);
      if (normalized) numbers.add(normalized);
    }

    return Array.from(numbers);
  }, [company?.settings.blocked_analysis_customers, company?.settings.blocked_report_numbers]);

  const { data: teamPhones = [], isLoading: isLoadingTeamPhones } = useQuery<string[]>({
    queryKey: ['blocked-team-phones', companyId],
    queryFn: async () => {
      if (!companyId || !blockTeamAnalysis) return [];

      const { data, error } = await supabase
        .from('agents')
        .select('phone')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .not('phone', 'is', null);

      if (error) throw error;

      return (data ?? [])
        .map((row: { phone?: string | null }) => normalizeBlockedPhone(row.phone))
        .filter(Boolean);
    },
    enabled: !!companyId && blockTeamAnalysis,
    staleTime: CACHE.STALE_TIME,
  });

  const blockedPhones = useMemo(() => {
    const numbers = new Set<string>(storedBlockedPhones);
    if (blockTeamAnalysis) {
      for (const phone of teamPhones) {
        const normalized = normalizeBlockedPhone(phone);
        if (normalized) numbers.add(normalized);
      }
    }
    return numbers;
  }, [blockTeamAnalysis, storedBlockedPhones, teamPhones]);

  const blockedPhonesList = useMemo(
    () => Array.from(blockedPhones).sort(),
    [blockedPhones],
  );

  const { data: blockedConversationIds = [], isLoading: isLoadingBlockedConversations } = useQuery<string[]>({
    queryKey: ['blocked-conversation-ids', companyId, blockedPhonesList.join(',')],
    queryFn: async () => {
      if (!companyId || blockedPhonesList.length === 0) return [];

      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, phone')
        .eq('company_id', companyId)
        .in('phone', blockedPhonesList);

      if (customersError) throw customersError;

      const customerIds = (customers ?? []).map((customer: { id: string }) => customer.id).filter(Boolean);
      if (customerIds.length === 0) return [];

      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('id')
        .eq('company_id', companyId)
        .in('customer_id', customerIds);

      if (conversationsError) throw conversationsError;

      return (conversations ?? []).map((conversation: { id: string }) => conversation.id).filter(Boolean);
    },
    enabled: !!companyId && blockedPhonesList.length > 0,
    staleTime: CACHE.STALE_TIME,
  });

  const blockedConversationIdSet = useMemo(
    () => new Set(blockedConversationIds),
    [blockedConversationIds],
  );

  return {
    blockedPhones,
    blockedPhonesList,
    blockedConversationIds: blockedConversationIdSet,
    isBlockedPhone: (phone: string | null | undefined) => isPhoneBlocked(phone, blockedPhones),
    isBlockedConversationId: (conversationId: string | null | undefined) => !!conversationId && blockedConversationIdSet.has(conversationId),
    isLoading: (blockTeamAnalysis ? isLoadingTeamPhones : false) || isLoadingBlockedConversations,
  };
}

export { normalizeBlockedPhone };
