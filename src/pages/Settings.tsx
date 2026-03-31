import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Building2,
  CreditCard,
  Globe2,
  ImagePlus,
  PencilLine,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  UserPlus,
  Users,
  X,
  Clock3,
  RefreshCcw,
  Plug,
  Copy,
  CheckCircle2,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { supabase } from '../integrations/supabase/client';
import { env } from '../config/env';
import type { BillingInvoice, BillingSubscription, BlockedAnalysisCustomer, CompanyInvite, CompanySettings, NotificationJobSummary } from '../types';
import { cn, formatCurrency, formatDate, formatDateTime, formatSeconds } from '../lib/utils';
import { areBrowserAlertsEnabled, requestBrowserAlertPermission, setBrowserAlertsEnabled } from '../lib/browserNotifications';

function InfoCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value || 'Nao informado'}</p>
    </div>
  );
}

type ProfileForm = {
  companyName: string;
  legalName: string;
  documentType: 'cpf' | 'cnpj';
  documentNumber: string;
  logoUrl: string;
};

type NotificationForm = {
  autoBlockOnCriticalRisk: boolean;
  adminReportFrequency: 'daily' | 'weekly' | 'monthly';
  adminReportChannel: 'email' | 'whatsapp';
  adminReportWeekday: string;
  adminReportMonthDay: number;
  agentMorningImprovementIdeas: boolean;
  agentFollowUpAlerts: boolean;
};

type AccessForm = {
  email: string;
  role: 'owner_admin' | 'agent';
};

type WorkspaceUser = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  display_name: string;
  email: string | null;
};

type TeamPhoneRow = {
  id: string;
  name: string;
  phone: string | null;
};

type CustomerSearchRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

type WorkspaceAccessRow =
  | {
      kind: 'member';
      id: string;
      role: string;
      status: 'Ativo' | 'Inativo';
      createdAt: string;
      display_name: string;
      email: string | null;
      member_id: string;
      user_id: string;
      is_active: boolean;
    }
  | {
      kind: 'invite';
      id: string;
      role: string;
      status: 'Convite pendente';
      createdAt: string;
      display_name: string;
      email: string;
      invite_id: string;
      expires_at: string;
    };

type AccountProfileForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const weekdayLabels: Record<string, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terca-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sabado',
  sunday: 'Domingo',
};

const settingsTabs = ['account', 'company', 'billing', 'notifications', 'blocking', 'users', 'integrations'] as const;
type SettingsTab = (typeof settingsTabs)[number];

function resolveSettingsTab(value: string | null): SettingsTab {
  if (value && settingsTabs.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return 'account';
}

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatDocument(value: string, type: 'cpf' | 'cnpj') {
  const digits = sanitizeDigits(value);
  if (type === 'cpf') {
    return digits
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function isValidDocument(value: string, type: 'cpf' | 'cnpj') {
  const digits = sanitizeDigits(value);
  return type === 'cpf' ? digits.length === 11 : digits.length === 14;
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function isValidPhoneForBlocklist(value: string) {
  const digits = sanitizeDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

function dedupeBlockedCustomers(customers: BlockedAnalysisCustomer[]) {
  const seen = new Set<string>();
  const next: BlockedAnalysisCustomer[] = [];

  for (const customer of customers) {
    const normalized = sanitizeDigits(customer.phone);
    if (!isValidPhoneForBlocklist(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push({
      id: customer.id,
      name: customer.name?.trim() || null,
      phone: normalized,
    });
  }

  return next.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
}

function escapeIlike(value: string) {
  return value.replace(/[,%()]/g, ' ').trim();
}

function formatBlockedPhone(value: string) {
  const digits = sanitizeDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2).replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}`;
  }
  return digits;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    owner_admin: 'ADMIN',
    agent: 'VISUALIZADOR',
  };
  return labels[role] ?? role;
}

export default function Settings() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showCreateAccess, setShowCreateAccess] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    companyName: '',
    legalName: '',
    documentType: 'cnpj',
    documentNumber: '',
    logoUrl: '',
  });
  const [notificationForm, setNotificationForm] = useState<NotificationForm>({
    autoBlockOnCriticalRisk: false,
    adminReportFrequency: 'daily',
    adminReportChannel: 'email',
    adminReportWeekday: 'monday',
    adminReportMonthDay: 1,
    agentMorningImprovementIdeas: false,
    agentFollowUpAlerts: false,
  });
  const [accessForm, setAccessForm] = useState<AccessForm>({
    email: '',
    role: 'agent',
  });
  const [blockTeamAnalysis, setBlockTeamAnalysis] = useState(false);
  const [blockedClientSearch, setBlockedClientSearch] = useState('');
  const [blockedCustomers, setBlockedCustomers] = useState<BlockedAnalysisCustomer[]>([]);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('default');
  const [browserAlertsEnabled, setBrowserAlertsEnabledState] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [accountProfileForm, setAccountProfileForm] = useState<AccountProfileForm>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!company) return;

    setProfileForm({
      companyName: company.name,
      legalName: company.settings.legal_name ?? company.name,
      documentType: company.settings.document_type ?? 'cnpj',
      documentNumber: formatDocument(company.settings.document_number ?? '', company.settings.document_type ?? 'cnpj'),
      logoUrl: company.settings.logo_url ?? '',
    });

    setNotificationForm({
      autoBlockOnCriticalRisk: !!company.settings.auto_block_on_critical_risk,
      adminReportFrequency: company.settings.admin_report_frequency ?? 'daily',
      adminReportChannel: company.settings.admin_report_channel ?? 'email',
      adminReportWeekday: company.settings.admin_report_weekday ?? 'monday',
      adminReportMonthDay: company.settings.admin_report_month_day ?? 1,
      agentMorningImprovementIdeas: !!company.settings.agent_morning_improvement_ideas,
      agentFollowUpAlerts: !!company.settings.agent_follow_up_alerts,
    });

    setBlockTeamAnalysis(!!company.settings.block_team_analysis);
    setBlockedCustomers(
      Array.isArray(company.settings.blocked_analysis_customers)
        ? dedupeBlockedCustomers(company.settings.blocked_analysis_customers)
        : Array.isArray(company.settings.blocked_report_numbers)
          ? dedupeBlockedCustomers(
              company.settings.blocked_report_numbers.map((number, index) => ({
                id: `legacy-${index}`,
                name: null,
                phone: sanitizeDigits(String(number)),
              })),
            )
          : [],
    );
  }, [company]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      setBrowserAlertsEnabledState(false);
      return;
    }

    setBrowserNotificationPermission(Notification.permission);
    setBrowserAlertsEnabledState(areBrowserAlertsEnabled());
  }, []);

  useEffect(() => {
    if (!user) return;

    setAccountProfileForm({
      name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
      email: user.email ?? '',
      password: '',
      confirmPassword: '',
    });
  }, [user]);

  const canManageUsers = can('settings.users');
  const canManageBilling = can('settings.company');
  const requestedTab = resolveSettingsTab(searchParams.get('tab'));
  const activeTab = requestedTab === 'users' && !canManageUsers ? 'account' : requestedTab;
  const checkoutStatus = searchParams.get('checkout');

  const handleTabChange = (value: string) => {
    const nextTab = resolveSettingsTab(value);
    const params = new URLSearchParams(searchParams);

    if (nextTab === 'account') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    params.delete('checkout');

    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (!checkoutStatus) return;

    if (checkoutStatus === 'success') {
      toast.success('Assinatura iniciada com sucesso. Aguarde alguns segundos para sincronizar os dados.');
      queryClient.invalidateQueries({ queryKey: ['billing-subscription', company?.id] });
      queryClient.invalidateQueries({ queryKey: ['billing-invoices', company?.id] });
    } else if (checkoutStatus === 'cancelled') {
      toast.info('Checkout cancelado. Nenhuma cobranca foi realizada.');
    } else {
      toast.error('Nao foi possivel confirmar o resultado do checkout.');
    }

    const params = new URLSearchParams(searchParams);
    params.delete('checkout');
    setSearchParams(params, { replace: true });
  }, [checkoutStatus, company?.id, queryClient, searchParams, setSearchParams]);

  const { data: workspaceUsers = [], isLoading: isLoadingUsers } = useQuery<WorkspaceUser[]>({
    queryKey: ['workspace-users', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const [{ data: members, error: membersError }, { data: agents, error: agentsError }] = await Promise.all([
        supabase
          .from('company_members')
          .select('id, user_id, role, is_active, created_at')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('agents')
          .select('member_id, name, email')
          .eq('company_id', company.id),
      ]);

      if (membersError) throw membersError;
      if (agentsError) throw agentsError;

      const agentMap = new Map<string, { name: string | null; email: string | null }>();
      (agents ?? []).forEach((agent: any) => {
        if (agent.member_id) {
          agentMap.set(agent.member_id, {
            name: agent.name ?? null,
            email: agent.email ?? null,
          });
        }
      });

      return (members ?? []).map((member: any) => {
        const agent = agentMap.get(member.id);
        return {
          id: member.id,
          user_id: member.user_id,
          role: member.role,
          is_active: member.is_active,
          created_at: member.created_at,
          display_name: agent?.name ?? `Usuario ${String(member.user_id).slice(0, 8)}`,
          email: agent?.email ?? null,
        };
      });
    },
    enabled: !!company && canManageUsers,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pendingInvites = [], isLoading: isLoadingInvites } = useQuery<CompanyInvite[]>({
    queryKey: ['company-invites', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const { data, error } = await supabase
        .from('company_invites')
        .select('*')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as CompanyInvite[];
    },
    enabled: !!company && canManageUsers,
    staleTime: 60 * 1000,
  });

  const { data: billingSubscription, isLoading: isLoadingBilling } = useQuery<BillingSubscription | null>({
    queryKey: ['billing-subscription', company?.id],
    queryFn: async () => {
      if (!company) return null;

      const { data, error } = await supabase
        .from('billing_subscriptions')
        .select('*')
        .eq('company_id', company.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as BillingSubscription | null) ?? null;
    },
    enabled: !!company && canManageBilling,
  });

  const { data: billingInvoices = [] } = useQuery<BillingInvoice[]>({
    queryKey: ['billing-invoices', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const { data, error } = await supabase
        .from('billing_invoices')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      return (data ?? []) as BillingInvoice[];
    },
    enabled: !!company && canManageBilling,
  });

  const { data: notificationJobs = [] } = useQuery<NotificationJobSummary[]>({
    queryKey: ['notification-jobs', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const { data, error } = await supabase
        .from('notification_jobs')
        .select('*')
        .eq('company_id', company.id)
        .order('scheduled_for', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as NotificationJobSummary[];
    },
    enabled: !!company,
    staleTime: 60 * 1000,
  });

  const { data: teamPhones = [] } = useQuery<TeamPhoneRow[]>({
    queryKey: ['settings-team-phones', company?.id],
    queryFn: async () => {
      if (!company) return [];

      const { data, error } = await supabase
        .from('agents')
        .select('id, name, phone')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .not('phone', 'is', null)
        .order('name');

      if (error) throw error;
      return (data ?? []) as TeamPhoneRow[];
    },
    enabled: !!company,
    staleTime: 5 * 60 * 1000,
  });

  const blockedClientSearchTerm = blockedClientSearch.trim();
  const { data: blockedCustomerSearchResults = [], isFetching: isSearchingBlockedCustomers } = useQuery<BlockedAnalysisCustomer[]>({
    queryKey: ['settings-blocked-customer-search', company?.id, blockedClientSearchTerm],
    queryFn: async () => {
      if (!company || blockedClientSearchTerm.length < 2) return [];

      const searchTerm = escapeIlike(blockedClientSearchTerm);
      const digits = sanitizeDigits(blockedClientSearchTerm);
      const filters = [
        searchTerm ? `name.ilike.%${searchTerm}%` : null,
        digits ? `phone.ilike.%${digits}%` : null,
      ].filter(Boolean).join(',');

      if (!filters) return [];

      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('company_id', company.id)
        .not('phone', 'is', null)
        .or(filters)
        .limit(8);

      if (error) throw error;

      return dedupeBlockedCustomers(
        ((data ?? []) as CustomerSearchRow[]).map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone ?? '',
        })),
      );
    },
    enabled: !!company && blockedClientSearchTerm.length >= 2,
    staleTime: 30 * 1000,
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (payload: ProfileForm) => {
      if (!company) return;
      if (!payload.companyName.trim()) {
        throw new Error('Informe o nome da empresa.');
      }
      if (!payload.legalName.trim()) {
        throw new Error('Informe a razao social ou nome completo.');
      }
      if (payload.documentNumber && !isValidDocument(payload.documentNumber, payload.documentType)) {
        throw new Error(payload.documentType === 'cpf' ? 'CPF invalido.' : 'CNPJ invalido.');
      }

      const nextSettings = {
        ...company.settings,
        legal_name: payload.legalName,
        document_type: payload.documentType,
        document_number: sanitizeDigits(payload.documentNumber),
        logo_url: payload.logoUrl.trim(),
      };

      const { error } = await supabase
        .from('companies' as any)
        .update({
          name: payload.companyName,
          settings: nextSettings,
        })
        .eq('id', company.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-company'] });
      toast.success('Perfil da empresa atualizado');
      setIsEditingProfile(false);
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar perfil: ${err.message}`);
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: CompanySettings) => {
      if (!company) return;

      const { error } = await supabase
        .from('companies' as any)
        .update({ settings: newSettings })
        .eq('id', company.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-company'] });
      toast.success('Configuracoes atualizadas');
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar: ${err.message}`);
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!company) throw new Error('Empresa nao carregada.');

      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'png';
      const path = `${company.id}/logo-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('company-assets').getPublicUrl(path);
      return data.publicUrl;
    },
    onSuccess: (publicUrl) => {
      setProfileForm((current) => ({ ...current, logoUrl: publicUrl }));
      toast.success('Logo enviada. Salve o perfil da empresa para aplicar.');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar logo: ${error.message}`);
    },
  });

  const updateAccountProfileMutation = useMutation({
    mutationFn: async (payload: AccountProfileForm) => {
      if (!user) return;
      if (!payload.name.trim()) {
        throw new Error('Informe seu nome.');
      }
      if (!isValidEmail(payload.email)) {
        throw new Error('Informe um e-mail valido.');
      }
      if (payload.password && payload.password !== payload.confirmPassword) {
        throw new Error('As senhas nao coincidem.');
      }

      const updatePayload: {
        email?: string;
        password?: string;
        data?: Record<string, unknown>;
      } = {
        email: payload.email,
        data: {
          full_name: payload.name,
        },
      };

      if (payload.password) {
        updatePayload.password = payload.password;
      }

      const { error } = await supabase.auth.updateUser(updatePayload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      toast.success('Perfil de acesso atualizado. Se o e-mail mudou, confirme a alteracao na sua caixa de entrada.');
      setAccountProfileForm((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
      }));
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar perfil: ${err.message}`);
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (payload: AccessForm) => {
      if (!company) return;
      if (!isValidEmail(payload.email)) {
        throw new Error('Informe um e-mail valido para o convite.');
      }

      const { data, error } = await supabase.functions.invoke('invite-workspace-user', {
        body: {
          company_id: company.id,
          email: payload.email.trim().toLowerCase(),
          role: payload.role,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Convite enviado');
      setAccessForm({ email: '', role: 'agent' });
      setShowCreateAccess(false);
      queryClient.invalidateQueries({ queryKey: ['company-invites', company?.id] });
    },
    onError: (err: Error) => toast.error(`Erro ao criar acesso: ${err.message}`),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('resend-company-invite', {
        body: { company_id: company.id, invite_id: inviteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success('Convite reenviado'),
    onError: (err: Error) => toast.error(`Erro ao reenviar convite: ${err.message}`),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('revoke-company-invite', {
        body: { company_id: company.id, invite_id: inviteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Convite revogado');
      queryClient.invalidateQueries({ queryKey: ['company-invites', company?.id] });
    },
    onError: (err: Error) => toast.error(`Erro ao revogar convite: ${err.message}`),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: AccessForm['role'] }) => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('update-company-member-role', {
        body: { company_id: company.id, member_id: memberId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Perfil do usuario atualizado');
      queryClient.invalidateQueries({ queryKey: ['workspace-users', company?.id] });
    },
    onError: (err: Error) => toast.error(`Erro ao atualizar perfil do usuario: ${err.message}`),
  });

  const toggleMemberActiveMutation = useMutation({
    mutationFn: async ({ memberId, isActive }: { memberId: string; isActive: boolean }) => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('toggle-company-member-active', {
        body: { company_id: company.id, member_id: memberId, is_active: isActive },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Status do usuario atualizado');
      queryClient.invalidateQueries({ queryKey: ['workspace-users', company?.id] });
    },
    onError: (err: Error) => toast.error(`Erro ao atualizar status do usuario: ${err.message}`),
  });

  const billingCheckoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: { company_id: company.id, plan_code: planCode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url?: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.info('Checkout criado, mas nenhuma URL foi retornada.');
    },
    onError: (err: Error) => toast.error(`Erro ao iniciar checkout: ${err.message}`),
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      if (!company) return;
      const { data, error } = await supabase.functions.invoke('billing-portal', {
        body: { company_id: company.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url?: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.info('Portal criado, mas nenhuma URL foi retornada.');
    },
    onError: (err: Error) => toast.error(`Erro ao abrir portal de cobranca: ${err.message}`),
  });

  const accessRows = useMemo<WorkspaceAccessRow[]>(
    () =>
      [
        ...workspaceUsers.map((member) => ({
          kind: 'member' as const,
          id: member.id,
          role: member.role,
          status: member.is_active ? ('Ativo' as const) : ('Inativo' as const),
          createdAt: member.created_at,
          display_name: member.display_name,
          email: member.email,
          member_id: member.id,
          user_id: member.user_id,
          is_active: member.is_active,
        })),
        ...pendingInvites.map((invite) => ({
          kind: 'invite' as const,
          id: `invite-${invite.id}`,
          role: invite.role,
          status: 'Convite pendente' as const,
          createdAt: invite.created_at,
          display_name: invite.email.split('@')[0],
          email: invite.email,
          invite_id: invite.id,
          expires_at: invite.expires_at,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [pendingInvites, workspaceUsers],
  );

  if (!company) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const settings = company.settings;
  const workingDaysLabel = settings.working_days?.length
    ? `${settings.working_days.length} dias por semana`
    : 'Nao configurado';
  const documentPreview = profileForm.documentNumber
    ? formatDocument(profileForm.documentNumber, profileForm.documentType)
    : '';
  const latestInvoice = billingInvoices[0] ?? null;
  const subscriptionEndsAt = billingSubscription?.current_period_end ?? latestInvoice?.due_date ?? null;
  const daysUntilDue = subscriptionEndsAt
    ? Math.max(0, Math.ceil((new Date(subscriptionEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const billingAmount = billingSubscription ? formatCurrency(billingSubscription.amount_cents / 100) : '--';
  const billingCycle = billingSubscription?.billing_cycle ?? '--';
  const billingStatus = billingSubscription?.status ?? 'Sem assinatura';
  const billingPlan = billingSubscription?.plan_name ?? 'Enterprise';
  const includedSeats = billingSubscription?.included_seats ?? 0;
  const usedSeats = billingSubscription?.used_seats ?? workspaceUsers.length;
  const lastAdminJob = notificationJobs.find((job) => job.job_type === 'admin_report' && job.status === 'sent') ?? null;
  const nextAdminJob =
    [...notificationJobs]
      .filter((job) => job.job_type === 'admin_report' && job.status === 'pending')
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0] ?? null;
  const pendingInvitesCount = pendingInvites.length;

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    setProfileForm((current) => {
      if (field === 'documentNumber') {
        return {
          ...current,
          documentNumber: formatDocument(value, current.documentType),
        };
      }

      if (field === 'documentType') {
        const nextType = value as ProfileForm['documentType'];
        return {
          ...current,
          documentType: nextType,
          documentNumber: formatDocument(current.documentNumber, nextType),
        };
      }

      return { ...current, [field]: value };
    });
  };

  const handleNotificationChange = <K extends keyof NotificationForm>(field: K, value: NotificationForm[K]) => {
    setNotificationForm((current) => ({ ...current, [field]: value }));
  };

  const resetProfileForm = () => {
    setProfileForm({
      companyName: company.name,
      legalName: company.settings.legal_name ?? company.name,
      documentType: company.settings.document_type ?? 'cnpj',
      documentNumber: formatDocument(company.settings.document_number ?? '', company.settings.document_type ?? 'cnpj'),
      logoUrl: company.settings.logo_url ?? '',
    });
    setIsEditingProfile(false);
  };

  const saveNotificationSettings = () => {
    updateSettingsMutation.mutate({
      ...company.settings,
      auto_block_on_critical_risk: notificationForm.autoBlockOnCriticalRisk,
      admin_report_frequency: notificationForm.adminReportFrequency,
      admin_report_channel: notificationForm.adminReportChannel,
      admin_report_weekday: notificationForm.adminReportWeekday,
      admin_report_month_day: notificationForm.adminReportMonthDay,
      agent_morning_improvement_ideas: notificationForm.agentMorningImprovementIdeas,
      agent_follow_up_alerts: notificationForm.agentFollowUpAlerts,
    });
  };

  const saveBlockedNumbers = () => {
    updateSettingsMutation.mutate({
      ...company.settings,
      block_team_analysis: blockTeamAnalysis,
      blocked_analysis_customers: blockedCustomers,
      blocked_report_numbers: blockedCustomers.map((customer) => sanitizeDigits(customer.phone)),
    });
  };

  const addBlockedCustomer = (customer: BlockedAnalysisCustomer) => {
    const normalized = sanitizeDigits(customer.phone);
    if (!isValidPhoneForBlocklist(normalized)) {
      toast.error('Esse cliente nao possui numero valido para bloqueio.');
      return;
    }
    if (blockedCustomers.some((item) => sanitizeDigits(item.phone) === normalized)) {
      toast.info('Esse cliente ja esta bloqueado.');
      return;
    }
    setBlockedCustomers((current) => dedupeBlockedCustomers([
      ...current,
      {
        id: customer.id,
        name: customer.name,
        phone: normalized,
      },
    ]));
    setBlockedClientSearch('');
  };

  const removeBlockedCustomer = (phone: string) => {
    const normalized = sanitizeDigits(phone);
    setBlockedCustomers((current) => current.filter((item) => sanitizeDigits(item.phone) !== normalized));
  };

  const handleEnableBrowserAlerts = async () => {
    const permission = await requestBrowserAlertPermission();
    if (permission === 'unsupported') {
      toast.error('Este navegador nao suporta notificacoes.');
      return;
    }

    setBrowserNotificationPermission(permission);
    const enabled = permission === 'granted';
    setBrowserAlertsEnabledState(enabled);

    if (enabled) toast.success('Alertas do navegador ativados para eventos criticos.');
    else toast.error('Permissao de notificacao nao concedida.');
  };

  const handleDisableBrowserAlerts = () => {
    setBrowserAlertsEnabled(false);
    setBrowserAlertsEnabledState(false);
    toast.success('Alertas do navegador desativados neste dispositivo.');
  };

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadLogoMutation.mutate(file);
    event.target.value = '';
  };

  const handleCreateAccess = () => {
    inviteUserMutation.mutate(accessForm);
  };

  const handleAccountProfileChange = (field: keyof AccountProfileForm, value: string) => {
    setAccountProfileForm((current) => ({ ...current, [field]: value }));
  };

  const blockedCustomerPhones = useMemo(
    () => new Set(blockedCustomers.map((customer) => sanitizeDigits(customer.phone))),
    [blockedCustomers],
  );

  const teamPhoneCount = useMemo(
    () => new Set(teamPhones.map((member) => sanitizeDigits(member.phone ?? '')).filter((phone) => isValidPhoneForBlocklist(phone))).size,
    [teamPhones],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configuracoes</h2>
        <p className="text-muted-foreground mt-1">Gerencie dados da empresa, cobranca e regras de notificacao</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-2 rounded-2xl bg-card p-2">
          <TabsTrigger value="account" className="rounded-xl px-4 py-2.5">
            Perfil
          </TabsTrigger>
          <TabsTrigger value="company" className="rounded-xl px-4 py-2.5">
            Perfil da empresa
          </TabsTrigger>
          <TabsTrigger value="billing" className="rounded-xl px-4 py-2.5">
            Faturamento
          </TabsTrigger>
          <TabsTrigger value="notifications" className="rounded-xl px-4 py-2.5">
            Notificacoes
          </TabsTrigger>
          <TabsTrigger value="blocking" className="rounded-xl px-4 py-2.5">
            Bloqueio
          </TabsTrigger>
          {canManageUsers && (
            <TabsTrigger value="users" className="rounded-xl px-4 py-2.5">
              Usuarios
            </TabsTrigger>
          )}
          <TabsTrigger value="integrations" className="rounded-xl px-4 py-2.5">
            Integracoes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-0">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <SettingsIcon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Perfil</h3>
                  <p className="text-sm text-muted-foreground">Gerencie nome, e-mail de acesso e troca de senha</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateAccountProfileMutation.mutate(accountProfileForm)}
                disabled={
                  updateAccountProfileMutation.isPending ||
                  !accountProfileForm.name.trim() ||
                  !isValidEmail(accountProfileForm.email) ||
                  (accountProfileForm.password !== '' && accountProfileForm.password !== accountProfileForm.confirmPassword)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Salvar perfil
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-5">
                <h4 className="font-semibold text-foreground">Dados de acesso</h4>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Nome</label>
                    <Input
                      value={accountProfileForm.name}
                      onChange={(e) => handleAccountProfileChange('name', e.target.value)}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">E-mail de acesso</label>
                    <Input
                      type="email"
                      value={accountProfileForm.email}
                      onChange={(e) => handleAccountProfileChange('email', e.target.value)}
                      placeholder="voce@empresa.com"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <h4 className="font-semibold text-foreground">Trocar senha</h4>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Nova senha</label>
                    <Input
                      type="password"
                      value={accountProfileForm.password}
                      onChange={(e) => handleAccountProfileChange('password', e.target.value)}
                      placeholder="Digite uma nova senha"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Confirmar nova senha</label>
                    <Input
                      type="password"
                      value={accountProfileForm.confirmPassword}
                      onChange={(e) => handleAccountProfileChange('confirmPassword', e.target.value)}
                      placeholder="Repita a nova senha"
                    />
                    {accountProfileForm.password !== '' &&
                      accountProfileForm.confirmPassword !== '' &&
                      accountProfileForm.password !== accountProfileForm.confirmPassword && (
                        <p className="mt-2 text-xs text-red-600">As senhas precisam coincidir.</p>
                      )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-5">
              <h4 className="font-semibold text-foreground">Resumo atual</h4>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Nome" value={accountProfileForm.name} />
                <Field label="E-mail" value={accountProfileForm.email} />
                <Field label="Senha" value={accountProfileForm.password ? 'Atualizacao pendente' : 'Sem alteracao pendente'} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="company" className="mt-0">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Perfil da empresa</h3>
                  <p className="text-sm text-muted-foreground">Cadastre os dados institucionais que identificam sua operacao</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isEditingProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={resetProfileForm}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCompanyMutation.mutate(profileForm)}
                      disabled={updateCompanyMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      Salvar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <PencilLine className="h-4 w-4" />
                    Editar
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Logo da empresa</p>
                <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30">
                  {profileForm.logoUrl ? (
                    <img src={profileForm.logoUrl} alt={profileForm.companyName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
                      <ImagePlus className="h-8 w-8" />
                      <p className="max-w-[180px] text-sm">Adicione uma URL de imagem para visualizar a logo aqui.</p>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-foreground">URL da logo</label>
                  <Input
                    value={profileForm.logoUrl}
                    onChange={(e) => handleProfileChange('logoUrl', e.target.value)}
                    placeholder="https://empresa.com/logo.png"
                    disabled={!isEditingProfile}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={!isEditingProfile || uploadLogoMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {uploadLogoMutation.isPending ? 'Enviando logo...' : 'Enviar arquivo'}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      PNG, JPG ou WebP. O envio atualiza a URL automaticamente.
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Nome da empresa</label>
                    <Input
                      value={profileForm.companyName}
                      onChange={(e) => handleProfileChange('companyName', e.target.value)}
                      disabled={!isEditingProfile}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Razao social ou nome completo</label>
                    <Input
                      value={profileForm.legalName}
                      onChange={(e) => handleProfileChange('legalName', e.target.value)}
                      disabled={!isEditingProfile}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Tipo de documento</label>
                    <select
                      value={profileForm.documentType}
                      onChange={(e) => handleProfileChange('documentType', e.target.value)}
                      disabled={!isEditingProfile}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="cnpj">CNPJ</option>
                      <option value="cpf">CPF</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {profileForm.documentType === 'cpf' ? 'CPF' : 'CNPJ'}
                    </label>
                    <Input
                      value={documentPreview}
                      onChange={(e) => handleProfileChange('documentNumber', e.target.value)}
                      placeholder={profileForm.documentType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                      disabled={!isEditingProfile}
                    />
                    {isEditingProfile && profileForm.documentNumber && !isValidDocument(profileForm.documentNumber, profileForm.documentType) && (
                      <p className="mt-2 text-xs text-red-600">
                        {profileForm.documentType === 'cpf' ? 'CPF deve ter 11 digitos.' : 'CNPJ deve ter 14 digitos.'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label="Nome exibido" value={profileForm.companyName} />
                  <Field label="Documento" value={documentPreview} />
                  <Field label="Slug" value={company.slug ?? 'Nao definido'} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard
                title="SLA primeira resposta"
                value={formatSeconds(settings.sla_first_response_sec)}
                hint="Tempo alvo para o primeiro retorno do atendente."
              />
              <InfoCard
                title="SLA resolucao"
                value={formatSeconds(settings.sla_resolution_sec)}
                hint="Tempo maximo esperado para concluir a conversa."
              />
              <InfoCard
                title="Fuso horario"
                value={settings.timezone}
                hint="Base de calculo para dashboards, relatorios e janelas operacionais."
              />
              <InfoCard
                title="Horario comercial"
                value={`${settings.working_hours_start} - ${settings.working_hours_end}`}
                hint={workingDaysLabel}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background p-5 lg:col-span-2">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">Resumo operacional</h4>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Clock3 className="h-4 w-4 text-primary" />
                      Janela ativa
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.working_hours_start} ate {settings.working_hours_end}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Globe2 className="h-4 w-4 text-primary" />
                      Timezone
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{settings.timezone}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <BellRing className="h-4 w-4 text-primary" />
                      Protecao critica
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.auto_block_on_critical_risk ? 'Ativa' : 'Desativada'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <h4 className="font-semibold text-foreground">Registro do workspace</h4>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Criada em</p>
                    <p className="font-medium text-foreground">{formatDate(company.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Razao social</p>
                    <p className="font-medium text-foreground">{profileForm.legalName || 'Nao informada'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Workspace ID</p>
                    <p className="font-mono text-xs text-foreground">{company.id}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-0">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Faturamento</h3>
                <p className="text-sm text-muted-foreground">Visao financeira da conta e status da cobranca</p>
              </div>
            </div>
            {isLoadingBilling ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <InfoCard title="Plano ativo" value={billingPlan} hint="Plano sincronizado com o Stripe." />
                  <InfoCard title="Ciclo" value={billingCycle} hint="Periodicidade da assinatura atual." />
                  <InfoCard title="Status" value={billingStatus} hint="Estado mais recente recebido do billing." />
                  <InfoCard
                    title="Vencimento"
                    value={daysUntilDue == null ? '--' : `${daysUntilDue} dias`}
                    hint={
                      subscriptionEndsAt
                        ? `Renovacao ou vencimento em ${formatDate(subscriptionEndsAt)}.`
                        : 'Sem periodo ativo sincronizado.'
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-foreground">Resumo da assinatura</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Dados espelhados localmente a partir do Stripe para evitar dependencia direta no frontend.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => billingCheckoutMutation.mutate('enterprise_monthly')}
                          disabled={billingCheckoutMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Upgrade
                        </button>
                        <button
                          type="button"
                          onClick={() => billingPortalMutation.mutate()}
                          disabled={billingPortalMutation.isPending || !billingSubscription}
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Gerenciar cobranca
                        </button>
                      </div>
                    </div>

                    {!billingSubscription ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                        Nenhuma assinatura sincronizada foi encontrada para esta empresa. Use o botao de upgrade para abrir o checkout e ativar o plano.
                      </div>
                    ) : (
                      <>
                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-2xl bg-muted/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Valor atual</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{billingAmount}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Cobrado no ciclo {billingCycle.toLowerCase()} em {billingSubscription.currency.toUpperCase()}.
                            </p>
                          </div>
                          <div className="rounded-2xl bg-muted/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Uso de licencas</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{usedSeats}/{includedSeats || '--'}</p>
                            <p className="mt-1 text-sm text-muted-foreground">Assentos em uso por operadores, gestores e QA.</p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted-foreground">Workspace</p>
                            <p className="mt-1 font-medium text-foreground">{company.name}</p>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted-foreground">Proxima renovacao</p>
                            <p className="mt-1 font-medium text-foreground">
                              {subscriptionEndsAt ? formatDate(subscriptionEndsAt) : 'Nao informada'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted-foreground">Cancelamento ao fim do ciclo</p>
                            <p className="mt-1 font-medium text-foreground">
                              {billingSubscription.cancel_at_period_end ? 'Sim' : 'Nao'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted-foreground">Ultima sincronizacao</p>
                            <p className="mt-1 font-medium text-foreground">{formatDateTime(billingSubscription.updated_at)}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-background p-5">
                      <h4 className="font-semibold text-foreground">Proxima cobranca</h4>
                      <p className="mt-3 text-3xl font-semibold text-foreground">{daysUntilDue == null ? '--' : `${daysUntilDue} dias`}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {subscriptionEndsAt ? `Janela atual termina em ${formatDate(subscriptionEndsAt)}.` : 'Sem vencimento ativo encontrado.'}
                      </p>
                      <div className="mt-4 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
                        Revise licencas e necessidade de upgrade antes do fechamento do ciclo para evitar surpresa na renovacao.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-5">
                      <h4 className="font-semibold text-foreground">Ultima fatura</h4>
                      {latestInvoice ? (
                        <div className="mt-4 space-y-3 text-sm">
                          <p className="text-foreground">Valor: {formatCurrency(latestInvoice.amount_due_cents / 100)}</p>
                          <p className="text-muted-foreground">Status: {latestInvoice.status}</p>
                          <p className="text-muted-foreground">
                            Vencimento: {latestInvoice.due_date ? formatDate(latestInvoice.due_date) : 'Nao informado'}
                          </p>
                          {latestInvoice.hosted_invoice_url && (
                            <a
                              href={latestInvoice.hosted_invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Abrir fatura
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">Nenhuma fatura sincronizada ainda.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-dashed border-border bg-background p-5">
                      <h4 className="font-semibold text-foreground">Outras informacoes</h4>
                      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                        <p>Upgrade abre uma sessao do Stripe Checkout.</p>
                        <p>Gerenciar cobranca redireciona para o Billing Portal do Stripe.</p>
                        <p>O webhook de billing atualiza assinatura e faturas localmente para leitura da UI.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Notificacoes</h3>
                <p className="text-sm text-muted-foreground">Regras de alerta e protecoes automaticas do workspace</p>
              </div>
            </div>

            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-4">
                  <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
                  <div>
                    <h4 className="font-bold leading-none text-red-900">Bloqueio automatico de seguranca</h4>
                    <p className="mt-2 max-w-xl text-sm text-red-700">
                      Interrompe a sessao do atendente instantaneamente se a IA detectar risco critico de spam
                      ou comportamento anomalo.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationForm.autoBlockOnCriticalRisk}
                  onChange={(e) => handleNotificationChange('autoBlockOnCriticalRisk', e.target.checked)}
                  disabled={updateSettingsMutation.isPending}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-5">
                <h4 className="font-semibold text-foreground">Envio para admin</h4>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Frequencia do relatorio</label>
                    <select
                      value={notificationForm.adminReportFrequency}
                      onChange={(e) => handleNotificationChange('adminReportFrequency', e.target.value as NotificationForm['adminReportFrequency'])}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="daily">Todo fim de dia</option>
                      <option value="weekly">Um dia na semana</option>
                      <option value="monthly">Um dia no mes</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Canal de envio</label>
                    <select
                      value={notificationForm.adminReportChannel}
                      onChange={(e) => handleNotificationChange('adminReportChannel', e.target.value as NotificationForm['adminReportChannel'])}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="email">E-mail</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>

                  {notificationForm.adminReportFrequency === 'weekly' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Dia da semana</label>
                      <select
                        value={notificationForm.adminReportWeekday}
                        onChange={(e) => handleNotificationChange('adminReportWeekday', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="monday">Segunda-feira</option>
                        <option value="tuesday">Terca-feira</option>
                        <option value="wednesday">Quarta-feira</option>
                        <option value="thursday">Quinta-feira</option>
                        <option value="friday">Sexta-feira</option>
                        <option value="saturday">Sabado</option>
                        <option value="sunday">Domingo</option>
                      </select>
                    </div>
                  )}

                  {notificationForm.adminReportFrequency === 'monthly' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Dia do mes</label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={notificationForm.adminReportMonthDay}
                        onChange={(e) => handleNotificationChange('adminReportMonthDay', Number(e.target.value || 1))}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <h4 className="font-semibold text-foreground">Notificacoes para atendente</h4>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
                    <div>
                      <p className="font-medium text-foreground">Receber ideias de melhoria toda manha</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sugestoes diarias com ajustes de abordagem e qualidade.
                      </p>
                    </div>
                    <Switch
                      checked={notificationForm.agentMorningImprovementIdeas}
                      onChange={(e) => handleNotificationChange('agentMorningImprovementIdeas', e.target.checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
                    <div>
                      <p className="font-medium text-foreground">Receber alertas de clientes que precisam de follow up</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Avisos para retomar conversas com clientes parados ou sem proximo passo.
                      </p>
                    </div>
                    <Switch
                      checked={notificationForm.agentFollowUpAlerts}
                      onChange={(e) => handleNotificationChange('agentFollowUpAlerts', e.target.checked)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">Alertas criticos no navegador</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Quando houver um alerta critico novo, o app pode avisar este dispositivo em tempo real.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
                      Permissao: {browserNotificationPermission === 'unsupported' ? 'nao suportado' : browserNotificationPermission}
                    </span>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 font-semibold',
                      browserAlertsEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
                    )}>
                      {browserAlertsEnabled ? 'Ativo neste dispositivo' : 'Desativado neste dispositivo'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleEnableBrowserAlerts}
                    disabled={browserNotificationPermission === 'unsupported'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BellRing className="h-4 w-4" />
                    Ativar no navegador
                  </button>
                  <button
                    type="button"
                    onClick={handleDisableBrowserAlerts}
                    disabled={!browserAlertsEnabled}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Desativar neste dispositivo
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-foreground">Resumo da configuracao</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Admin recebe por {notificationForm.adminReportChannel === 'email' ? 'e-mail' : 'WhatsApp'} com frequencia {notificationForm.adminReportFrequency === 'daily' ? 'diaria' : notificationForm.adminReportFrequency === 'weekly' ? 'semanal' : 'mensal'}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveNotificationSettings}
                  disabled={updateSettingsMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  Salvar configuracoes
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ultimo envio admin</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {lastAdminJob ? formatDateTime(lastAdminJob.processed_at ?? lastAdminJob.scheduled_for) : 'Nenhum envio registrado'}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Proximo envio admin</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {nextAdminJob ? formatDateTime(nextAdminJob.scheduled_for) : 'Nenhum job pendente'}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Canal atual</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {notificationForm.adminReportChannel === 'email' ? 'E-mail' : 'WhatsApp'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {notificationForm.adminReportFrequency === 'weekly'
                      ? weekdayLabels[notificationForm.adminReportWeekday]
                      : notificationForm.adminReportFrequency === 'monthly'
                        ? `Dia ${notificationForm.adminReportMonthDay} do mes`
                        : 'Todos os dias'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="blocking" className="mt-0">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Bloqueio</h3>
                <p className="text-sm text-muted-foreground">
                  Defina quais conversas devem ficar fora das analises e relatórios automáticos.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-border bg-background p-5">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">Bloquear time</h4>
                      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                        Quando ativado, o sistema ignora qualquer conversa em que o numero do cliente coincida com numeros cadastrados nos atendentes.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Numeros do time</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{teamPhoneCount}</p>
                      </div>
                      <Switch checked={blockTeamAnalysis} onChange={(event) => setBlockTeamAnalysis(event.target.checked)} />
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className="font-semibold text-foreground">Bloquear clientes específicos</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Busque por nome ou numero, selecione o cliente e ele sai das analises futuras.
                  </p>

                  <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={blockedClientSearch}
                      onChange={(e) => setBlockedClientSearch(e.target.value)}
                      placeholder="Buscar cliente por nome ou numero"
                      className="pl-10"
                    />
                  </div>

                  {blockedClientSearchTerm.length >= 2 && (
                    <div className="mt-3 rounded-2xl border border-border bg-card p-2 shadow-sm">
                      {isSearchingBlockedCustomers ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground">Buscando clientes...</div>
                      ) : blockedCustomerSearchResults.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground">Nenhum cliente com telefone encontrado para essa busca.</div>
                      ) : (
                        blockedCustomerSearchResults.map((customer) => {
                          const alreadySelected = blockedCustomerPhones.has(sanitizeDigits(customer.phone));
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => addBlockedCustomer(customer)}
                              disabled={alreadySelected}
                              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div>
                                <p className="font-medium text-foreground">{customer.name || 'Cliente sem nome'}</p>
                                <p className="text-xs text-muted-foreground">{formatBlockedPhone(customer.phone)}</p>
                              </div>
                              <span className="text-xs font-semibold text-secondary">
                                {alreadySelected ? 'Ja bloqueado' : 'Selecionar'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  {blockedCustomers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      Nenhum cliente bloqueado ainda.
                    </div>
                  ) : (
                    blockedCustomers.map((customer) => (
                      <div key={customer.phone} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{customer.name || 'Cliente sem nome'}</p>
                          <p className="text-xs text-muted-foreground">{formatBlockedPhone(customer.phone)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBlockedCustomer(customer.phone)}
                          className="inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Remover
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <h4 className="font-semibold text-foreground">Resumo</h4>
                  <div className="mt-4 grid grid-cols-1 gap-4">
                    <div className="rounded-2xl bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Clientes bloqueados</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{blockedCustomers.length}</p>
                    </div>
                    <div className="rounded-2xl bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Bloqueio do time</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{blockTeamAnalysis ? `Ativo em ${teamPhoneCount} numeros` : 'Desativado'}</p>
                    </div>
                    <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
                      Use esta area para tirar da leitura da IA conversas internas, linhas de teste e clientes que nao devem contaminar indicadores.
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">
                  O bloqueio sempre compara apenas os digitos do telefone. Mesmo que o numero entre com formatos diferentes, ele sera tratado como o mesmo contato.
                </div>

                <button
                  type="button"
                  onClick={saveBlockedNumbers}
                  disabled={updateSettingsMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  Salvar bloqueios
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {canManageUsers && (
          <TabsContent value="users" className="mt-0">
            <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Usuarios</h3>
                    <p className="text-sm text-muted-foreground">Lista de acessos do sistema vinculados a este workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateAccess((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" />
                  Criar acesso
                </button>
              </div>

              {showCreateAccess && (
                <div className="rounded-2xl border border-border bg-background p-5">
                  <h4 className="font-semibold text-foreground">Novo acesso</h4>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">E-mail do usuario</label>
                      <Input
                        value={accessForm.email}
                        onChange={(e) => setAccessForm((current) => ({ ...current, email: e.target.value }))}
                        placeholder="usuario@empresa.com"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Perfil</label>
                      <select
                        value={accessForm.role}
                        onChange={(e) => setAccessForm((current) => ({ ...current, role: e.target.value as AccessForm['role'] }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="owner_admin">ADMIN</option>
                        <option value="agent">VISUALIZADOR</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleCreateAccess}
                        disabled={inviteUserMutation.isPending || !isValidEmail(accessForm.email)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Enviar convite
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                <div className="rounded-2xl border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h4 className="font-semibold text-foreground">Usuarios do sistema</h4>
                      <p className="text-sm text-muted-foreground">Acessos ativos, inativos e convites pendentes</p>
                    </div>
                    <div className="text-sm text-muted-foreground">{accessRows.length} registro(s)</div>
                  </div>

                  {isLoadingUsers || isLoadingInvites ? (
                    <div className="p-5">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="mb-3 h-16 animate-pulse rounded-2xl bg-muted" />
                      ))}
                    </div>
                  ) : accessRows.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      Nenhum usuario ou convite encontrado para esta empresa.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {accessRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-1 gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1.2fr)_180px_140px_minmax(0,1fr)] xl:items-center">
                          <div>
                            <p className="font-medium text-foreground">{row.display_name}</p>
                            <p className="text-sm text-muted-foreground">{row.email ?? (row.kind === 'member' ? row.user_id : '')}</p>
                          </div>
                          <div>
                            {row.kind === 'member' ? (
                              <select
                                value={row.role === 'owner_admin' ? 'owner_admin' : 'agent'}
                                onChange={(e) =>
                                  updateMemberRoleMutation.mutate({
                                    memberId: row.member_id,
                                    role: e.target.value as AccessForm['role'],
                                  })
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="owner_admin">ADMIN</option>
                                <option value="agent">VISUALIZADOR</option>
                              </select>
                            ) : (
                              <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                                {roleLabel(row.role)}
                              </span>
                            )}
                          </div>
                          <div className="text-sm">
                            <span
                              className={
                                row.status === 'Ativo'
                                  ? 'text-green-600'
                                  : row.status === 'Inativo'
                                    ? 'text-muted-foreground'
                                    : 'text-amber-600'
                              }
                            >
                              {row.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>{row.kind === 'invite' ? `Convidado em ${formatDate(row.createdAt)}` : `Desde ${formatDate(row.createdAt)}`}</span>
                            {row.kind === 'invite' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => resendInviteMutation.mutate(row.invite_id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                >
                                  <RefreshCcw className="h-3.5 w-3.5" />
                                  Reenviar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => revokeInviteMutation.mutate(row.invite_id)}
                                  className="inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                >
                                  Revogar
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleMemberActiveMutation.mutate({
                                    memberId: row.member_id,
                                    isActive: !row.is_active,
                                  })
                                }
                                className="inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                              >
                                {row.is_active ? 'Desativar' : 'Reativar'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                  <h4 className="font-semibold text-foreground">Resumo de acessos</h4>
                  <div className="mt-4 grid grid-cols-1 gap-4">
                    <div className="rounded-2xl bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Usuarios ativos</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {workspaceUsers.filter((entry) => entry.is_active).length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Convites pendentes</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{pendingInvitesCount}</p>
                    </div>
                    <div className="rounded-2xl bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ultimo acesso criado</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {accessRows[0] ? formatDate(accessRows[0].createdAt) : 'Nenhum registro'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="integrations" className="mt-0">
          <IntegrationsTab companyId={company?.id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── aba de integrações ────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3">
        <code className="flex-1 truncate text-sm font-mono text-foreground">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
        >
          {copied ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Copiado</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copiar</>
          )}
        </button>
      </div>
    </div>
  );
}

function IntegrationsTab({ companyId }: { companyId: string | null }) {
  const { data: conversationCount = 0 } = useQuery<number>({
    queryKey: ['integration-status', companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count, error } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const isConnected = conversationCount > 0;
  const webhookUrl = `${env.VITE_SUPABASE_URL}/functions/v1/uazapi-webhook`;

  return (
    <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
      {/* cabeçalho */}
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Integracoes</h3>
          <p className="text-sm text-muted-foreground">Configure a conexao do seu WhatsApp com a plataforma.</p>
        </div>
      </div>

      {/* status da conexão */}
      <div className={cn(
        'flex items-center gap-4 rounded-2xl border p-4',
        isConnected
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-amber-500/20 bg-amber-500/5',
      )}>
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          isConnected ? 'bg-green-500/15' : 'bg-amber-500/15',
        )}>
          {isConnected
            ? <Wifi className="h-5 w-5 text-green-500" />
            : <WifiOff className="h-5 w-5 text-amber-500" />
          }
        </div>
        <div>
          <p className={cn(
            'text-sm font-semibold',
            isConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400',
          )}>
            {isConnected ? 'WhatsApp conectado' : 'WhatsApp nao conectado'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isConnected
              ? `${conversationCount} conversa${conversationCount !== 1 ? 's' : ''} recebida${conversationCount !== 1 ? 's' : ''} via webhook`
              : 'Nenhuma mensagem recebida ainda. Siga os passos abaixo para conectar.'}
          </p>
        </div>
      </div>

      {/* credenciais */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Credenciais da integracao</h4>
        <CopyField label="URL do Webhook" value={webhookUrl} />
        {companyId && <CopyField label="Company ID (use no campo company_id)" value={companyId} />}
      </div>

      {/* passo a passo */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Como conectar (UazAPI)</h4>
        <ol className="space-y-3 text-sm text-muted-foreground">
          {[
            { step: 1, text: 'Acesse o painel da UazAPI e abra a instancia do seu WhatsApp.' },
            { step: 2, text: 'Va em Configuracoes → Webhooks e cole a URL do webhook acima.' },
            { step: 3, text: 'Ative os eventos: messages.upsert, message.received.' },
            { step: 4, text: 'No campo de payload customizado, inclua: "company_id": "<seu Company ID acima>".' },
            { step: 5, text: 'Envie uma mensagem de teste pelo WhatsApp e volte aqui para confirmar a conexao.' },
          ].map(({ step, text }) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {step}
              </span>
              <span className="leading-5">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* troubleshooting */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">Nao esta funcionando?</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
          <li>Verifique se o Company ID no payload e exatamente igual ao mostrado acima.</li>
          <li>Confirme que a URL do webhook nao tem espacos ou caracteres extras.</li>
          <li>Verifique se a instancia UazAPI esta ativa e o WhatsApp conectado (QR lido).</li>
          <li>Aguarde ate 1 minuto apos enviar a mensagem de teste e recarregue esta pagina.</li>
        </ul>
      </div>
    </div>
  );
}
