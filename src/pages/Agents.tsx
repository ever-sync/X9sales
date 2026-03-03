import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useCompany } from '../contexts/CompanyContext';
import type { Agent } from '../types';
import { CACHE } from '../config/constants';
import { Link } from 'react-router-dom';
import { User, ArrowRight, Plus, X } from 'lucide-react';

interface AgentForm {
  name: string;
  email: string;
  phone: string;
  external_id: string;
}

const emptyForm: AgentForm = { name: '', email: '', phone: '', external_id: '' };

export default function Agents() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ['agents', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: !!companyId,
    staleTime: CACHE.STALE_TIME,
  });

  const createAgent = useMutation({
    mutationFn: async (values: AgentForm) => {
      if (!companyId) throw new Error('Empresa não encontrada');
      const external_id = values.external_id.trim() || crypto.randomUUID();
      const { data, error } = await supabase
        .from('agents')
        .insert({
          company_id: companyId,
          name: values.name.trim(),
          email: values.email.trim() || null,
          phone: values.phone.trim() || null,
          external_id,
          is_active: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['agents', companyId] });
      setShowModal(false);
      setForm(emptyForm);
      navigate(`/agents/${id}`);
    },
    onError: (e: Error) => {
      setFormError(e.message);
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Nome é obrigatório');
      return;
    }
    createAgent.mutate(form);
  }, [form, createAgent]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setForm(emptyForm);
    setFormError(null);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Atendentes</h2>
          <p className="text-muted-foreground mt-1">Gerencie e analise o desempenho da equipe</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Atendente
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-6 animate-pulse">
              <div className="h-10 w-10 bg-secondary rounded-full mb-3" />
              <div className="h-5 bg-secondary rounded w-32 mb-2" />
              <div className="h-4 bg-muted rounded w-24" />
            </div>
          ))}
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Nenhum atendente cadastrado ainda.</p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="text-sm text-primary hover:underline font-medium"
          >
            Criar primeiro atendente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <Link
              key={agent.id}
              to={`/agents/${agent.id}`}
              className="bg-card rounded-2xl border border-border p-6 hover:shadow-md hover:border-primary/25 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {agent.avatar_url ? (
                    <img
                      src={agent.avatar_url}
                      alt={agent.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-accent rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {agent.name}
                    </p>
                    {agent.email && (
                      <p className="text-xs text-muted-foreground">{agent.email}</p>
                    )}
                    {agent.external_id && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{agent.external_id}</p>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Agent Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Novo Atendente</h3>
              <button type="button" onClick={closeModal} aria-label="Fechar" className="p-1 hover:bg-muted rounded-lg transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Ana Lima"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="ana@empresa.com"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Telefone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="5511999999999"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/35"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  ID Externo
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(deixe em branco para gerar automaticamente)</span>
                </label>
                <input
                  type="text"
                  value={form.external_id}
                  onChange={e => setForm(f => ({ ...f, external_id: e.target.value }))}
                  placeholder="ag01, ag02… ou UUID"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/35"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usado para identificar este atendente nos webhooks do UazAPI.
                </p>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-border text-foreground text-sm font-medium py-2 rounded-xl hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createAgent.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  {createAgent.isPending ? 'Criando...' : 'Criar Atendente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
