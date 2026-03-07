import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Filter,
  Pencil,
  PlusCircle,
  Search,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCompany } from '../contexts/CompanyContext';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../integrations/supabase/client';
import { CACHE } from '../config/constants';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { formatCurrency, formatDateTime, normalizePhone } from '../lib/utils';
import type { Agent, Customer, SaleRecord, Store as SalesStore } from '../types';

type SalesForm = {
  sellerAgentId: string;
  conversationId: string;
  quantity: string;
  marginAmount: string;
  soldAt: string;
  notes: string;
};

type SalesConversationOption = {
  id: string;
  agent_id: string | null;
  started_at: string | null;
  customer?: { name: string | null; phone: string | null } | null;
};

type SalesConversationOptionRow = {
  id: string;
  agent_id: string | null;
  started_at: string | null;
  customer?: Array<{ name: string | null; phone: string | null }> | { name: string | null; phone: string | null } | null;
};

type AgentRow = Omit<Agent, 'store'> & {
  store?: SalesStore[] | SalesStore | null;
};

type CustomerForm = {
  name: string;
  phone: string;
};

function emptyCustomerForm(): CustomerForm {
  return {
    name: '',
    phone: '',
  };
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function emptyForm(): SalesForm {
  return {
    sellerAgentId: '',
    conversationId: '',
    quantity: '1',
    marginAmount: '0.00',
    soldAt: toDatetimeLocal(new Date().toISOString()),
    notes: '',
  };
}

function saleToForm(sale: SaleRecord): SalesForm {
  return {
    sellerAgentId: sale.seller_agent_id ?? '',
    conversationId: sale.conversation_id ?? '',
    quantity: String(sale.quantity ?? 1),
    marginAmount: String(Number(sale.margin_amount ?? 0)),
    soldAt: toDatetimeLocal(sale.sold_at),
    notes: sale.notes ?? '',
  };
}

function SalesMetric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function Sales() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canCreateSale = can('revenue.run');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState<SalesForm>(() => emptyForm());
  const [conversationSearch, setConversationSearch] = useState('');
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(() => emptyCustomerForm());

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['sales-agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, company_id, member_id, store_id, external_id, name, email, phone, avatar_url, is_active, created_at, store:stores(id, company_id, name, is_active, created_at, updated_at)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return ((data ?? []) as AgentRow[]).map((agent) => ({
        ...agent,
        store: Array.isArray(agent.store) ? (agent.store[0] ?? null) : (agent.store ?? null),
      }));
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: stores = [] } = useQuery<SalesStore[]>({
    queryKey: ['sales-stores', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as SalesStore[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: conversationOptions = [] } = useQuery<SalesConversationOption[]>({
    queryKey: ['sales-conversation-options', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          agent_id,
          started_at,
          customer:customers(name,phone)
        `)
        .eq('company_id', companyId)
        .order('started_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as SalesConversationOptionRow[]).map((conversation) => ({
        id: conversation.id,
        agent_id: conversation.agent_id,
        started_at: conversation.started_at,
        customer: Array.isArray(conversation.customer)
          ? (conversation.customer[0] ?? null)
          : (conversation.customer ?? null),
      }));
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const { data: sales = [], isLoading } = useQuery<SaleRecord[]>({
    queryKey: ['sales-records', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('sales_records')
        .select(`
          *,
          seller:agents(id, name, avatar_url),
          conversation:conversations(
            id,
            started_at,
            customer:customers(name,phone)
          )
        `)
        .eq('company_id', companyId)
        .order('sold_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SaleRecord[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const storeOptions = useMemo(() => stores.map((store) => store.name), [stores]);

  const selectedSeller = useMemo(
    () => agents.find((agent) => agent.id === form.sellerAgentId) ?? null,
    [agents, form.sellerAgentId],
  );

  const selectedSellerStoreName = useMemo(() => {
    if (!selectedSeller) return '';
    if (selectedSeller.store?.name) return selectedSeller.store.name;
    if (!selectedSeller.store_id) return '';
    return stores.find((store) => store.id === selectedSeller.store_id)?.name ?? '';
  }, [selectedSeller, stores]);

  const filteredConversationOptions = useMemo(() => {
    const normalizedSearch = conversationSearch.trim().toLowerCase();

    return conversationOptions.filter((conversation) => {
      if (form.sellerAgentId && conversation.agent_id !== form.sellerAgentId) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        conversation.customer?.name,
        conversation.customer?.phone,
        conversation.started_at ? formatDateTime(conversation.started_at) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [conversationOptions, form.sellerAgentId, conversationSearch]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (sellerFilter && sale.seller_agent_id !== sellerFilter) return false;
      if (storeFilter && sale.store_name !== storeFilter) return false;
      if (dateFrom && sale.sold_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && sale.sold_at.slice(0, 10) > dateTo) return false;

      const haystack = [
        sale.seller?.name,
        sale.seller_name_snapshot,
        sale.store_name,
        sale.notes,
        sale.conversation?.customer?.name,
        sale.conversation?.customer?.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (search && !haystack.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [sales, sellerFilter, storeFilter, dateFrom, dateTo, search]);

  const totals = useMemo(() => {
    return filteredSales.reduce(
      (acc, sale) => {
        acc.quantity += sale.quantity;
        acc.margin += Number(sale.margin_amount ?? 0);
        return acc;
      },
      { quantity: 0, margin: 0, count: filteredSales.length },
    );
  }, [filteredSales]);

  const resetModalState = () => {
    setForm(emptyForm());
    setConversationSearch('');
    setCustomerForm(emptyCustomerForm());
    setShowCustomerForm(false);
    setEditingSaleId(null);
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setEditingSaleId(null);
    setForm(emptyForm());
    setConversationSearch('');
    setCustomerForm(emptyCustomerForm());
    setShowCustomerForm(false);
    setIsModalOpen(true);
  };

  const openEditModal = (sale: SaleRecord) => {
    setEditingSaleId(sale.id);
    setForm(saleToForm(sale));
    setConversationSearch('');
    setCustomerForm(emptyCustomerForm());
    setShowCustomerForm(false);
    setIsModalOpen(true);
  };

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa não selecionada.');
      if (!form.sellerAgentId) throw new Error('Selecione o vendedor.');

      const quantity = Number(form.quantity);
      const margin = Number(form.marginAmount.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade inválida.');
      if (!Number.isFinite(margin) || margin < 0) throw new Error('Margem inválida.');
      if (!form.soldAt) throw new Error('Informe a data da venda.');

      const selectedSeller = agents.find((agent) => agent.id === form.sellerAgentId);
      if (!selectedSellerStoreName) throw new Error('O vendedor precisa estar vinculado a uma loja no cadastro.');
      if (!selectedSeller) throw new Error('Vendedor não encontrado.');

      const { error } = await supabase
        .from('sales_records')
        .insert({
          company_id: companyId,
          seller_agent_id: form.sellerAgentId,
          conversation_id: form.conversationId || null,
          seller_name_snapshot: selectedSeller.name,
          store_name: selectedSellerStoreName,
          quantity,
          margin_amount: margin,
          sold_at: new Date(form.soldAt).toISOString(),
          notes: form.notes.trim() || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Venda registrada com sucesso.');
      resetModalState();
      queryClient.invalidateQueries({ queryKey: ['sales-records', companyId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao registrar venda.');
    },
  });

  const updateSaleMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa não selecionada.');
      if (!editingSaleId) throw new Error('Venda não selecionada.');
      if (!form.sellerAgentId) throw new Error('Selecione o vendedor.');

      const quantity = Number(form.quantity);
      const margin = Number(form.marginAmount.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade inválida.');
      if (!Number.isFinite(margin) || margin < 0) throw new Error('Margem inválida.');
      if (!form.soldAt) throw new Error('Informe a data da venda.');
      if (!selectedSeller) throw new Error('Vendedor não encontrado.');
      if (!selectedSellerStoreName) throw new Error('O vendedor precisa estar vinculado a uma loja no cadastro.');

      const { error } = await supabase
        .from('sales_records')
        .update({
          seller_agent_id: form.sellerAgentId,
          conversation_id: form.conversationId || null,
          seller_name_snapshot: selectedSeller.name,
          store_name: selectedSellerStoreName,
          quantity,
          margin_amount: margin,
          sold_at: new Date(form.soldAt).toISOString(),
          notes: form.notes.trim() || null,
        })
        .eq('id', editingSaleId)
        .eq('company_id', companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Venda atualizada com sucesso.');
      resetModalState();
      queryClient.invalidateQueries({ queryKey: ['sales-records', companyId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao atualizar venda.');
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (saleId: string) => {
      if (!companyId) throw new Error('Empresa não selecionada.');
      const { error } = await supabase
        .from('sales_records')
        .delete()
        .eq('id', saleId)
        .eq('company_id', companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Venda excluída com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['sales-records', companyId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir venda.');
    },
  });

  const createCustomerConversationMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa não selecionada.');
      if (!form.sellerAgentId) throw new Error('Selecione o vendedor antes de cadastrar o cliente.');

      const customerName = customerForm.name.trim();
      const customerPhone = normalizePhone(customerForm.phone);

      if (!customerName) throw new Error('Informe o nome do cliente.');
      if (customerPhone.length < 10) throw new Error('Informe um telefone válido.');

      let customerId: string | null = null;

      const { data: existingCustomer, error: existingCustomerError } = await supabase
        .from('customers')
        .select('id, company_id, external_id, name, phone, email')
        .eq('company_id', companyId)
        .eq('phone', customerPhone)
        .maybeSingle();
      if (existingCustomerError) throw existingCustomerError;

      if (existingCustomer) {
        customerId = (existingCustomer as Customer).id;
        const needsNameUpdate = !(existingCustomer as Customer).name?.trim();
        if (needsNameUpdate) {
          const { error: updateCustomerError } = await supabase
            .from('customers')
            .update({ name: customerName, external_id: (existingCustomer as Customer).external_id ?? customerPhone })
            .eq('id', customerId);
          if (updateCustomerError) throw updateCustomerError;
        }
      } else {
        const { data: createdCustomer, error: createCustomerError } = await supabase
          .from('customers')
          .insert({
            company_id: companyId,
            name: customerName,
            phone: customerPhone,
            external_id: customerPhone,
          })
          .select('id')
          .single();
        if (createCustomerError) throw createCustomerError;
        customerId = createdCustomer.id as string;
      }

      const { data: existingConversation, error: existingConversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_id', customerId)
        .eq('agent_id', form.sellerAgentId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingConversationError) throw existingConversationError;

      if (existingConversation?.id) {
        return existingConversation.id as string;
      }

      const { data: createdConversation, error: createConversationError } = await supabase
        .from('conversations')
        .insert({
          company_id: companyId,
          agent_id: form.sellerAgentId,
          customer_id: customerId,
          channel: 'whatsapp',
          status: 'active',
          started_at: new Date().toISOString(),
          message_count_in: 0,
          message_count_out: 0,
        })
        .select('id')
        .single();
      if (createConversationError) throw createConversationError;

      return createdConversation.id as string;
    },
    onSuccess: (conversationId) => {
      toast.success('Cliente e conversa cadastrados com sucesso.');
      setShowCustomerForm(false);
      setCustomerForm(emptyCustomerForm());
      setForm((current) => ({ ...current, conversationId }));
      queryClient.invalidateQueries({ queryKey: ['sales-conversation-options', companyId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao cadastrar cliente.');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <PlusCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Registrar Venda</h2>
            <p className="mt-1 text-muted-foreground">Liste, filtre e adicione novas vendas da operação.</p>
          </div>
        </div>

        {canCreateSale && (
          <Button
            type="button"
            onClick={openCreateModal}
            className="h-11 rounded-full bg-primary px-5 text-[#171717] hover:bg-primary/90"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar nova venda
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SalesMetric title="Vendas filtradas" value={String(totals.count)} hint="Quantidade de registros no recorte atual." />
        <SalesMetric title="Peças vendidas" value={String(totals.quantity)} hint="Soma total de peças das vendas filtradas." />
        <SalesMetric title="Margem total" value={formatCurrency(totals.margin)} hint="Margem acumulada no período filtrado." />
      </div>

      <div className="rounded-[28px] border border-border/70 bg-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <Filter className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Filtros</p>
            <p className="text-xs text-muted-foreground">Refine a lista por vendedor, loja, data ou texto.</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por vendedor, loja ou observação"
              className="h-11 rounded-xl pl-10"
            />
          </label>

          <select
            value={sellerFilter}
            onChange={(event) => setSellerFilter(event.target.value)}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none"
          >
            <option value="">Todos os vendedores</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <select
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value)}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none"
          >
            <option value="">Todas as lojas</option>
            {storeOptions.map((storeName) => (
              <option key={storeName} value={storeName}>{storeName}</option>
            ))}
          </select>

          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-11 rounded-xl" />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-11 rounded-xl" />
        </div>
      </div>

      <div className="rounded-[28px] border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="text-lg font-semibold text-foreground">Lista de vendas</p>
            <p className="text-sm text-muted-foreground">{filteredSales.length} registro{filteredSales.length !== 1 ? 's' : ''} encontrados.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="px-5 py-14 text-center text-muted-foreground">
            Nenhuma venda encontrada para os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {filteredSales.map((sale) => (
              <div key={sale.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{sale.seller?.name ?? sale.seller_name_snapshot}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {sale.store_name}
                      </span>
                    </div>
                    {canCreateSale && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3"
                          onClick={() => openEditModal(sale)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            if (window.confirm('Excluir esta venda? Esta ação não pode ser desfeita.')) {
                              deleteSaleMutation.mutate(sale.id);
                            }
                          }}
                          disabled={deleteSaleMutation.isPending}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{sale.notes || 'Sem observações adicionais.'}</p>
                  {sale.conversation && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conversa: {sale.conversation.customer?.name || sale.conversation.customer?.phone || sale.conversation.id.slice(0, 8)}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-background px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendedor</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{sale.seller?.name ?? sale.seller_name_snapshot}</p>
                </div>

                <div className="rounded-2xl bg-background px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Quantidade</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{sale.quantity} peça{sale.quantity !== 1 ? 's' : ''}</p>
                </div>

                <div className="rounded-2xl bg-background px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Margem</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(Number(sale.margin_amount ?? 0))}</p>
                </div>

                <div className="rounded-2xl bg-background px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Data/Hora</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDateTime(sale.sold_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-4xl rounded-[30px] border border-border/70 bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/70 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15">
                  <PlusCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">{editingSaleId ? 'Editar Venda' : 'Registrar Venda'}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Adicione uma nova venda à corrida semanal.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetModalState}
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6">
              <div className="rounded-[28px] border border-border/70 bg-background/70 p-6">
                <h4 className="text-2xl font-semibold text-foreground">{editingSaleId ? 'Editar Venda' : 'Nova Venda'}</h4>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Vendedor *</span>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <select
                        value={form.sellerAgentId}
                        onChange={(event) => {
                          setForm((current) => ({ ...current, sellerAgentId: event.target.value, conversationId: '' }));
                          setConversationSearch('');
                        }}
                        className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none"
                      >
                        <option value="">Selecione o vendedor</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Conversa que fez a venda</span>
                    <Input
                      value={conversationSearch}
                      onChange={(event) => setConversationSearch(event.target.value)}
                      placeholder="Busque por nome, telefone ou data da conversa"
                      className="h-12 rounded-xl"
                    />
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <select
                        value={form.conversationId}
                        onChange={(event) => setForm((current) => ({ ...current, conversationId: event.target.value }))}
                        className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none"
                      >
                        <option value="">Selecione a conversa</option>
                        {filteredConversationOptions.map((conversation) => (
                          <option key={conversation.id} value={conversation.id}>
                            {(conversation.customer?.name || conversation.customer?.phone || conversation.id.slice(0, 8))} {conversation.started_at ? `· ${formatDateTime(conversation.started_at)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Se não existir conversa, cadastre o cliente e gere uma conversa base.
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCustomerForm((current) => !current)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {showCustomerForm ? 'Ocultar cadastro' : 'Cadastrar cliente'}
                      </button>
                    </div>
                  </label>

                </div>

                <div className="mt-4 rounded-2xl border border-border/70 bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <Store className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Loja da venda</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {selectedSellerStoreName || 'Selecione um vendedor com loja vinculada'}
                      </p>
                    </div>
                  </div>
                </div>

                {showCustomerForm && (
                  <div className="mt-4 rounded-[24px] border border-border/70 bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Cadastrar cliente</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cria o cliente e uma conversa inicial no mesmo padrão usado nas conversas do WhatsApp.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-foreground">Nome do cliente *</span>
                        <Input
                          value={customerForm.name}
                          onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Ex: João Trabalho"
                          className="h-12 rounded-xl"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-foreground">Telefone *</span>
                        <Input
                          value={customerForm.phone}
                          onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="5511999999999"
                          className="h-12 rounded-xl"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => createCustomerConversationMutation.mutate()}
                        disabled={createCustomerConversationMutation.isPending}
                        className="rounded-xl"
                      >
                        {createCustomerConversationMutation.isPending ? 'Cadastrando...' : 'Cadastrar cliente'}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Quantidade (peças) *</span>
                    <Input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                      className="h-12 rounded-xl"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Margem (R$) *</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.marginAmount}
                      onChange={(event) => setForm((current) => ({ ...current, marginAmount: event.target.value }))}
                      className="h-12 rounded-xl"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Data/Hora *</span>
                    <div className="relative">
                      <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="datetime-local"
                        value={form.soldAt}
                        onChange={(event) => setForm((current) => ({ ...current, soldAt: event.target.value }))}
                        className="h-12 rounded-xl pl-10"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-4 space-y-2">
                  <span className="text-sm font-semibold text-foreground">Observações</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Informações adicionais sobre a venda..."
                    rows={4}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => (editingSaleId ? updateSaleMutation.mutate() : createSaleMutation.mutate())}
                  disabled={createSaleMutation.isPending || updateSaleMutation.isPending}
                  className="mt-5 h-12 w-full rounded-2xl bg-primary text-[#171717] hover:bg-primary/90"
                >
                  {(createSaleMutation.isPending || updateSaleMutation.isPending) && <TrendingUp className="mr-2 h-4 w-4 animate-pulse" />}
                  {editingSaleId ? 'Salvar alterações' : 'Registrar Venda'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
